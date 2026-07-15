-- ============================================================
-- TGM Local — ตารางใหม่สำหรับระบบที่ย้ายออกจาก Google Sheets
-- รันใน Supabase SQL Editor ครั้งเดียว
-- (ตารางเดิม upload_batches / raw_upload_rows / activity_log_events
--  และ RPC get_*/refresh_*/replace_* ใช้ของเดิมต่อ ไม่ต้องแก้)
-- ============================================================

create extension if not exists pgcrypto;

-- ผู้ใช้ (แทนชีต User_DB)
create table if not exists app_users (
  username      text primary key,
  password_hash text not null,
  display_name  text not null default '',
  role          text not null default 'VIEWER' check (role in ('ADMIN','UPLOADER','VIEWER')),
  status        text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  permissions   jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  last_login    timestamptz
);

-- ตั้งค่าระบบ key-value (แทน Script Properties / overview display config)
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

-- บัญชีจ่าย (แทนชีต Payables_DB)
create table if not exists payables (
  id                 text primary key,
  due_date           date,
  status             text not null default 'PENDING',
  company            text not null default '',
  vendor             text not null default '',
  description        text not null default '',
  gross_amount       numeric not null default 0,
  wht_amount         numeric not null default 0,
  net_amount         numeric not null default 0,
  bank               text not null default '',
  account_no         text not null default '',
  account_name       text not null default '',
  ref                text not null default '',
  document_link      text not null default '',
  need_receipt       boolean not null default false,
  receipt_status     text not null default 'MISSING',
  need_tax_invoice   boolean not null default false,
  tax_invoice_status text not null default 'NOT_REQUIRED',
  need_wht_issue     boolean not null default false,
  wht_issue_status   text not null default 'NOT_REQUIRED',
  need_original      boolean not null default false,
  original_status    text not null default 'MISSING',
  note               text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         text not null default ''
);
create index if not exists payables_due_date_idx on payables (due_date);

-- MC Live Planner (แทนชีต MC_Live_Planner)
create table if not exists mc_live_planner (
  id               text primary key,
  date             date,
  brand            text not null default '',
  platform         text not null default '',
  mc               text not null default '',
  start_time       text not null default '',
  end_time         text not null default '',
  plan_topic       text not null default '',
  target_sales     numeric not null default 0,
  actual_sales     numeric not null default 0,
  orders           numeric not null default 0,
  viewers          numeric not null default 0,
  peak_ccu         numeric not null default 0,
  comments         numeric not null default 0,
  clicks           numeric not null default 0,
  add_to_cart      numeric not null default 0,
  coins            numeric not null default 0,
  ads_cost         numeric not null default 0,
  status           text not null default 'PLANNED',
  document_status  text not null default 'MISSING',
  document_links   text not null default '',
  attachment_names text not null default '',
  note             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       text not null default ''
);
create index if not exists mc_live_planner_date_idx on mc_live_planner (date);

-- FlowAccount invoices (แทนชีต FlowAccount_Invoices)
create table if not exists flowaccount_invoices (
  invoice_id  text primary key,
  invoice_date date,
  customer    text not null default '',
  total       numeric not null default 0,
  status      text not null default '',
  raw         jsonb,
  synced_at   timestamptz not null default now()
);

-- seed ผู้ใช้ admin เริ่มต้น (username: admin / password: admin1234)
-- *** เข้าระบบครั้งแรกแล้วเปลี่ยนรหัสผ่านทันที ***
insert into app_users (username, password_hash, display_name, role, status)
values ('admin', crypt('admin1234', gen_salt('bf')), 'Administrator', 'ADMIN', 'ACTIVE')
on conflict (username) do nothing;

-- (ทางเลือก) ย้ายผู้ใช้เดิมจากชีต User_DB:
-- รหัสผ่านเดิมเก็บเป็น plain text ในชีต ให้เพิ่มทีละคน เช่น
-- insert into app_users (username, password_hash, display_name, role, status)
-- values ('somchai', crypt('รหัสเดิม', gen_salt('bf')), 'สมชาย', 'UPLOADER', 'ACTIVE');
