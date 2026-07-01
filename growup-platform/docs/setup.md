# GrowUp Agency — دليل الإعداد

## 1. إنشاء مشروع Supabase
1. اذهب إلى supabase.com
2. New Project → اختر اسم `growup-agency`
3. اختر المنطقة الأقرب (Europe West مثلاً)
4. انتظر حتى ينتهي الإعداد
5. من Project Settings → API، انسخ:
   - `Project URL`
   - `anon public key`
   - `service_role key` (سري)

## 2. تنفيذ SQL
1. Supabase → SQL Editor
2. الصق محتوى ملف SQL من `supabase/migrations/`
3. نفّذ كل الأوامر

## 3. إعداد Storage
1. Supabase → Storage → New Bucket
2. الاسم: `payment-proofs`
3. Public: NO

## 4. إعداد Auth
1. Supabase → Authentication → Providers → Email
2. Site URL: رابط موقعك بعد النشر
3. قالب الإيميل (Magic Link): خصّص القالب العربي

## 5. إنشاء حساب OWNER
1. Supabase → Authentication → Users → Invite User
2. أنشئ حسابه بالبريد الإلكتروني
3. بعد التأكيد، أضف السطر التالي في SQL:
```sql
INSERT INTO staff_users (id, email, role) VALUES ('[user_uuid]', 'owner@email.com', 'OWNER');
```

## 6. نشر Edge Functions
```bash
supabase functions deploy validate-order
supabase functions deploy create-order
supabase functions deploy approve-order
supabase functions deploy generate-invoice
```

## 7. رفع الملفّين HTML
1. اذهب إلى netlify.com
2. اسحب `landing.html` و `dashboard.html`
3. انتظر HTTPS

## 8. إعداد Secrets
Supabase → Edge Functions → Secrets:
- `RESEND_API_KEY`
- `PAYLOAD_ENCRYPTION_KEY`

## 9. تعديل الملفين HTML
استبدل في كلا الملفين:
- `SUPABASE_URL` → رابط مشروعك
- `SUPABASE_ANON_KEY` → مفتاحك العام

## 10. اختبار شامل
- [ ] صفحة الهبوط تظهر وتحميل المنتج
- [ ] نموذج الطلب يعمل حتى رفع الإيصال
- [ ] الداشبورد يدخل ويظهر الطلبات
- [ ] الموافقة على طلب ترسل الإيميل
