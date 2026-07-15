-- ──────────────────────────────────────────────────
-- Stock Daily & Price Config tables
-- รันใน Supabase SQL Editor ครั้งเดียว
-- ──────────────────────────────────────────────────

-- สต็อกรายวัน (1 row = 1 วัน)
CREATE TABLE IF NOT EXISTS stock_daily (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_date  TEXT        NOT NULL UNIQUE,  -- YYYY-MM-DD (ISO)
  cmp_date    TEXT,                         -- YYYY-MM-DD
  items       JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_daily_date ON stock_daily(stock_date);

-- ประวัติต้นทุน/ราคาขายต่อสินค้า
CREATE TABLE IF NOT EXISTS stock_price_config (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  product_key    TEXT        NOT NULL,
  product_label  TEXT        NOT NULL,
  cost           NUMERIC(10,4) NOT NULL,
  price          NUMERIC(10,2) NOT NULL,
  effective_from TEXT        NOT NULL,  -- YYYY-MM-DD (ISO)
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_price_key ON stock_price_config(product_key, effective_from);

-- อนุญาต service_role (ที่ใช้ใน .env) เข้าถึงทั้งสองตาราง
-- (ถ้าเปิด RLS — ถ้าไม่เปิด ไม่ต้องทำ)
-- ALTER TABLE stock_daily        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock_price_config ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service role full access" ON stock_daily        FOR ALL USING (true);
-- CREATE POLICY "service role full access" ON stock_price_config FOR ALL USING (true);
