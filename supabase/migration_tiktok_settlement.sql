-- ===================================================================
-- migration_tiktok_settlement.sql
-- สร้าง function ใหม่สำหรับรวมค่าธรรมเนียม TikTok Settlement
-- ไม่แตะ get_tiktok_gmv_audit ของ Apps Script เดิม
-- รันใน Supabase SQL Editor ครั้งเดียว
-- ===================================================================

CREATE OR REPLACE FUNCTION get_tiktok_settlement_fee(
  p_start DATE DEFAULT NULL,
  p_end   DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_start  DATE    := COALESCE(p_start, '2000-01-01');
  v_end    DATE    := COALESCE(p_end,   '2100-12-31');
  v_fee    NUMERIC := 0;
  v_net    NUMERIC := 0;
  v_rows   INT     := 0;
  v_d_min  TEXT;
  v_d_max  TEXT;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(
      CASE WHEN (r.row_data->>'ค่าธรรมเนียมทั้งหมด') ~ '^-?[0-9]+\.?[0-9]*$'
           THEN ABS((r.row_data->>'ค่าธรรมเนียมทั้งหมด')::NUMERIC)
           ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN (r.row_data->>'จำนวนเงินที่ชำระทั้งหมด') ~ '^-?[0-9]+\.?[0-9]*$'
           THEN (r.row_data->>'จำนวนเงินที่ชำระทั้งหมด')::NUMERIC
           ELSE 0 END
    ), 0),
    MIN(REPLACE(LEFT(COALESCE(r.row_data->>'เวลาที่สร้างคำสั่งซื้อ', ''), 10), '/', '-')),
    MAX(REPLACE(LEFT(COALESCE(r.row_data->>'เวลาที่สร้างคำสั่งซื้อ', ''), 10), '/', '-'))
  INTO v_rows, v_fee, v_net, v_d_min, v_d_max
  FROM raw_upload_rows r
  JOIN upload_batches  b ON b.id = r.batch_id
  WHERE r.source_sheet = 'TT_Settlement'
    AND b.status       != 'ROLLED_BACK'
    -- normalize YYYY/MM/DD → YYYY-MM-DD ก่อนเปรียบ (TikTok CSV ใช้ slash)
    AND REPLACE(LEFT(COALESCE(r.row_data->>'เวลาที่สร้างคำสั่งซื้อ', ''), 10), '/', '-') >= v_start::TEXT
    AND REPLACE(LEFT(COALESCE(r.row_data->>'เวลาที่สร้างคำสั่งซื้อ', ''), 10), '/', '-') <= v_end::TEXT;

  RETURN JSON_BUILD_OBJECT(
    'rows',          v_rows,
    'platformFee',   v_fee,
    'netSettlement', v_net,
    'dateStart',     v_d_min,
    'dateEnd',       v_d_max
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_tiktok_settlement_fee(DATE, DATE) TO anon, authenticated, service_role;
