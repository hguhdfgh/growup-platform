-- ============================================================
-- GROWUP AGENCY — FULL DATABASE SCHEMA
-- ============================================================
-- نفّذ هذا الملف في Supabase SQL Editor
-- Execute this file in Supabase SQL Editor

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- 2. ENUMS
-- ============================================================
create type order_status as enum (
  'PENDING_PAYMENT',
  'PROOF_SUBMITTED',
  'VERIFYING',
  'APPROVED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED'
);

create type staff_role as enum ('OWNER', 'ADMIN', 'SUPPORT');
create type coupon_type as enum ('PERCENT', 'FIXED');
create type notification_status as enum ('LOGGED', 'SENT', 'FAILED');
create type notification_channel as enum ('EMAIL', 'WHATSAPP');

-- ============================================================
-- 3. PRODUCTS (multi-product ready)
-- ============================================================
create table products (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'draft')),
  name_ar text not null,
  name_fr text not null,
  description_ar text,
  description_fr text,
  price_dzd numeric(10,2) not null check (price_dzd > 0),
  stock integer default null, -- null = unlimited
  sort_order integer default 0,
  images jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 4. CUSTOMERS (passwordless)
-- ============================================================
create table customers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  phone text,
  whatsapp text,
  locale text not null default 'ar' check (locale in ('ar', 'fr')),
  created_at timestamptz default now()
);

-- ============================================================
-- 5. COUPONS
-- ============================================================
create table coupons (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  type coupon_type not null,
  value numeric(10,2) not null check (value > 0),
  max_uses integer default null,
  used_count integer not null default 0,
  expires_at timestamptz default null,
  active boolean not null default true,
  product_scope uuid references products(id) default null,
  created_at timestamptz default now()
);

-- ============================================================
-- 6. PAYMENT METHODS (admin-editable)
-- ============================================================
create table payment_methods (
  id uuid primary key default uuid_generate_v4(),
  label_ar text not null,
  label_fr text not null,
  instructions_ar text not null,
  instructions_fr text not null,
  account_fields jsonb not null default '{}',
  active boolean not null default true,
  sort_order integer default 0
);

-- ============================================================
-- 7. ORDERS
-- ============================================================
create sequence order_seq start 1;

create table orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text unique not null,
  customer_id uuid references customers(id) on delete set null,
  customer_email text not null,
  customer_phone text,
  customer_whatsapp text,
  product_id uuid references products(id) on delete set null,
  product_snapshot jsonb not null,
  coupon_id uuid references coupons(id) default null,
  coupon_snapshot jsonb default null,
  original_price_dzd numeric(10,2) not null,
  discount_dzd numeric(10,2) not null default 0,
  final_price_dzd numeric(10,2) not null,
  payment_method_id uuid references payment_methods(id),
  payment_method_snapshot jsonb not null,
  locale text not null default 'ar',
  status order_status not null default 'PENDING_PAYMENT',
  admin_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-generate order number
create or replace function generate_order_number()
returns trigger as $$
begin
  new.order_number := 'GRW-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_seq')::text, 5, '0');
  return new;
end;
$$ language plpgsql;

create trigger set_order_number
before insert on orders
for each row execute function generate_order_number();

-- ============================================================
-- 8. PAYMENT PROOFS
-- ============================================================
create table payment_proofs (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade unique,
  storage_key text not null,
  uploaded_at timestamptz default now(),
  reviewed_by uuid references auth.users(id) default null,
  review_note text,
  reviewed_at timestamptz
);

-- ============================================================
-- 9. DELIVERY PAYLOADS (encrypted)
-- ============================================================
create table delivery_payloads (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade unique,
  payload_encrypted text not null,
  delivered_at timestamptz,
  delivery_email_sent boolean default false
);

-- ============================================================
-- 10. STAFF USERS
-- ============================================================
create table staff_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role staff_role not null default 'SUPPORT',
  active boolean not null default true,
  created_at timestamptz default now()
);

