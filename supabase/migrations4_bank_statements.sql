-- ============================================================
-- กระทบยอด Bank Statement — รันใน Supabase SQL Editor ครั้งเดียว
-- ============================================================

create table if not exists bank_statements (
  id           uuid primary key default gen_random_uuid(),
  txn_date     date,
  txn_time     text not null default '',
  description  text not null default '',
  direction    text not null default 'OUT' check (direction in ('IN','OUT')),
  amount       numeric not null default 0,
  balance      numeric,
  bank         text not null default '',
  channel      text not null default '',
  file_name    text not null default '',
  batch_id     uuid,
  match_status text not null default 'UNMATCHED' check (match_status in ('UNMATCHED','MATCHED','CONFIRMED','IGNORED')),
  matched_payable_id text,
  uploaded_by  text not null default '',
  uploaded_at  timestamptz not null default now()
);
create index if not exists bank_statements_date_idx on bank_statements (txn_date);
create index if not exists bank_statements_match_idx on bank_statements (match_status);
