-- ============================================================
-- Modern Trade Ledger (เลียนแบบชีต MT) + ข้อมูลเก่า ม.ค.–มิ.ย. 2026
-- รันใน Supabase SQL Editor ครั้งเดียว
-- ============================================================

-- ยอดขายก่อนหัก GP (จำนวนชิ้น + ยอดขาย ต่อเดือน/ช่องทาง/สินค้า)
create table if not exists mt_sales (
  id      uuid primary key default gen_random_uuid(),
  month   date not null,
  channel text not null,
  product text not null,
  units   numeric not null default 0,
  revenue numeric not null default 0,
  unique (month, channel, product)
);

-- เงินรับจริง (ต่อเดือน/ช่องทาง/สินค้า)
create table if not exists mt_receipts (
  id      uuid primary key default gen_random_uuid(),
  month   date not null,
  channel text not null,
  product text not null,
  amount  numeric not null default 0,
  unique (month, channel, product)
);

-- รายการจ่าย (DC / ค่าเช่า-ค่าคอม / ค่าเปิดสาขาใหม่ ฯลฯ)
create table if not exists mt_payments (
  id      uuid primary key default gen_random_uuid(),
  month   date not null,
  channel text not null,
  item    text not null,
  amount  numeric not null default 0,
  note    text not null default ''
);

-- GP% ต่อช่องทาง
insert into app_settings (key, value, updated_by)
values ('mt_gp', '{"EVE":45,"KONVY":40,"WATSON":40,"GDT":0}', 'setup')
on conflict (key) do nothing;

-- ---------- ข้อมูลเก่า: ยอดขายก่อนหัก GP ----------
insert into mt_sales (month, channel, product, units, revenue) values
('2026-01-01','EVE','Fluffy Puff Powder//5G',210,54790),('2026-01-01','KONVY','Fluffy Puff Powder//5G',543,132162),('2026-01-01','WATSON','Fluffy Puff Powder//5G',311,77601),
('2026-01-01','EVE','Boostdrop Intensive Hair Serum//50ML',16,6976),('2026-01-01','KONVY','Boostdrop Intensive Hair Serum//50ML',5,2271),
('2026-01-01','EVE','Retox Soft Scrub Hair Serum//30ML',13,6370),('2026-01-01','KONVY','Retox Soft Scrub Hair Serum//30ML',3,1445),
('2026-01-01','EVE','Keraglow Hair Repair Oil Serum//30ML',40,11040),('2026-01-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',1,290),
('2026-02-01','EVE','Fluffy Puff Powder//5G',159,42501),('2026-02-01','KONVY','Fluffy Puff Powder//5G',524,103554),('2026-02-01','WATSON','Fluffy Puff Powder//5G',426,91590),
('2026-02-01','EVE','Boostdrop Intensive Hair Serum//50ML',16,6979),('2026-02-01','KONVY','Boostdrop Intensive Hair Serum//50ML',10,2871),
('2026-02-01','EVE','Retox Soft Scrub Hair Serum//30ML',7,3430),('2026-02-01','KONVY','Retox Soft Scrub Hair Serum//30ML',5,1345),
('2026-02-01','EVE','Keraglow Hair Repair Oil Serum//30ML',39,10805),('2026-02-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',11,1820),
('2026-03-01','EVE','Fluffy Puff Powder//5G',198,51322),('2026-03-01','KONVY','Fluffy Puff Powder//5G',691,130499),('2026-03-01','WATSON','Fluffy Puff Powder//5G',338,83282),
('2026-03-01','EVE','Boostdrop Intensive Hair Serum//50ML',46,15562),('2026-03-01','KONVY','Boostdrop Intensive Hair Serum//50ML',18,4593),
('2026-03-01','EVE','Retox Soft Scrub Hair Serum//30ML',20,7463),('2026-03-01','KONVY','Retox Soft Scrub Hair Serum//30ML',10,2450),
('2026-03-01','EVE','Keraglow Hair Repair Oil Serum//30ML',69,17697),('2026-03-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',29,4723),
('2026-04-01','EVE','Fluffy Puff Powder//5G',188,45442),('2026-04-01','KONVY','Fluffy Puff Powder//5G',475,103897),('2026-04-01','WATSON','Fluffy Puff Powder//5G',226,55175),
('2026-04-01','EVE','Boostdrop Intensive Hair Serum//50ML',74,17921),('2026-04-01','KONVY','Boostdrop Intensive Hair Serum//50ML',33,11385),
('2026-04-01','EVE','Retox Soft Scrub Hair Serum//30ML',29,8552),('2026-04-01','KONVY','Retox Soft Scrub Hair Serum//30ML',8,3184),
('2026-04-01','EVE','Keraglow Hair Repair Oil Serum//30ML',84,18212),('2026-04-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',13,2853),
('2026-05-01','EVE','Fluffy Puff Powder//5G',300,61890),('2026-05-01','KONVY','Fluffy Puff Powder//5G',280,52793),('2026-05-01','WATSON','Fluffy Puff Powder//5G',219,52650),
('2026-05-01','EVE','Boostdrop Intensive Hair Serum//50ML',6,2034),
('2026-05-01','EVE','Retox Soft Scrub Hair Serum//30ML',10,4900),('2026-05-01','KONVY','Retox Soft Scrub Hair Serum//30ML',2,490),
('2026-05-01','EVE','Keraglow Hair Repair Oil Serum//30ML',92,20483),('2026-05-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',7,1240)
on conflict (month, channel, product) do update set units = excluded.units, revenue = excluded.revenue;

