-- ================================================================
-- TGM BI — Migration: Product Monthly Sales
-- รันใน Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS product_sales_monthly (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year_month    text NOT NULL,       -- '2026-01'
  source        text NOT NULL,       -- 'GOSELL' | 'JST'
  platform      text DEFAULT 'ALL',  -- 'TikTok' | 'Shopee' | 'MT' | 'Other' | 'ALL'
  sku_code      text,
  product_key   text,                -- 'puff' | 'retox' | 'boostdrop' | 'keraglow' | 'comb' | 'bundle' | 'other'
  product_name  text,
  orders        int DEFAULT 0,
  units         int DEFAULT 0,
  gross_revenue numeric DEFAULT 0,
  net_revenue   numeric DEFAULT 0,
  cogs          numeric DEFAULT 0,
  gross_profit  numeric DEFAULT 0,
  batch_id      text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS psm_month_idx   ON product_sales_monthly(year_month);
CREATE INDEX IF NOT EXISTS psm_key_idx     ON product_sales_monthly(product_key);
CREATE INDEX IF NOT EXISTS psm_source_idx  ON product_sales_monthly(source);
CREATE INDEX IF NOT EXISTS psm_batch_idx   ON product_sales_monthly(batch_id);

COMMENT ON TABLE product_sales_monthly IS
  'ยอดขายสินค้ารายเดือน รวม JST ERP + GoSell — ใช้เป็นฐานหน้าสินค้าขายดี';
