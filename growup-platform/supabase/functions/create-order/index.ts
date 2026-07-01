const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function req(path, body) {
  const opts = { method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  return fetch(supabaseUrl + path, opts)
}

Deno.serve(async (req) => {
  try {
    const { product_id, coupon_code, customer_email, customer_phone, customer_whatsapp, payment_method_id, locale } = await req.json()
    
    if (!product_id || !customer_email || !payment_method_id) {
      return new Response(JSON.stringify({ error: 'الحقول المطلوبة غير مكتملة' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Get product
    const prodRes = await fetch(supabaseUrl + '/rest/v1/products?id=eq.' + product_id + '&status=eq.active&select=*', {
      headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
    })
    const products = await prodRes.json()
    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ error: 'المنتج غير متاح' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const product = products[0]

    // Get payment method
    const pmRes = await fetch(supabaseUrl + '/rest/v1/payment_methods?id=eq.' + payment_method_id + '&active=eq.true&select=*', {
      headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
    })
    const pmethods = await pmRes.json()
    if (!pmethods || pmethods.length === 0) {
      return new Response(JSON.stringify({ error: 'طريقة الدفع غير متاحة' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const paymentMethod = pmethods[0]

    // Calculate price
    let discount = 0
    let coupon_data = null
    if (coupon_code) {
      const cRes = await fetch(supabaseUrl + '/rest/v1/coupons?code=eq.' + coupon_code.toUpperCase() + '&active=eq.true&select=*', {
        headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
      })
      const coupons = await cRes.json()
      if (coupons && coupons.length > 0) {
        const coupon = coupons[0]
        discount = coupon.type === 'PERCENT' ? Math.round(product.price_dzd * coupon.value / 100) : Math.min(coupon.value, product.price_dzd)
        coupon_data = { code: coupon.code, type: coupon.type, value: coupon.value, discount_amount: discount }
        // Increment usage
        await fetch(supabaseUrl + '/rest/v1/coupons?id=eq.' + coupon.id, {
          method: 'PATCH', headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ used_count: (coupon.used_count || 0) + 1 })
        })
      }
    }

    const final_price = product.price_dzd - discount

    // Get or create customer
    let customerId = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: { 'apikey': supabaseKey, 'Authorization': authHeader }
      })
      if (userRes.ok) {
        const user = await userRes.json()
        customerId = user.id
        await fetch(supabaseUrl + '/rest/v1/customers', {
          method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({ id: user.id, email: customer_email, phone: customer_phone || null, whatsapp: customer_whatsapp || null, locale: locale || 'ar' })
        })
      }
    }

    // Create order
    const orderRes = await fetch(supabaseUrl + '/rest/v1/orders', {
      method: 'POST', headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        customer_id: customerId, customer_email, customer_phone: customer_phone || null, customer_whatsapp: customer_whatsapp || null,
        product_id: product.id, product_snapshot: { name_ar: product.name_ar, name_fr: product.name_fr, price_dzd: product.price_dzd, slug: product.slug },
        coupon_snapshot: coupon_data, original_price_dzd: product.price_dzd, discount_dzd: discount, final_price_dzd: final_price,
        payment_method_id: paymentMethod.id, payment_method_snapshot: { label_ar: paymentMethod.label_ar, label_fr: paymentMethod.label_fr, instructions_ar: paymentMethod.instructions_ar, instructions_fr: paymentMethod.instructions_fr, account_fields: paymentMethod.account_fields },
        locale: locale || 'ar', status: 'PENDING_PAYMENT'
      })
    })
    const order = await orderRes.json()

    return new Response(JSON.stringify({
      order_id: order.id, order_number: order.order_number, final_price_dzd: order.final_price_dzd,
      payment_instructions: locale === 'ar' ? paymentMethod.instructions_ar : paymentMethod.instructions_fr
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})