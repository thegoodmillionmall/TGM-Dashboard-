// Permission page registry used by user management and menu guards.
export function getPermissionPages() {
  return [
    { key: 'overview', label: 'เธ เธฒเธเธฃเธงเธกเธเธนเนเธเธฃเธดเธซเธฒเธฃ', group: 'เธ เธฒเธเธฃเธงเธก' },
    { key: 'dashboard', label: 'เนเธขเธเธเนเธญเธเธ—เธฒเธ', group: 'เธ เธฒเธเธฃเธงเธก' },
    { key: 'profit', label: 'เธเธณเนเธฃ-เธเธฒเธ”เธ—เธธเธ', group: 'เธ เธฒเธเธฃเธงเธก' },
    { key: 'product-sales', label: 'เธชเธดเธเธเนเธฒเธเธฒเธขเธ”เธต', group: 'เธ เธฒเธเธฃเธงเธก' },
    { key: 'ads', label: 'เธชเธฃเธธเธเนเธเธฉเธ“เธฒ', group: 'เนเธเธฉเธ“เธฒ' },
    { key: 'products', label: 'เธฃเธฒเธขเธเธฒเธฃเธชเธดเธเธเนเธฒ', group: 'เธชเธดเธเธเนเธฒ & เธ•เนเธเธ—เธธเธ' },
    { key: 'stockupdate', label: 'เธญเธฑเธเน€เธ”เธ•เธชเธ•เนเธญเธ', group: 'เธชเธดเธเธเนเธฒ & เธ•เนเธเธ—เธธเธ' },
    { key: 'accounting', label: 'เธ•เนเธเธ—เธธเธเธชเธดเธเธเนเธฒ', group: 'เธชเธดเธเธเนเธฒ & เธ•เนเธเธ—เธธเธ' },
    { key: 'payables', label: 'เธเธฑเธเธเธตเธเนเธฒเธข', group: 'เธเธฒเธฃเน€เธเธดเธ' },
    { key: 'statements', label: 'เธเธเธเธฒเธฃเน€เธเธดเธ', group: 'เธเธฒเธฃเน€เธเธดเธ' },
    { key: 'mtledger', label: 'Modern Trade', group: 'เธเธฒเธฃเน€เธเธดเธ' },
    { key: 'liveplanner', label: 'เนเธเธ MC Live', group: 'เธเธฒเธฃเน€เธเธดเธ' },
    { key: 'logistics', label: 'เธเธเธชเนเธ JST', group: 'เธเธฒเธฃเน€เธเธดเธ' },
    { key: 'upload', label: 'เธญเธฑเธเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ', group: 'เธเธฑเธ”เธเธฒเธฃเธเนเธญเธกเธนเธฅ' },
    { key: 'manual', label: 'เธเธฃเธญเธเธเนเธญเธกเธนเธฅเธกเธทเธญ', group: 'เธเธฑเธ”เธเธฒเธฃเธเนเธญเธกเธนเธฅ' },
    { key: 'deepaudit', label: 'Deep Audit', group: 'เธ•เธฃเธงเธเธชเธญเธ' },
    { key: 'reconcile', label: 'เธเธเธขเธญเธ”', group: 'เธ•เธฃเธงเธเธชเธญเธ' },
    { key: 'bankrecon', label: 'เธเธฃเธฐเธ—เธ Statement', group: 'เธ•เธฃเธงเธเธชเธญเธ' },
    { key: 'uploadlog', label: 'เธเธฃเธฐเธงเธฑเธ•เธดเธญเธฑเธเนเธซเธฅเธ”', group: 'เธ•เธฃเธงเธเธชเธญเธ' },
    { key: 'ai', label: 'AI เธชเธฃเธธเธเธซเธเนเธฒเธเธตเน', group: 'เธ•เธฃเธงเธเธชเธญเธ' },
    { key: 'fees', label: 'เธเนเธฒเธเธฃเธฃเธกเน€เธเธตเธขเธก & เนเธกเธเธเธดเนเธ', group: 'เธ•เธฑเนเธเธเนเธฒ' },
    { key: 'health', label: 'เธชเธธเธเธ เธฒเธเธฃเธฐเธเธ', group: 'เธ•เธฑเนเธเธเนเธฒ' },
    { key: 'users', label: 'เธเธนเนเนเธเน', group: 'เธ•เธฑเนเธเธเนเธฒ' }
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