-- ---------- ข้อมูลเก่า: เงินรับจริง ----------
insert into mt_receipts (month, channel, product, amount) values
('2026-01-01','EVE','Fluffy Puff Powder//5G',32224.50),('2026-01-01','KONVY','Fluffy Puff Powder//5G',79297.20),('2026-01-01','WATSON','Fluffy Puff Powder//5G',46559.59),('2026-01-01','GDT','Fluffy Puff Powder//5G',460.35),
('2026-01-01','EVE','Boostdrop Intensive Hair Serum//50ML',4039.20),('2026-01-01','KONVY','Boostdrop Intensive Hair Serum//50ML',1362.60),
('2026-01-01','EVE','Retox Soft Scrub Hair Serum//30ML',3503.50),('2026-01-01','KONVY','Retox Soft Scrub Hair Serum//30ML',867.00),
('2026-01-01','EVE','Keraglow Hair Repair Oil Serum//30ML',6380.00),('2026-01-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',174.00),
('2026-02-01','EVE','Fluffy Puff Powder//5G',24398.55),('2026-02-01','KONVY','Fluffy Puff Powder//5G',62132.40),('2026-02-01','WATSON','Fluffy Puff Powder//5G',54953.66),('2026-02-01','GDT','Fluffy Puff Powder//5G',306.90),
('2026-02-01','EVE','Boostdrop Intensive Hair Serum//50ML',4039.20),('2026-02-01','KONVY','Boostdrop Intensive Hair Serum//50ML',1722.60),
('2026-02-01','EVE','Retox Soft Scrub Hair Serum//30ML',1886.50),('2026-02-01','KONVY','Retox Soft Scrub Hair Serum//30ML',807.00),
('2026-02-01','EVE','Keraglow Hair Repair Oil Serum//30ML',6220.50),('2026-02-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',1092.00),
('2026-03-01','EVE','Fluffy Puff Powder//5G',30383.10),('2026-03-01','KONVY','Fluffy Puff Powder//5G',78299.40),('2026-03-01','WATSON','Fluffy Puff Powder//5G',49970.23),('2026-03-01','GDT','Fluffy Puff Powder//5G',613.80),
('2026-03-01','EVE','Boostdrop Intensive Hair Serum//50ML',11612.86),('2026-03-01','KONVY','Boostdrop Intensive Hair Serum//50ML',2755.80),
('2026-03-01','EVE','Retox Soft Scrub Hair Serum//30ML',5390.04),('2026-03-01','KONVY','Retox Soft Scrub Hair Serum//30ML',1470.00),
('2026-03-01','EVE','Keraglow Hair Repair Oil Serum//30ML',11005.62),('2026-03-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',2833.80),
('2026-04-01','EVE','Fluffy Puff Powder//5G',28848.60),('2026-04-01','KONVY','Fluffy Puff Powder//5G',62338.20),('2026-04-01','WATSON','Fluffy Puff Powder//5G',33104.39),('2026-04-01','GDT','Fluffy Puff Powder//5G',460.35),
('2026-04-01','EVE','Boostdrop Intensive Hair Serum//50ML',18681.76),('2026-04-01','KONVY','Boostdrop Intensive Hair Serum//50ML',6831.00),
('2026-04-01','EVE','Retox Soft Scrub Hair Serum//30ML',7815.64),('2026-04-01','KONVY','Retox Soft Scrub Hair Serum//30ML',1910.40),
('2026-04-01','EVE','Keraglow Hair Repair Oil Serum//30ML',13398.30),('2026-04-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',1711.80),
('2026-05-01','EVE','Fluffy Puff Powder//5G',34039.50),('2026-05-01','KONVY','Fluffy Puff Powder//5G',31675.80),('2026-05-01','WATSON','Fluffy Puff Powder//5G',31590.06),
('2026-05-01','EVE','Boostdrop Intensive Hair Serum//50ML',1118.70),
('2026-05-01','EVE','Retox Soft Scrub Hair Serum//30ML',2695.00),('2026-05-01','KONVY','Retox Soft Scrub Hair Serum//30ML',294.00),
('2026-05-01','EVE','Keraglow Hair Repair Oil Serum//30ML',11265.65),('2026-05-01','KONVY','Keraglow Hair Repair Oil Serum//30ML',744.00)
on conflict (month, channel, product) do update set amount = excluded.amount;

