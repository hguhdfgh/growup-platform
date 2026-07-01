const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

function api(path, opts) {
  return fetch(supabaseUrl + path, {
    headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json', ...(opts?.headers || {}) },
    ...(opts?.method ? { method: opts.method } : {}),
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {})
  })
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

    const { order_id, admin_note } = await req.json()
    if (!order_id) return new Response(JSON.stringify({ error: 'order_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    // Verify staff
    const userRes = await api('/auth/v1/user', { headers: { 'Authorization': authHeader } })
    if (!userRes.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    const user = await userRes.json()

    const staffRes = await api('/rest/v1/staff_users?id=eq.' + user.id + '&active=eq.true&select=*')
    const staffList = await staffRes.json()
    const staff = staffList?.[0]
    if (!staff || !['OWNER', 'ADMIN'].includes(staff.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    // Get order
    const orderRes = await api('/rest/v1/orders?id=eq.' + order_id + '&select=*')
    const orders = await orderRes.json()
    const order = orders?.[0]
    if (!order) return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    if (order.status === 'DELIVERED') return new Response(JSON.stringify({ ok: true, message: 'Already delivered' }), { headers: { 'Content-Type': 'application/json' } })

    // Get delivery payload
    const delRes = await api('/rest/v1/delivery_payloads?order_id=eq.' + order_id + '&select=*')
    const delList = await delRes.json()
    const delivery = delList?.[0]
    if (!delivery) return new Response(JSON.stringify({ error: 'No delivery payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

    // Decrypt payload (using base64 decode + pgp_sym_decrypt via API)
    const decryptRes = await api('/rest/v1/rpc/decrypt_payload', {
      method: 'POST', body: { encrypted_text: delivery.payload_encrypted, secret_key: Deno.env.get('PAYLOAD_ENCRYPTION_KEY') }
    })
    const payloadText = decryptRes.ok ? await decryptRes.text() : '⚠️ Could not decrypt'

    // Send email via Resend
    const locale = order.locale || 'ar'
    const customerEmail = order.customer_email
    const subject = locale === 'ar' ? 'تم تسليم طلبك - GrowUp Agency' : 'Votre commande est livree - GrowUp Agency'
    const html = locale === 'ar'
      ? '<div dir=rtl style=font-family:sans-serif;padding:2rem><h1 style=color:#0071e3>تم تسليم طلبك!</h1><p>مرحبا، هذا هو حسابك:</p><div style=background:#f5f5f7;border-radius:12px;padding:1.5rem;margin:1.5rem 0;font-family:monospace>' + payloadText + '</div><p>رقم الطلب: ' + order.order_number + '</p></div>'
      : '<div style=font-family:sans-serif;padding:2rem><h1 style=color:#0071e3>Votre commande est livree!</h1><p>Voici votre compte:</p><div style=background:#f5f5f7;border-radius:12px;padding:1.5rem;margin:1.5rem 0;font-family:monospace>' + payloadText + '</div><p>Numero: ' + order.order_number + '</p></div>'

    if (RESEND_API_KEY && RESEND_API_KEY !== 're_placeholder') {
      await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'GrowUp Agency <noreply@yourdomain.com>', to: customerEmail, subject, html })
      })
    }

    // Update status
    await api('/rest/v1/orders?id=eq.' + order_id, { method: 'PATCH', body: { status: 'DELIVERED', admin_note: admin_note || null, updated_at: new Date().toISOString() } })
    await api('/rest/v1/delivery_payloads?order_id=eq.' + order_id, { method: 'PATCH', body: { delivery_email_sent: true, delivered_at: new Date().toISOString() } })

    // Audit log
    await api('/rest/v1/audit_log', { method: 'POST', body: { actor_id: user.id, actor_email: staff.email, action: 'APPROVE_AND_DELIVER', target_table: 'orders', target_id: order_id } })

    return new Response(JSON.stringify({ ok: true, message: 'تم التسليم' }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})