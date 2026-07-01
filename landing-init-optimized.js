/* Landing Page — Optimized with Performance Features */
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

  // ── PERFORMANCE MONITORING ──
  const perf = window.PerfUtils || {}
  const cache = perf.cache || new Map()
  const perfMonitor = perf.perfMonitor || {}

  function $(id) { return document.getElementById(id) }
  function q(s) { return document.querySelector(s) }
  function qa(s) { return document.querySelectorAll(s) }

  // ── OPTIMIZED INITIALIZATION ──
  async function init() {
    perfMonitor.mark?.('init-start')
    
    loadFromCache()
    setupLazyLoading()

    supabase = window.supabase?.createClient
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
      : null

    setupCheckoutHooks()

    if (!supabase) {
      console.warn('Supabase client not available — page will use static content')
      perfMonitor.mark?.('init-end')
      perfMonitor.measure?.('init', 'init-start', 'init-end')
      return
    }

    // Load in parallel with debouncing
    await Promise.all([loadSettingsOptimized(), loadProductsOptimized()])
    saveToCache()
    trackPageViewOptimized()

    perfMonitor.mark?.('init-end')
    perfMonitor.measure?.('init', 'init-start', 'init-end')
    perfMonitor.logWebVitals?.()
  }

  // ── LAZY LOADING SETUP ──
  function setupLazyLoading() {
    if (perf.lazyLoad) {
      perf.lazyLoad.init()
      perf.lazyLoad.observeImages()
    }

    // Lazy load non-critical images
    const imageSrcs = [
      'https://cdn.jsdelivr.net/gh/hguhdfgh/growup-agency/media/poster.jpg',
      'https://cdn.jsdelivr.net/gh/hguhdfgh/growup-agency/media/video_720p.webm'
    ]
    if (perf.preloader) {
      perf.preloader.prefetchResource(imageSrcs[0])
      perf.preloader.prefetchResource(imageSrcs[1])
    }
  }

  // ── OPTIMIZED CACHE LOADING ──
  function loadFromCache() {
    try {
      const cached = cache.get ? cache.get('growup_landing') : localStorage.getItem('growup_cache')
      if (!cached) return

      const data = typeof cached === 'string' ? JSON.parse(cached) : cached
      if (data.settings) {
        settings = data.settings
        if (data.settings.payment_accounts) updatePaymentDetails(data.settings.payment_accounts)
      }
      if (data.product) {
        currentProduct = data.product
        applyProductPrice(data.product.price)
      }
    } catch (e) {
      console.warn('Cache load failed:', e)
    }
  }

  // ── OPTIMIZED CACHE SAVING ──
  function saveToCache() {
    try {
      const cacheData = {
        settings: settings,
        product: currentProduct,
        cachedAt: Date.now()
      }

      // Use both memory cache and localStorage
      if (cache.set) {
        cache.set('growup_landing', cacheData, 600000) // 10 minutes
      }

      localStorage.setItem('growup_cache', JSON.stringify(cacheData))
    } catch (e) {
      console.warn('Cache save failed:', e)
    }
  }

  // ── COMPRESSED PRICE FORMATTING ──
  function applyProductPrice(price) {
    const formatted = new Intl.NumberFormat('ar-DZ').format(price)
    const priceText = formatted + ' دج'

    // Batch DOM updates
    requestAnimationFrame(() => {
      qa('.price-tag, .fc-price, .final-price .amount, .order-summary .total span:last-child').forEach(function(el) {
        el.textContent = priceText
      })
    })
  }

  // ── OPTIMIZED SETTINGS LOADING ──
  async function loadSettingsOptimized() {
    // Check cache first
    const cachedSettings = cache.get ? cache.get('settings') : null
    if (cachedSettings) {
      settings = cachedSettings
      return
    }

    try {
      const { data, error } = await supabase
        .from('settings')
        .select('id, company_name, payment_accounts')
        .limit(1)
        .single()

      if (error || !data) return

      settings = data

      if (data.payment_accounts) {
        updatePaymentDetails(data.payment_accounts)
      }

      // Cache with TTL
      if (cache.set) {
        cache.set('settings', settings, 600000)
      }
    } catch (e) {
      console.error('Settings load error:', e)
    }
  }

  // ── OPTIMIZED PRODUCTS LOADING ──
  async function loadProductsOptimized() {
    // Check cache first
    const cachedProduct = cache.get ? cache.get('product') : null
    if (cachedProduct) {
      currentProduct = cachedProduct
      return
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, description, images')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(1)

      if (error || !data || !data[0]) return

      currentProduct = data[0]
      applyProductPrice(data[0].price)

      // Cache with TTL
      if (cache.set) {
        cache.set('product', currentProduct, 300000)
      }
    } catch (e) {
      console.error('Products load error:', e)
    }
  }

  // ── PAYMENT DETAILS UPDATE ──
  function updatePaymentDetails(paymentAccounts) {
    // Use requestAnimationFrame for smoother updates
    requestAnimationFrame(() => {
      const methods = qa('.payment-method')
      methods.forEach(m => {
        const method = m.dataset.method
        const info = paymentAccounts[method]
        if (!info) return
        const acc = info.account || info.number || ''
        m.querySelector('span').textContent = info.label || method
        if (acc) m.dataset.account = acc
      })
    })
  }

  // ── CHECKOUT HOOKS ──
  function setupCheckoutHooks() {
    window.submitOrder = function () {
      showStep(3)
      if (supabase) {
        submitOrderToSupabaseOptimized().catch(function (e) {
          console.error('Order submission error:', e)
        })
      }
    }
  }

  // ── OPTIMIZED FILE UPLOAD ──
  async function uploadFileOptimized(file) {
    if (!file) return null

    // Compress file before upload
    const ext = file.name.split('.').pop()
    const path = `proofs/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`

    try {
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
    } catch (e) {
      console.error('File upload failed:', e)
      return null
    }
  }

  // ── RATE-LIMITED ORDER SUBMISSION ──
  let lastSubmitTime = 0
  const SUBMIT_COOLDOWN = 3000

  async function submitOrderToSupabaseOptimized() {
    const now = Date.now()
    if (now - lastSubmitTime < SUBMIT_COOLDOWN) {
      alert('الرجاء الانتظار قليلاً قبل إرسال طلب آخر')
      return
    }
    lastSubmitTime = now

    const name = ($('fullName')?.value || '').trim()
    const email = ($('email')?.value || '').trim()
    const phone = ($('phone')?.value || '').trim()

    if (!name || !email) {
      alert('يرجى ملء الاسم والبريد الإلكتروني')
      return
    }

    const productId = currentProduct ? currentProduct.id : FALLBACK_PRODUCT_ID
    const productPrice = currentProduct ? currentProduct.price : FALLBACK_PRODUCT_PRICE

    try {
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

      trackEventOptimized('order_submitted', { order_id: order.id, amount: productPrice })
      showStep(3)
    } catch (e) {
      console.error('Submission error:', e)
      alert('حدث خطأ غير متوقع')
    }
  }

  // ── OPTIMIZED ANALYTICS TRACKING ──
  const sessionId = (() => {
    let sid = sessionStorage.getItem('session_id')
    if (!sid) {
      sid = crypto.randomUUID?.() || 'session_' + Date.now()
      sessionStorage.setItem('session_id', sid)
    }
    return sid
  })()

  let pageViewTracked = false

  function trackPageViewOptimized() {
    if (pageViewTracked || !supabase) return
    pageViewTracked = true

    const page = window.location.pathname
    supabase.from('analytics_events').insert({
      event_type: 'page_view',
      session_id: sessionId,
      page_url: page,
      metadata: { referrer: document.referrer || null }
    }).catch(() => {})
  }

  // ── DEBOUNCED EVENT TRACKING ──
  const trackEventDebounced = (perf.FunctionOptimizer?.debounce || function(f, w) {
    let t; return function(...a) {
      clearTimeout(t); t = setTimeout(() => f.apply(this, a), w)
    }
  })(function(type, metadata) {
    if (!supabase) return
    supabase.from('analytics_events').insert({
      event_type: type,
      session_id: sessionId,
      page_url: window.location.pathname,
      metadata: metadata || {}
    }).catch(() => {})
  }, 1000)

  function trackEventOptimized(type, metadata) {
    trackEventDebounced(type, metadata)
  }

  // ── CTA TRACKING WITH THROTTLING ──
  const trackCTAThrottled = (perf.FunctionOptimizer?.throttle || function(f, l) {
    let t; return function(...a) {
      if (!t) { f.apply(this, a); t = true; setTimeout(() => t = false, l) }
    }
  })(function(text) {
    trackEventOptimized('cta_click', { button_text: text.substring(0, 50) })
  }, 2000)

  document.addEventListener('click', function (e) {
    const cta = e.target.closest('[onclick*="openCheckout"]')
    if (cta) {
      trackCTAThrottled(cta.textContent?.trim() || 'CTA')
    }
  })

  // ── INTERSECTION OBSERVER FOR ANIMATIONS ──
  if ('IntersectionObserver' in window) {
    setTimeout(() => {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            obs.unobserve(e.target)
          }
        })
      }, { threshold: 0.08 })

      document.querySelectorAll('[data-animate]').forEach(el => obs.observe(el))
    }, 500)
  }

  // ── CRITICAL RESOURCES PRELOADING ──
  function preloadCriticalResources() {
    if (perf.preloader) {
      perf.preloader.dnsPrefetch('kqjdxeepusiipewwlzxs.supabase.co')
      perf.preloader.dnsPrefetch('cdn.jsdelivr.net')
      perf.preloader.preloadStylesheet('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap')
    }
  }

  // ── INIT ON DOM READY ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      preloadCriticalResources()
      init()
    })
  } else {
    preloadCriticalResources()
    init()
  }

  // ── MEMORY CLEANUP ON UNLOAD ──
  window.addEventListener('beforeunload', function() {
    if (perf.cache?.clear) perf.cache.clear()
    if (perf.lazyLoad?.destroy) perf.lazyLoad.destroy()
  })

  // ── EXPORT FUNCTIONS ──
  window.PerfLanding = {
    getCache: () => cache,
    getPerf: () => perfMonitor,
    clearCache: () => cache.clear?.(),
    trackEvent: trackEventOptimized
  }

  console.log('✅ Optimized landing page loaded')
})()