-- ---------- ข้อมูลเก่า: จ่าย (ยอดเงินสุทธิ) ----------
insert into mt_payments (month, channel, item, amount, note) values
('2026-01-01','WATSON','DC',1003.86,''),
('2026-01-01','EVE','ค่าเช่า / ค่าคอม',42800.00,'eve ชำระผ่านเช็ค ชำระ 9/2/69'),
('2026-01-01','WATSON','ค่าเปิดสาขาใหม่ 10 สาขา',19400.00,''),
('2026-02-01','WATSON','DC',2403.29,''),
('2026-02-01','EVE','ค่าเช่า / ค่าคอม',42800.00,'eve ชำระผ่านเช็ค'),
('2026-02-01','WATSON','ค่าเช่า / ค่าคอม',29100.00,'ค้างชำระ watson'),
('2026-02-01','WATSON','ค่าเปิดสาขาใหม่ 2 สาขา',5820.00,''),
('2026-03-01','WATSON','DC',2712.20,''),
('2026-03-01','EVE','ค่าเช่า / ค่าคอม',42800.00,''),
('2026-03-01','WATSON','ค่าเปิดสาขาใหม่ 1 สาขา',9700.00,'Watson โอนชำระวันที่ 8/4/2026'),
('2026-04-01','EVE','ค่าเช่า / ค่าคอม',42800.00,'eve ชำระผ่านเช็ค'),
('2026-05-01','WATSON','DC',1326.62,''),
('2026-05-01','EVE','ค่าเช่า / ค่าคอม',42800.00,'EVE โอนชำระ จ่าย 22/5/2026'),
('2026-05-01','WATSON','ค่าเปิดสาขาใหม่',5820.00,'Watson หักหน้าบัญชี วันที่ 4/6/2026'),
('2026-06-01','WATSON','DC',884.39,''),
('2026-06-01','EVE','ค่าเช่า / ค่าคอม',42800.00,'EVE โอนชำระ จ่าย 30/6/2026'),
('2026-06-01','WATSON','ค่าเปิดสาขาใหม่',9700.00,'Watson หักหน้าบัญชี วันที่ 2/7/2026');
