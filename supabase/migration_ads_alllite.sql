-- ================================================================
-- TGM BI — Migration: ค่าแอดกรอกมือ + AllLite shipments
-- รันใน Supabase SQL Editor ครั้งเดียว
-- ================================================================

-- ---------------------------------------------------------------
-- 1) tiktok_ads_manual — บันทึกค่าแอดรายวัน (กรอกมือ)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tiktok_ads_manual (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_date      date NOT NULL UNIQUE,

  -- TikTok: GMV MAX
  tt_gmvmax_revenue   numeric(14,2) DEFAULT 0,
  tt_gmvmax_spend     numeric(14,2) DEFAULT 0,

  -- TikTok: GMV LIVE
  tt_gmvlive_revenue  numeric(14,2) DEFAULT 0,
  tt_gmvlive_spend    numeric(14,2) DEFAULT 0,

  -- TikTok: Ads เฉพาะ (Specific)
  tt_specific_spend   numeric(14,2) DEFAULT 0,
  tt_specific_count   int DEFAULT 0,

  -- TikTok: Ads หลังบ้าน (Backend / Ads Manager)
  tt_backend_spend    numeric(14,2) DEFAULT 0,

  -- Shopee Ads
  shopee_spend        numeric(14,2) DEFAULT 0,
  shopee_live_spend   numeric(14,2) DEFAULT 0,

  -- Meta Ads (FB/IG)
  meta_spend          numeric(14,2) DEFAULT 0,

  -- หมายเหตุ / ผู้รายงาน
  notes               text,
  reporter            text,

  -- Audit
  created_by          text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tiktok_ads_manual_date_idx ON tiktok_ads_manual(entry_date);

COMMENT ON TABLE tiktok_ads_manual IS 'ค่าแอดรายวันที่กรอกมือจาก LINE report — TikTok/Shopee/Meta';

-- ---------------------------------------------------------------
-- 2) alllite_shipments — ข้อมูลส่งของจาก AllLite WMS
--    (ใช้คำนวณ COGS รายวันจากจำนวนชิ้นที่ส่งจริง)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alllite_shipments (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id         text NOT NULL,
  source_file      text,

  order_date       date,
  platform         text,               -- TikTok / Shopee
  online_order_id  text,               -- Match กับ TikTok/Shopee Order ID
  product_name     text,               -- ชื่อสินค้าจาก AllLite (col CD)
  quantity         numeric(10,2) DEFAULT 0,  -- จำนวน (col CJ)
  shipping_cost    numeric(12,2) DEFAULT 0,  -- ค่าจัดส่ง (col AA)
  status           text,               -- สถานะออเดอร์ (col F)

  -- COGS matching result
  cogs_matched     boolean DEFAULT false,
  cogs_match_name  text,               -- ชื่อในตาราง COGS ที่ match ได้
  unit_cost        numeric(12,2) DEFAULT 0,  -- ต้นทุน/ชิ้น
  total_cogs       numeric(14,2) DEFAULT 0,  -- quantity × unit_cost

  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alllite_shipments_date_idx    ON alllite_shipments(order_date);
CREATE INDEX IF NOT EXISTS alllite_shipments_batch_idx   ON alllite_shipments(batch_id);
CREATE INDEX IF NOT EXISTS alllite_shipments_orderid_idx ON alllite_shipments(online_order_id);
CREATE INDEX IF NOT EXISTS alllite_shipments_platform_idx ON alllite_shipments(platform);

COMMENT ON TABLE alllite_shipments IS 'ข้อมูลส่งของจาก AllLite WMS — ใช้คำนวณ COGS รายวัน';
