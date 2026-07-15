// พอร์ตจาก getPermissionPages_ / normalizePermissions_ ใน Code.gs
export function getPermissionPages() {
  return [
    { key: 'home', label: 'หน้าแรก', group: 'ภาพรวมธุรกิจ' },
    { key: 'overview', label: 'ภาพรวมธุรกิจ', group: 'ภาพรวมธุรกิจ' },
    { key: 'dashboard', label: 'รายช่องทาง', group: 'ภาพรวมธุรกิจ' },
    { key: 'profit', label: 'กำไร', group: 'ภาพรวมธุรกิจ' },
    { key: 'upload', label: 'นำเข้าข้อมูล', group: 'ปฏิบัติการ' },
    { key: 'manual', label: 'กรอกข้อมูล Manual', group: 'ปฏิบัติการ' },
    { key: 'products', label: 'สินค้า', group: 'ปฏิบัติการ' },
    { key: 'ads', label: 'โฆษณา', group: 'ปฏิบัติการ' },
    { key: 'accounting', label: 'ต้นทุนสินค้า (COGS)', group: 'ปฏิบัติการ' },
    { key: 'payables', label: 'บัญชีจ่าย', group: 'ปฏิบัติการ' },
    { key: 'liveplanner', label: 'MC Live Planner', group: 'ปฏิบัติการ' },
    { key: 'mtledger', label: 'Modern Trade (GP)', group: 'ปฏิบัติการ' },
    { key: 'deepaudit', label: 'ตรวจสอบแพลตฟอร์ม', group: 'ตรวจสอบ' },
    { key: 'reconcile', label: 'ตรวจสอบชนยอด', group: 'ตรวจสอบ' },
    { key: 'bankrecon', label: 'กระทบยอด Statement', group: 'ตรวจสอบ' },
    { key: 'uploadlog', label: 'ประวัติการอัปโหลด', group: 'ตรวจสอบ' },
    { key: 'ai', label: 'AI สรุปหน้านี้', group: 'ตรวจสอบ' },
    { key: 'fees', label: 'ตั้งค่า Mapping / Fee', group: 'ตั้งค่าระบบ' },
    { key: 'health', label: 'สุขภาพระบบ', group: 'ตั้งค่าระบบ' },
    { key: 'users', label: 'ผู้ใช้และสิทธิ์', group: 'ตั้งค่าระบบ' }
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
  if (roleKey === 'UPLOADER') return ['home', 'upload', 'manual', 'payables', 'liveplanner'];
  return ['home', 'overview', 'dashboard', 'profit', 'deepaudit', 'reconcile', 'ai'];
}
