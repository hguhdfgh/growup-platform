;(function () {
  'use strict'

  const SUPABASE_URL = 'https://kqjdxeepusiipewwlzxs.supabase.co'
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxamR4ZWVwdXNpaXBld3dsenhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjA3NjgsImV4cCI6MjA5ODMzNjc2OH0.n3dVbCX-8Veyd3levBepO0CHtaCFqRJDj-ns7IiUkx0'

  const FB_PIXEL_ID = '877051215139937'
  const CAPI_ENDPOINT = 'https://kqjdxeepusiipewwlzxs.supabase.co/functions/v1/facebook-capi'

  let supabase = null
  let settings = null
  let currentProduct = null
  const FALLBACK_PRODUCT_ID = '384d5f4a-530e-4147-93e1-f67c5748f194'
  const FALLBACK_PRODUCT_PRICE = 5900

  const DRAFT_DEBOUNCE_MS = 800
  let draftTimer = null
  let draftId = null

  function $(id) { return document.getElementById(id) }
  function q(s) { return document.querySelector(s) }
  function qa(s) { return document.querySelectorAll(s) }

  function fireFbq(eventName, params) {
    if (typeof fbq === 'function') {
      fbq('track', eventName, params || {})
    }
  }

  async function sendCAPI(eventName, email, customData) {
    try {
      await fetch(CAPI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_name: eventName, email: email || '', custom_data: customData || {} })
      })
    } catch (e) {}
  }

  function trackPixel(eventName, params, email) {
    fireFbq(eventName, params)
    sendCAPI(eventName, email || '', params)
  }

  function getProductPrice() {
    return currentProduct ? currentProduct.price : FALLBACK_PRODUCT_PRICE
  }

  async function init() {
    loadFromCache()

    supabase = window.supabase?.createClient
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
      : null

    setupCheckoutHooks()

    if (!supabase) {
      console.warn('Supabase client not available — page will use static content')
      return
    }

    await Promise.all([loadSettings(), loadProducts()])
    saveToCache()
    trackPageView()

    wrapOpenCheckout()
    wrapNextStep()
    setupDraftAutoSave()
  }

  function wrapOpenCheckout() {
    var origOpen = window.openCheckout
    if (typeof origOpen === 'function') {
      window.openCheckout = function () {
        origOpen()
        trackPixel('InitiateCheckout', { value: getProductPrice(), currency: 'DZD' })
        saveDraft()
      }
    }
  }

  function wrapNextStep() {
    var origNext = window.nextStep
    if (typeof origNext === 'function') {
      window.nextStep = function () {
        if (currentStep === 1) {
          trackPixel('AddPaymentInfo', { value: getProductPrice(), currency: 'DZD' })
        }
        origNext()
        saveDraft()
      }
    }
  }

  function loadFromCache() {
    try {
      var cached = localStorage.getItem('growup_cache')
      if (!cached) return
      var data = JSON.parse(cached)
      if (data.settings) {
        settings = data.settings
        if (data.settings.payment_accounts) updatePaymentDetails(data.settings.payment_accounts)
      }
      if (data.product) {
        currentProduct = data.product
        applyProductPrice(data.product.price)
      }
    } catch (e) { }
  }

  function saveToCache() {
    try {
      localStorage.setItem('growup_cache', JSON.stringify({
        settings: settings,
        product: currentProduct,
        cachedAt: Date.now()
      }))
    } catch (e) { }
  }

  function applyProductPrice(price) {
    qa('.price-tag, .fc-price, .final-price .amount, .order-summary .total span:last-child, .price-stamp').forEach(function(el) {
      el.textContent = price + ' DZD'
    })
  }

  async function loadSettings() {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .single()

    if (error || !data) return
    settings = data

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
    applyProductPrice(data[0].price)
    trackPixel('ViewContent', {
      id: data[0].id,
      value: data[0].price,
      currency: 'DZD',
      content_name: data[0].name || 'TikTok Agency'
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

  function getSessionId() {
    var id = sessionStorage.getItem('session_id')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('session_id', id)
    }
    return id
  }

  function getFormData() {
    return {
      session_id: getSessionId(),
      customer_name: ($('fullName')?.value || '').trim(),
      email: ($('email')?.value || '').trim(),
      phone: ($('phone')?.value || '').trim(),
      product_id: currentProduct ? currentProduct.id : FALLBACK_PRODUCT_ID,
      product_name: currentProduct ? (currentProduct.name || '') : '',
      product_price: currentProduct ? currentProduct.price : FALLBACK_PRODUCT_PRICE,
      current_step: typeof currentStep !== 'undefined' ? currentStep : 1,
      completion_pct: typeof currentStep !== 'undefined' ? Math.min(currentStep * 33, 99) : 0,
      city: ($('city')?.value || '').trim()
    }
  }

  async function saveDraft() {
    if (!supabase) return
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(async function () {
      var data = getFormData()
      if (!data.customer_name && !data.email && !data.phone) return
      try {
        var result
        if (draftId) {
          var { data: updated, error } = await supabase
            .from('abandoned_orders')
            .update(data)
            .eq('id', draftId)
            .select()
          if (!error && updated && updated[0]) draftId = updated[0].id
        } else {
          var { data: inserted, error } = await supabase
            .from('abandoned_orders')
            .insert(data)
            .select()
          if (!error && inserted && inserted[0]) draftId = inserted[0].id
        }
      } catch (e) {}
    }, DRAFT_DEBOUNCE_MS)
  }

  async function deleteDraft() {
    if (!supabase || !draftId) return
    try {
      await supabase.from('abandoned_orders').delete().eq('id', draftId)
      draftId = null
    } catch (e) {}
  }

  function setupDraftAutoSave() {
    var fields = ['fullName', 'email', 'phone', 'city']
    fields.forEach(function (id) {
      var el = $(id)
      if (el) el.addEventListener('input', saveDraft)
    })
  }

  function setupCheckoutHooks() {
    window.submitOrder = function () {
      showStep(3)
      var email = ($('email')?.value || '').trim()
      trackPixel('Lead', { value: FALLBACK_PRODUCT_PRICE, currency: 'DZD' }, email)
      if (supabase) {
        submitOrderToSupabase().then(function () {
          deleteDraft()
          trackPixel('Purchase', { value: FALLBACK_PRODUCT_PRICE, currency: 'DZD' }, email)
        }).catch(function (e) {
          console.error('Order submission error:', e)
        })
      } else {
        deleteDraft()
      }
    }
  }

  async function uploadFile(file) {
    const ext = file.name.split('.').pop()
    const path = 'proofs/' + Date.now() + '-' + Math.random().toString(36).substring(2, 8) + '.' + ext
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
  }

  function trackPageView() {
    var sessionId = sessionStorage.getItem('session_id') || crypto.randomUUID()
    sessionStorage.setItem('session_id', sessionId)

    if (!supabase) return

    var page = window.location.pathname
    if (!sessionStorage.getItem('page_viewed_' + page)) {
      sessionStorage.setItem('page_viewed_' + page, '1')
      supabase.from('analytics_events').insert({
        event_type: 'page_view',
        session_id: sessionId,
        page_url: page,
        metadata: { referrer: document.referrer || null }
      }).catch(function () {})
    }
  }

  function trackEvent(type, metadata) {
    if (!supabase) return
    var sessionId = sessionStorage.getItem('session_id') || ''
    supabase.from('analytics_events').insert({
      event_type: type,
      session_id: sessionId,
      page_url: window.location.pathname,
      metadata: metadata || {}
    }).catch(function () {})
  }

  document.addEventListener('click', function (e) {
    var cta = e.target.closest('[onclick*="openCheckout"]')
    if (cta) {
      trackEvent('cta_click', { button_text: cta.textContent?.trim().substring(0, 50) })
      trackPixel('Contact', { content_name: 'cta_click' })
    }
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
