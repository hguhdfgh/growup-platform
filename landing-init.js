/* Landing Page — Supabase Integration Layer */
;(function () {
  'use strict'

  const SUPABASE_URL = 'https://kqjdxeepusiipewwlzxs.supabase.co'
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxamR4ZWVwdXNpaXBld3dsenhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjA3NjgsImV4cCI6MjA5ODMzNjc2OH0.n3dVbCX-8Veyd3levBepO0CHtaCFqRJDj-ns7IiUkx0'

  let supabase = null
  let settings = null
  let currentProduct = null
  const FALLBACK_PRODUCT_ID = '384d5f4a-530e-4147-93e1-f67c5748f194'
  const FALLBACK_PRODUCT_PRICE = 5900
  let currentOrderData = {}

  function $(id) { return document.getElementById(id) }
  function q(s) { return document.querySelector(s) }
  function qa(s) { return document.querySelectorAll(s) }

  async function init() {
    supabase = window.supabase?.createClient
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
      : null

    setupCheckoutHooks()

    if (!supabase) {
      console.warn('Supabase client not available — page will use static content')
      return
    }

    await Promise.all([loadSettings(), loadProducts()])
    trackPageView()
  }

  async function loadSettings() {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .single()

    if (error || !data) return
    settings = data

    // Update payment info placeholders
    if (data.payment_accounts) {
      updatePaymentDetails(data.payment_accounts)
    }
  }

  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(1)

    if (error || !data || !data[0]) return
    currentProduct = data[0]

    const price = new Intl.NumberFormat('ar-DZ').format(data[0].price)
    const priceEls = qa('.price-tag, .fc-price, .final-price .amount, .order-summary .total span:last-child')
    priceEls.forEach(el => {
      if (el.classList.contains('amount')) {
        el.textContent = price + ' دج'
      } else if (el.classList.contains('fc-price')) {
        el.textContent = price + ' دج'
      } else if (el.tagName === 'SPAN' && el.closest('.total')) {
        el.textContent = price + ' دج'
      } else {
        el.textContent = price + ' دج'
      }
    })
  }

  function updatePaymentDetails(paymentAccounts) {
    const methods = qa('.payment-method')
    methods.forEach(m => {
      const method = m.dataset.method
      const info = paymentAccounts[method]
      if (!info) return
      const acc = info.account || info.number || ''
      m.querySelector('span').textContent = info.label || method
      if (acc) m.dataset.account = acc
    })
  }

  function setupCheckoutHooks() {
    window.submitOrder = function () {
      showStep(3)
      if (supabase) {
        submitOrderToSupabase().catch(function (e) {
          console.error('Order submission error:', e)
        })
      }
    }
  }

  async function uploadFile(file) {
    const ext = file.name.split('.').pop()
    const path = `proofs/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
    const { error } = await supabase.storage
      .from('payment-proofs')
      .upload(path, file, { upsert: false })

    if (error) {
      console.error('Upload error:', error)
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from('payment-proofs')
      .getPublicUrl(path)

    return publicUrl
  }

  async function submitOrderToSupabase() {
    const name = ($('fullName')?.value || '').trim()
    const email = ($('email')?.value || '').trim()
    const phone = ($('phone')?.value || '').trim()

    if (!name || !email) {
      alert('يرجى ملء الاسم والبريد الإلكتروني')
      return
    }

    const productId = currentProduct ? currentProduct.id : FALLBACK_PRODUCT_ID
    const productPrice = currentProduct ? currentProduct.price : FALLBACK_PRODUCT_PRICE

    const { data: customer, error: custError } = await supabase
      .from('customers')
      .upsert({
        full_name: name,
        email: email,
        phone: phone,
        source: 'direct'
      }, { onConflict: 'email', ignoreDuplicates: false })
      .select()
      .single()

    if (custError || !customer?.id) {
      console.error('Customer error:', custError || 'No ID returned')
      alert('حدث خطأ أثناء تسجيل بياناتك. حاول مرة أخرى.')
      return
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id: customer.id,
        product_id: productId,
        customer_name: name,
        email: email,
        phone: phone,
        amount: productPrice,
        payment_method: 'baridimob',
        payment_proof_url: null,
        status: 'pending'
      })
      .select()
      .single()

    if (orderError) {
      console.error('Order error:', orderError)
      alert('حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى.')
      return
    }

    trackEvent('order_submitted', { order_id: order.id, amount: productPrice })

    showStep(3)
  }

  function trackPageView() {
    const sessionId = sessionStorage.getItem('session_id') || crypto.randomUUID()
    sessionStorage.setItem('session_id', sessionId)

    if (!supabase) return

    const page = window.location.pathname
    if (!sessionStorage.getItem('page_viewed_' + page)) {
      sessionStorage.setItem('page_viewed_' + page, '1')
      supabase.from('analytics_events').insert({
        event_type: 'page_view',
        session_id: sessionId,
        page_url: page,
        metadata: { referrer: document.referrer || null }
      }).catch(() => {})
    }
  }

  function trackEvent(type, metadata) {
    if (!supabase) return
    const sessionId = sessionStorage.getItem('session_id') || ''
    supabase.from('analytics_events').insert({
      event_type: type,
      session_id: sessionId,
      page_url: window.location.pathname,
      metadata: metadata || {}
    }).catch(() => {})
  }

  // CTA click tracking
  document.addEventListener('click', function (e) {
    const cta = e.target.closest('[onclick*="openCheckout"]')
    if (cta) {
      trackEvent('cta_click', { button_text: cta.textContent?.trim().substring(0, 50) })
    }
  })

  // Init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