-- ============================================================
-- 11. NOTIFICATIONS (disabled by feature flag)
-- ============================================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  type text not null,
  channel notification_channel not null,
  target text not null,
  payload jsonb not null,
  status notification_status not null default 'LOGGED',
  created_at timestamptz default now()
);

-- ============================================================
-- 12. ANALYTICS EVENTS
-- ============================================================
create table analytics_events (
  id uuid primary key default uuid_generate_v4(),
  event_name text not null,
  session_id text,
  order_id uuid references orders(id) default null,
  product_id uuid references products(id) default null,
  coupon_id uuid references coupons(id) default null,
  locale text,
  referrer text,
  properties jsonb default '{}',
  created_at timestamptz default now()
);

-- ============================================================
-- 13. SETTINGS (single source of truth)
-- ============================================================
create table settings (
  key text primary key,
  value_ar text,
  value_fr text,
  value_json jsonb,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

-- ============================================================
-- 14. AUDIT LOG
-- ============================================================
create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references auth.users(id),
  actor_email text,
  action text not null,
  target_table text,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- 15. ROW LEVEL SECURITY — ENABLE ON ALL TABLES
-- ============================================================

-- Products
alter table products enable row level security;
create policy "products_public_read" on products for select using (status = 'active');
create policy "products_staff_all" on products for all using (
  exists (select 1 from staff_users where id = auth.uid() and active = true)
);

-- Customers
alter table customers enable row level security;
create policy "customers_own" on customers for all using (id = auth.uid());
create policy "customers_staff_read" on customers for select using (
  exists (select 1 from staff_users where id = auth.uid() and active = true)
);

-- Orders
alter table orders enable row level security;
create policy "orders_customer_own" on orders for select using (customer_id = auth.uid());
create policy "orders_customer_insert" on orders for insert with check (customer_id = auth.uid());
create policy "orders_staff_all" on orders for all using (
  exists (select 1 from staff_users where id = auth.uid() and active = true)
);

-- Payment Proofs
alter table payment_proofs enable row level security;
create policy "proofs_customer_insert" on payment_proofs for insert with check (
  exists (select 1 from orders where id = order_id and customer_id = auth.uid())
);
create policy "proofs_staff_read" on payment_proofs for select using (
  exists (select 1 from staff_users where id = auth.uid() and active = true)
);

-- Delivery Payloads — no direct access, only via Edge Functions
alter table delivery_payloads enable row level security;
create policy "delivery_no_direct_access" on delivery_payloads for all using (false);

-- Staff Users
alter table staff_users enable row level security;
create policy "staff_owner_all" on staff_users for all using (
  exists (select 1 from staff_users where id = auth.uid() and role = 'OWNER' and active = true)
);
create policy "staff_self_read" on staff_users for select using (id = auth.uid());

-- Coupons
alter table coupons enable row level security;
create policy "coupons_public_read" on coupons for select using (active = true);
create policy "coupons_staff_all" on coupons for all using (
  exists (select 1 from staff_users where id = auth.uid() and active = true)
);

-- Payment Methods
alter table payment_methods enable row level security;
create policy "payment_methods_public_read" on payment_methods for select using (active = true);
create policy "payment_methods_staff_all" on payment_methods for all using (
  exists (select 1 from staff_users where id = auth.uid() and active = true)
);

-- Analytics
alter table analytics_events enable row level security;
create policy "analytics_insert_all" on analytics_events for insert with check (true);
create policy "analytics_staff_read" on analytics_events for select using (
  exists (select 1 from staff_users where id = auth.uid() and active = true)
);

-- Settings
alter table settings enable row level security;
create policy "settings_public_read" on settings for select using (true);
create policy "settings_staff_write" on settings for all using (
  exists (select 1 from staff_users where id = auth.uid() and role in ('OWNER', 'ADMIN') and active = true)
);

-- Audit Log
alter table audit_log enable row level security;
create policy "audit_owner_read" on audit_log for select using (
  exists (select 1 from staff_users where id = auth.uid() and role = 'OWNER' and active = true)
);
create policy "audit_insert_all" on audit_log for insert with check (true);

-- Notifications
alter table notifications enable row level security;
create policy "notifications_staff_read" on notifications for select using (
  exists (select 1 from staff_users where id = auth.uid() and active = true)
);
create policy "notifications_insert_all" on notifications for insert with check (true);

-- ============================================================
-- 16. SEED DATA
-- ============================================================

-- Product #1
insert into products (slug, status, name_ar, name_fr, description_ar, description_fr, price_dzd, sort_order)
values (
  'tiktok-agency-ad-account',
  'active',
  'حساب TikTok Agency Ad Account',
  'Compte TikTok Agency Ad Account',
  'احصل على حساب إعلاني احترافي لـ TikTok مع صلاحيات كاملة وإمكانية تشغيل إعلانات فعّالة في الجزائر والعالم.',
  'Obtenez un compte publicitaire professionnel TikTok avec des droits complets et la possibilité de diffuser des publicités efficaces en Algérie et dans le monde.',
  6000.00,
  1
);

-- Payment Methods (⚠️ PLACEHOLDER — replace before launch!)
insert into payment_methods (label_ar, label_fr, instructions_ar, instructions_fr, account_fields, sort_order)
values
(
  'BaridiMob',
  'BaridiMob',
  'قم بتحويل المبلغ عبر تطبيق BaridiMob إلى الرقم التالي، ثم ارفع صورة الإيصال.',
  'Transférez le montant via l''application BaridiMob au numéro suivant, puis téléchargez la preuve.',
  '{"account_number": "⚠️ PLACEHOLDER — أدخل رقمك الحقيقي من الداشبورد قبل الإطلاق", "owner_name": "⚠️ PLACEHOLDER"}',
  1
),
(
  'حساب بريدي CCP',
  'Compte CCP',
  'قم بالإيداع في الحساب البريدي التالي، ثم ارفع صورة الإيصال.',
  'Effectuez un dépôt sur le compte CCP suivant, puis téléchargez la preuve.',
  '{"ccp_number": "⚠️ PLACEHOLDER", "key": "⚠️", "owner_name": "⚠️ PLACEHOLDER"}',
  2
),
(
  'تحويل بنكي',
  'Virement bancaire',
  'قم بالتحويل البنكي إلى الحساب التالي، ثم ارفع صورة الإيصال.',
  'Effectuez un virement bancaire sur le compte suivant, puis téléchargez la preuve.',
  '{"rib": "⚠️ PLACEHOLDER", "owner_name": "⚠️ PLACEHOLDER", "bank": "⚠️ PLACEHOLDER"}',
  3
);

-- Settings (legal, contact, content)
insert into settings (key, value_ar, value_fr) values
('legal_company_name', 'GrowUp Agency', 'GrowUp Agency'),
('legal_footer_text', 'جميع الحقوق محفوظة.', 'Tous droits réservés.'),
('legal_terms_text', 'بالشراء، أنت توافق على شروط الخدمة.', 'En achetant, vous acceptez les conditions d''utilisation.'),
('whatsapp_number', '+213XXXXXXXXX', '+213XXXXXXXXX'),
('support_hours_ar', 'الدعم متاح 9 صباحاً - 9 مساءً', 'Support disponible 9h - 21h'),
('faq_items', null, null),
('notifications_enabled', 'false', 'false'),
('homepage_hero_title_ar', 'احصل على حساب TikTok الاحترافي', 'Obtenez votre compte TikTok professionnel'),
('homepage_guarantee_text_ar', 'نضمن تسليم الحساب خلال 24 ساعة من تأكيد الدفع.', 'Nous garantissons la livraison du compte dans les 24h après confirmation du paiement.');
