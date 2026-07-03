# Postmortem: GrowUp Agency Platform

## 1. المشاكل الموثقة (Known Issues)

### A. تسجيل الدخول (Login)
| # | المشكلة | الحالة | الأولوية |
|---|---------|--------|----------|
| 1 | `supabaseKey` تغير من `service_role` إلى `anon` ثم رجع | Fixed | Critical |
| 2 | `getCurrentUser()` كان يرمي خطأ عند فشل query البروفايل | Fixed | High |
| 3 | `setupRealtime()` كانت غير `async` ولكن تستخدم `await` — SyntaxError | Fixed | High |
| 4 | `startSessionRefresh()` و `onAuthChange()` ما كانوش يتنداو | Fixed | High |
| 5 | شاشة التحميل كانت تعلق لأن `hideLoading()` ما كانتش تمسح inline style | Fixed | High |
| 6 | شاشة التحميل تعلق إلى الآن — سبب محتمل: CDN فاشل أو `getSession()` يتجمد | **مفتوح** | **Critical** |
| 7 | لا يوجد fallback إذا فشل تحميل Supabase CDN | **مفتوح** | **High** |

### B. Abandoned Orders
| # | المشكلة | الحالة | الأولوية |
|---|---------|--------|----------|
| 1 | `service_role` يستخدم على client-side (أمان) | **مفتوح** | **Medium** |
| 2 | RLS policies تسمح للـ anon users بإدراج/تحديث دون مصادقة | **مفتوح** | **Medium** |
| 3 | لا يوجد rate limiting على saveDraft (800ms debounce فقط) | **مفتوح** | **Low** |
| 4 | لا يوجد validation للحقول قبل الحفظ | **مفتوح** | **Medium** |
| 5 | badge count في sidebar لا يتم تحديثه تلقائياً عند إضافة طلب جديد | **مفتوح** | **Low** |

### C. Facebook CAPI
| # | المشكلة | الحالة | الأولوية |
|---|---------|--------|----------|
| 1 | Edge Function لا ترسل `event_id` لتجنب التكرار (deduplication) | **مفتوح** | **High** |
| 2 | لا يوجد retry mechanism إذا فشلت API | **مفتوح** | **Medium** |
| 3 | لا يوجد validation على البيانات قبل الإرسال | **مفتوح** | **Low** |
| 4 | الأحداث لا تحتوي على `event_source_url` | **مفتوح** | **Low** |

### D. الأداء (Performance)
| # | المشكلة | الحالة | الأولوية |
|---|---------|--------|----------|
| 1 | `dashboard.js` > 2000 سطر — صيانة صعبة | **مفتوح** | **Medium** |
| 2 | لا يوجد lazy loading للصفحات | **مفتوح** | **Low** |
| 3 | استعلامات Supabase بدون pagination | **مفتوح** | **Medium** |
| 4 | ملفات JS بدون minification/compression | **مفتوح** | **Low** |

### E. الأمان (Security)
| # | المشكلة | الحالة | الأولوية |
|---|---------|--------|----------|
| 1 | `service_role` key مكشوف على client-side | **مفتوح** | **High** |
| 2 | GitHub token في الملخص (يجب تدويره) | **مفتوح** | **Critical** |
| 3 | Supabase AccessToken في الملخص | **مفتوح** | **High** |
| 4 | لا يوجد CSRF protection | **مفتوح** | **Low** |
| 5 | لا يوجد rate limiting على login | **مفتوح** | **Medium** |

---

## 2. خطة العمل المقترحة

### Phase 1: إصلاح الدخول أولاً
1. اختبار تحميل Supabase SDK من CDN
2. إضافة fallback إذا فشل CDN (استخدام import من مصدر آخر)
3. إضافة `console.error` لكل خطوة في init
4. تقليل fallback timer إلى 5 ثواني

### Phase 2: أمان الخدمة
1. إنشاء RLS policies صحيحة
2. نقل `service_role` إلى Edge Functions
3. استخدام anon key مع RLS بدلاً من service_role
4. تدوير GitHub token + Supabase AccessToken

### Phase 3: Abandoned Orders كاملة
1. إضافة pagination للجدول
2. تحسين realtime subscriptions
3. إضافة export PDF
4. إضافة automated follow-up (رسائل واتساب تلقائية)

### Phase 4: Facebook CAPI
1. إضافة `event_id` لكل حدث
2. إضافة retry mechanism
3. إضافة validation
4. إنشاء Custom Conversions في Meta Events Manager

### Phase 5: الصيانة
1. تقسيم dashboard.js إلى وحدات
2. إضافة minification
3. إضافة lazy loading
4. تحسين الأداء

---

## 3. أدوات الفحص (Agents)

تم إنشاء 5 أدوات فحص في مجلد `agents/`:

| الأداة | المهمة |
|--------|--------|
| `audit-agent.html` | فحص الأخطاء في الكود (سنتكس، رنتايم، كونفيغ) |
| `fix-agent.html` | إصلاح الأخطاء المكتشفة تلقائياً |
| `test-agent.html` | اختبار الوظائف الأساسية (دخول، CAPI، DB) |
| `validate-agent.html` | التحقق النهائي بعد الإصلاحات |

## 4. المتابعة

- يجب تشغيل `audit-agent.html` في المتصفح أولاً
- ثم `fix-agent.html` لإصلاح المشاكل التلقائية
- ثم `test-agent.html` لاختبار الوظائف
- ثم `validate-agent.html` للتأكيد النهائي
- وأخيراً تحديث هذا الملف (`postmortem.md`) بنتائج الفحص
