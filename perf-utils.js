/* Performance Utilities — Lazy Loading, Caching, Compression */
;(function() {
  'use strict'

  // ── CACHE MANAGER ──
  const CACHE_CONFIG = {
    products: { ttl: 300000 }, // 5 minutes
    settings: { ttl: 600000 }, // 10 minutes
    customers: { ttl: 180000 }, // 3 minutes
    orders: { ttl: 120000 }, // 2 minutes
    analytics: { ttl: 60000 } // 1 minute
  }

  class CacheManager {
    constructor() {
      this.cache = new Map()
      this.timers = new Map()
    }

    set(key, value, ttl) {
      // Remove old timer if exists
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key))
      }

      // Store with timestamp
      this.cache.set(key, {
        value: value,
        timestamp: Date.now()
      })

      // Set expiration
      if (ttl) {
        const timer = setTimeout(() => this.delete(key), ttl)
        this.timers.set(key, timer)
      }

      // Log cache size (dev only)
      if (this.cache.size > 100) {
        console.warn('Cache size exceeded 100 items, performance may degrade')
      }
    }

    get(key) {
      const item = this.cache.get(key)
      if (!item) return null

      // Check if expired
      const ttl = CACHE_CONFIG[key]?.ttl
      if (ttl && Date.now() - item.timestamp > ttl) {
        this.delete(key)
        return null
      }

      return item.value
    }

    has(key) {
      return this.get(key) !== null
    }

    delete(key) {
      this.cache.delete(key)
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key))
        this.timers.delete(key)
      }
    }

    clear() {
      this.timers.forEach(timer => clearTimeout(timer))
      this.cache.clear()
      this.timers.clear()
    }

    getSize() {
      return this.cache.size
    }
  }

  // ── LAZY LOADING ──
  class LazyLoadManager {
    constructor() {
      this.observer = null
      this.imageQueue = []
      this.loadedImages = new Set()
    }

    init() {
      if ('IntersectionObserver' in window) {
        this.observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              this.loadImage(entry.target)
            }
          })
        }, {
          rootMargin: '50px' // Load 50px before visible
        })
      } else {
        // Fallback for older browsers
        this.loadAllImages()
      }
    }

    loadImage(img) {
      if (this.loadedImages.has(img)) return

      const src = img.dataset.src
      if (!src) return

      const tempImg = new Image()
      tempImg.onload = () => {
        img.src = src
        img.classList.add('loaded')
        img.removeAttribute('data-src')
        if (this.observer) this.observer.unobserve(img)
        this.loadedImages.add(img)
      }
      tempImg.onerror = () => {
        img.classList.add('error')
        if (this.observer) this.observer.unobserve(img)
      }
      tempImg.src = src
    }

    observeImages() {
      if (!this.observer) {
        this.init()
      }
      document.querySelectorAll('img[data-src]').forEach(img => {
        this.observer.observe(img)
      })
    }

    loadAllImages() {
      document.querySelectorAll('img[data-src]').forEach(img => {
        this.loadImage(img)
      })
    }

    destroy() {
      if (this.observer) {
        this.observer.disconnect()
        this.observer = null
      }
      this.loadedImages.clear()
    }
  }

  // ── COMPRESSION UTILITIES ──
  class CompressionUtils {
    // Compress JSON
    static compressJSON(obj) {
      try {
        const json = JSON.stringify(obj)
        return btoa(json) // Base64 encoding
      } catch (e) {
        console.error('Compression failed:', e)
        return null
      }
    }

    // Decompress JSON
    static decompressJSON(compressed) {
      try {
        const json = atob(compressed)
        return JSON.parse(json)
      } catch (e) {
        console.error('Decompression failed:', e)
        return null
      }
    }

    // Minify object (remove unnecessary properties)
    static minifyObject(obj, allowedKeys = null) {
      if (!obj) return null

      if (allowedKeys) {
        const minified = {}
        allowedKeys.forEach(key => {
          if (key in obj) minified[key] = obj[key]
        })
        return minified
      }

      return obj
    }

    // Strip HTML comments and extra whitespace
    static minifyHTML(html) {
      return html
        .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
        .replace(/>\s+</g, '><') // Remove whitespace between tags
        .replace(/\n\s+/g, '') // Remove newlines and indentation
    }

    // Compress stylesheet
    static minifyCSS(css) {
      return css
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
        .replace(/\n\s+/g, '') // Remove newlines
        .replace(/:\s+/g, ':') // Remove spaces after colons
        .replace(/;\s+/g, ';') // Remove spaces after semicolons
        .replace(/,\s+/g, ',') // Remove spaces after commas
    }

    // Compress JavaScript
    static minifyJS(js) {
      return js
        .replace(/\/\/.*$/gm, '') // Remove line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
        .replace(/\n\s+/g, '') // Remove newlines and indentation
    }
  }

  // ── RESOURCE PRELOADER ──
  class ResourcePreloader {
    constructor() {
      this.preloadedResources = new Map()
    }

    // Preload images
    preloadImage(src) {
      if (this.preloadedResources.has(src)) return Promise.resolve()

      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          this.preloadedResources.set(src, img)
          resolve()
        }
        img.onerror = reject
        img.src = src
      })
    }

    // Preload multiple resources
    preloadImages(srcs) {
      return Promise.all(srcs.map(src => this.preloadImage(src)))
    }

    // Preload stylesheet
    preloadStylesheet(href) {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'style'
      link.href = href
      document.head.appendChild(link)
      return link
    }

    // Preload script
    preloadScript(src) {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'script'
      link.href = src
      document.head.appendChild(link)
      return link
    }

    // Prefetch resource
    prefetchResource(href) {
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.href = href
      document.head.appendChild(link)
    }

    // DNS prefetch
    dnsPrefetch(hostname) {
      const link = document.createElement('link')
      link.rel = 'dns-prefetch'
      link.href = '//' + hostname
      document.head.appendChild(link)
    }
  }

  // ── DEBOUNCE & THROTTLE ──
  class FunctionOptimizer {
    static debounce(func, wait, immediate = false) {
      let timeout
      return function executedFunction(...args) {
        const later = () => {
          timeout = null
          if (!immediate) func.apply(this, args)
        }
        const callNow = immediate && !timeout
        clearTimeout(timeout)
        timeout = setTimeout(later, wait)
        if (callNow) func.apply(this, args)
      }
    }

    static throttle(func, limit) {
      let inThrottle
      return function executedFunction(...args) {
        if (!inThrottle) {
          func.apply(this, args)
          inThrottle = true
          setTimeout(() => inThrottle = false, limit)
        }
      }
    }

    static memoize(func) {
      const cache = new Map()
      return function memoized(...args) {
        const key = JSON.stringify(args)
        if (cache.has(key)) {
          return cache.get(key)
        }
        const result = func.apply(this, args)
        cache.set(key, result)
        return result
      }
    }
  }

  // ── PERFORMANCE MONITOR ──
  class PerformanceMonitor {
    constructor() {
      this.metrics = new Map()
      this.startTime = performance.now()
    }

    mark(name) {
      if (performance.mark) {
        performance.mark(name)
      }
      this.metrics.set(name, performance.now())
    }

    measure(name, startMark, endMark) {
      if (performance.measure) {
        performance.measure(name, startMark, endMark)
      }
      const start = this.metrics.get(startMark) || 0
      const end = this.metrics.get(endMark) || performance.now()
      const duration = end - start
      console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`)
      return duration
    }

    getMemoryUsage() {
      if (performance.memory) {
        return {
          usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
          totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
          jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
        }
      }
      return null
    }

    logWebVitals() {
      // Largest Contentful Paint
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries()
            const lastEntry = entries[entries.length - 1]
            console.log('📊 LCP:', lastEntry.renderTime || lastEntry.loadTime, 'ms')
          })
          observer.observe({ entryTypes: ['largest-contentful-paint'] })
        } catch (e) {}
      }
    }

    getTiming() {
      if (window.performance && window.performance.timing) {
        const timing = window.performance.timing
        const navigationStart = timing.navigationStart
        return {
          dns: timing.domainLookupEnd - timing.domainLookupStart,
          tcp: timing.connectEnd - timing.connectStart,
          ttfb: timing.responseStart - navigationStart,
          download: timing.responseEnd - timing.responseStart,
          domInteractive: timing.domInteractive - navigationStart,
          domComplete: timing.domComplete - navigationStart,
          loadComplete: timing.loadEventEnd - navigationStart
        }
      }
      return null
    }
  }

  // ── REQUEST BATCHING ──
  class RequestBatcher {
    constructor(batchSize = 10, batchDelay = 100) {
      this.queue = []
      this.batchSize = batchSize
      this.batchDelay = batchDelay
      this.timer = null
    }

    add(request) {
      return new Promise((resolve, reject) => {
        this.queue.push({ request, resolve, reject })
        if (this.queue.length >= this.batchSize) {
          this.flush()
        } else if (!this.timer) {
          this.timer = setTimeout(() => this.flush(), this.batchDelay)
        }
      })
    }

    flush() {
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }

      if (this.queue.length === 0) return

      const batch = this.queue.splice(0, this.batchSize)
      batch.forEach(async ({ request, resolve, reject }) => {
        try {
          const result = await request()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
    }
  }

  // ── EXPORT GLOBALLY ──
  window.PerfUtils = {
    CacheManager,
    LazyLoadManager,
    CompressionUtils,
    ResourcePreloader,
    FunctionOptimizer,
    PerformanceMonitor,
    RequestBatcher,
    // Create instances
    cache: new CacheManager(),
    lazyLoad: new LazyLoadManager(),
    preloader: new ResourcePreloader(),
    perfMonitor: new PerformanceMonitor()
  }

  console.log('✅ Performance utilities loaded')
})()
