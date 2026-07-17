-- รันใน Supabase SQL Editor (ครั้งเดียว)
-- สร้าง RPC สำหรับตรวจสอบว่าแต่ละ source_sheet มีข้อมูลเดือนไหนบ้าง
-- (ดูจากข้อมูลจริงใน raw_upload_rows ไม่ใช่วันที่ batch)

CREATE OR REPLACE FUNCTION get_upload_month_coverage()
RETURNS TABLE(source_sheet text, ym text)
LANGUAGE sql STABLE AS $$

  -- Source 1: batches ที่กรอก admin_start_date ไว้แล้ว
  SELECT b.source_sheet, to_char(b.admin_start_date, 'YYYY-MM') AS ym
  FROM upload_batches b
  WHERE b.status != 'ROLLED_BACK'
    AND b.admin_start_date IS NOT NULL
    AND b.source_sheet IN (
      'TT_Analytics','TT_Sales','TT_Settlement',
      'Shopee_Orders','Shopee_Settlement',
      'Shopee_Ads','TT_Ads_GMV','Meta_Ads'
    )

  UNION

  -- Source 2: batches ที่ไม่ได้กรอก admin_start_date
  -- → ดูจากคอลัมน์วันที่ในข้อมูลจริง (ลองหลายชื่อคอลัมน์)
  SELECT DISTINCT r.source_sheet,
    substring(
      COALESCE(
        -- TikTok Analytics / Shopee Ads / Meta Ads / TikTok Ads GMV: คอลัมน์ "Date"
        r.row_data->>'Date',
        r.row_data->>'date',
        r.row_data->>'วันที่',
        r.row_data->>'เริ่มการรายงาน',
        -- Shopee Settlement summary: "period_start"
        r.row_data->>'period_start',
        -- TikTok Orders: "เวลาที่สร้าง" / Shopee Orders: "Order Creation Time"
        left(COALESCE(
          r.row_data->>'เวลาที่สร้าง',
          r.row_data->>'Order Creation Time',
          r.row_data->>'ordercreationtime',
          -- TikTok Settlement: "Transaction Time"
          r.row_data->>'Transaction Time',
          r.row_data->>'transactiontime',
          -- Shopee Settlement raw: "settlementdate"
          r.row_data->>'settlementdate',
          r.row_data->>'วันที่โอนชำระเงินสำเร็จ'
        ), ''), 10)
      ),
      '^\d{4}-\d{2}'  -- ดึงแค่ YYYY-MM
    ) AS ym
  FROM raw_upload_rows r
  JOIN upload_batches b ON b.id = r.batch_id
  WHERE b.status != 'ROLLED_BACK'
    AND b.admin_start_date IS NULL
    AND r.source_sheet IN (
      'TT_Analytics','TT_Sales','TT_Settlement',
      'Shopee_Orders','Shopee_Settlement',
      'Shopee_Ads','TT_Ads_GMV','Meta_Ads'
    )
    AND r.row_index <= 50  -- ดูแค่ 50 แถวแรกของแต่ละ batch (เพื่อความเร็ว)

$$;

-- ให้ anon/authenticated เรียกได้
GRANT EXECUTE ON FUNCTION get_upload_month_coverage() TO anon, authenticated, service_role;
