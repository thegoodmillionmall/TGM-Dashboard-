-- ================================================================
-- TGM BI — Migration: Edit Audit Log
-- รันใน Supabase SQL Editor
-- ================================================================

-- daily_data_log — บันทึกทุกการแก้ไขข้อมูลรายวัน
-- ใช้ร่วมกันทุกตาราง (tiktok_ads_manual, alllite_shipments, ฯลฯ)
CREATE TABLE IF NOT EXISTS daily_data_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_table  text NOT NULL,        -- 'tiktok_ads_manual' | 'alllite_shipments'
  entity_date   date,                  -- วันที่ของข้อมูล (entry_date / order_date)
  action        text NOT NULL,         -- 'CREATE' | 'UPDATE' | 'DELETE' | 'UPLOAD'
  field_name    text,                  -- NULL = action ระดับ row (create/delete/upload)
  old_value     text,                  -- ค่าเก่า (text)
  new_value     text,                  -- ค่าใหม่ (text)
  changed_by    text NOT NULL,         -- username
  changed_at    timestamptz DEFAULT now(),
  source        text DEFAULT 'MANUAL', -- 'MANUAL' | 'FILE_UPLOAD'
  source_file   text,                  -- ชื่อไฟล์ (ถ้า upload)
  note          text                   -- หมายเหตุเพิ่มเติม
);

CREATE INDEX IF NOT EXISTS daily_data_log_date_idx    ON daily_data_log(entity_date);
CREATE INDEX IF NOT EXISTS daily_data_log_table_idx   ON daily_data_log(entity_table);
CREATE INDEX IF NOT EXISTS daily_data_log_changed_idx ON daily_data_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS daily_data_log_user_idx    ON daily_data_log(changed_by);

COMMENT ON TABLE daily_data_log IS 'Audit trail ทุกการแก้ไขข้อมูล — field เก่า → ใหม่ ผู้แก้ เวลา';
