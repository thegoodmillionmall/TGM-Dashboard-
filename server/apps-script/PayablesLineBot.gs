const PROP = PropertiesService.getScriptProperties();

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    assertToken_(payload.token);
    if (payload.action !== 'createPayable') throw new Error('Unsupported action: ' + payload.action);

    const row = payload.row || {};
    const uploaded = payload.file ? uploadFile_(payload.file) : null;
    if (uploaded) {
      row.link = uploaded.webViewLink;
      row.downloadLink = uploaded.downloadLink;
    }
    appendPayableRow_(row);

    return json_({
      ok: true,
      fileId: uploaded ? uploaded.id : '',
      webViewLink: uploaded ? uploaded.webViewLink : (row.link || ''),
      downloadLink: uploaded ? uploaded.downloadLink : (row.downloadLink || row.link || '')
    });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function doGet() {
  return json_({ ok: true, name: 'TGM Payables LINE Apps Script', time: new Date().toISOString() });
}

function assertToken_(token) {
  const expected = PROP.getProperty('PAYABLES_SCRIPT_TOKEN');
  if (!expected) throw new Error('ยังไม่ได้ตั้งค่า PAYABLES_SCRIPT_TOKEN ใน Script Properties');
  if (String(token || '') !== expected) throw new Error('Invalid token');
}

function uploadFile_(file) {
  const folderId = PROP.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) throw new Error('ยังไม่ได้ตั้งค่า DRIVE_FOLDER_ID ใน Script Properties');
  const bytes = Utilities.base64Decode(file.base64 || '');
  const blob = Utilities.newBlob(bytes, file.mimeType || 'application/octet-stream', safeName_(file.name || 'line-payable-file'));
  const driveFile = DriveApp.getFolderById(folderId).createFile(blob);
  return {
    id: driveFile.getId(),
    webViewLink: driveFile.getUrl(),
    downloadLink: 'https://drive.google.com/uc?id=' + driveFile.getId() + '&export=download'
  };
}

function appendPayableRow_(row) {
  const spreadsheetId = PROP.getProperty('SPREADSHEET_ID');
  const tabName = PROP.getProperty('PAYABLES_TAB') || 'TGM_Payables';
  if (!spreadsheetId) throw new Error('ยังไม่ได้ตั้งค่า SPREADSHEET_ID ใน Script Properties');

  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);
  ensureHeader_(sheet);

  sheet.appendRow([
    row.id || '',
    row.paid === true,
    row.description || '',
    row.company || 'TG',
    Number(row.grossAmount || 0),
    Number(row.whtAmount || 0),
    Number(row.netAmount || 0),
    row.vendor || '',
    row.accountNo || '',
    row.bank || '',
    row.ref || '',
    row.link || row.documentLink || '',
    row.docDate || '',
    row.source || 'LINE'
  ]);
}

function ensureHeader_(sheet) {
  const headers = ['id', 'paid', 'description', 'company', 'gross', 'wht', 'net', 'vendor', 'accountNo', 'bank', 'ref', 'link', 'docDate', 'source'];
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeader = current.some(String);
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function safeName_(name) {
  return String(name || 'line-payable-file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
