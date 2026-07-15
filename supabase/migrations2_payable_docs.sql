-- ============================================================
-- เพิ่มระบบแนบเอกสารให้บัญชีจ่าย — รันใน Supabase SQL Editor ครั้งเดียว
-- ============================================================

-- ตารางเก็บข้อมูลไฟล์แนบ
create table if not exists payable_attachments (
  id           uuid primary key default gen_random_uuid(),
  payable_id   text not null,
  doc_type     text not null default 'OTHER',
  file_name    text not null,
  storage_path text not null,
  content_type text not null default '',
  file_size    bigint not null default 0,
  uploaded_by  text not null default '',
  uploaded_at  timestamptz not null default now()
);
create index if not exists payable_attachments_payable_idx on payable_attachments (payable_id);

-- ที่เก็บไฟล์ (private bucket — เข้าถึงผ่านระบบเท่านั้น)
insert into storage.buckets (id, name, public)
values ('payable-docs', 'payable-docs', false)
on conflict (id) do nothing;
