// Permission page registry used by user management and menu guards.
export function getPermissionPages() {
  return [
    { key: 'overview', label: 'ภาพรวมผู้บริหาร', group: 'ภาพรวม' },
    { key: 'dashboard', label: 'แยกช่องทาง', group: 'ภาพรวม' },
    { key: 'profit', label: 'กำไร-ขาดทุน', group: 'ภาพรวม' },
    { key: 'product-sales', label: 'สินค้าขายดี', group: 'ภาพรวม' },
    { key: 'ads', label: 'สรุปโฆษณา', group: 'โฆษณา' },
    { key: 'ads-entry', label: 'กรอกค่าแอดรายวัน', group: 'โฆษณา' },
    { key: 'spreadsheet-ads', label: 'ค่าแอด Spreadsheet', group: 'โฆษณา' },
    { key: 'products', label: 'รายการสินค้า', group: 'สินค้า & ต้นทุน' },
    { key: 'stockupdate', label: 'อัปเดตสต็อก', group: 'สินค้า & ต้นทุน' },
    { key: 'accounting', label: 'ต้นทุนสินค้า', group: 'สินค้า & ต้นทุน' },
    { key: 'payables', label: 'บัญชีจ่าย', group: 'การเงิน' },
    { key: 'mtledger', label: 'Modern Trade', group: 'การเงิน' },
    { key: 'liveplanner', label: 'แผน MC Live', group: 'การเงิน' },
    { key: 'logistics', label: 'ขนส่ง JST', group: 'การเงิน' },
    { key: 'upload', label: 'อัปโหลดข้อมูล', group: 'จัดการข้อมูล' },
    { key: 'manual', label: 'กรอกข้อมูลมือ', group: 'จัดการข้อมูล' },
    { key: 'deepaudit', label: 'Deep Audit', group: 'ตรวจสอบ' },
    { key: 'reconcile', label: 'ชนยอด', group: 'ตรวจสอบ' },
    { key: 'bankrecon', label: 'กระทบ Statement', group: 'ตรวจสอบ' },
    { key: 'uploadlog', label: 'ประวัติอัปโหลด', group: 'ตรวจสอบ' },
    { key: 'ai', label: 'AI สรุปหน้านี้', group: 'ตรวจสอบ' },
    { key: 'fees', label: 'ค่าธรรมเนียม & แมปปิ้ง', group: 'ตั้งค่า' },
    { key: 'health', label: 'สุขภาพระบบ', group: 'ตั้งค่า' },
    { key: 'users', label: 'ผู้ใช้', group: 'ตั้งค่า' }
  ];
}

export function normalizeRole(role) {
  const r = String(role || 'VIEWER').trim().toUpperCase();
  return ['ADMIN', 'UPLOADER', 'VIEWER'].includes(r) ? r : 'VIEWER';
}

export function normalizePermissions(raw, role) {
  const pages = getPermissionPages().map(p => p.key);
  const roleKey = normalizeRole(role);
  if (roleKey === 'ADMIN') return pages;

  let parsed = [];
  if (Array.isArray(raw)) parsed = raw;
  else if (raw !== null && raw !== undefined && String(raw).trim()) {
    const text = String(raw).trim();
    try {
      const json = JSON.parse(text);
      parsed = Array.isArray(json) ? json : [];
    } catch {
      parsed = text.split(',').map(v => v.trim());
    }
  }

  parsed = parsed
    .map(v => (typeof v === 'object' ? v.key || v.id || v.pageId || '' : String(v || '')))
    .filter(v => pages.includes(v));

  if (parsed.length) return Array.from(new Set(parsed));
  if (roleKey === 'UPLOADER') return ['overview', 'upload', 'manual', 'payables', 'liveplanner'];
  return ['overview', 'dashboard', 'profit', 'deepaudit', 'reconcile', 'ai'];
}
