// ============================================================
// TGM Sheet Sync v2 — วางใน Apps Script ของชีต "รอทำจ่าย The Good 2026"
// Deploy เป็น Web App (Execute as: Me / Who has access: Anyone)
// ============================================================

var DEFAULT_TAB = 'TGM_Payables';  // ชื่อ tab เริ่มต้น (ปรับได้ผ่าน .env ไม่ต้อง redeploy)
var TOKEN       = 'TGM2026';       // ต้องตรงกับ SHEET_SYNC_TOKEN ใน server/.env
var ID_COL      = 16;              // คอลัมน์ P = AP-ID (ซ่อนได้)

function s_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function n_(v) { var x = Number(String(v || 0).replace(/[^0-9.-]/g, '')); return isNaN(x) ? 0 : x; }
function d_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var m = s_(v).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) { var y = Number(m[3]); if (y > 2500) y -= 543; return y + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[1]).slice(-2); }
  return '';
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function getTab_(tabName) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName || DEFAULT_TAB);
}
function prop_(key, fallback) {
  return PropertiesService.getScriptProperties().getProperty(key) || fallback || '';
}
function safeName_(name) {
  return String(name || 'line-payable-file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
}
function uploadLineFile_(file) {
  var folderId = prop_('DRIVE_FOLDER_ID', '');
  if (!folderId) throw new Error('ยังไม่ได้ตั้งค่า DRIVE_FOLDER_ID ใน Script Properties');
  var bytes = Utilities.base64Decode(file.base64 || '');
  var blob = Utilities.newBlob(bytes, file.mimeType || 'application/octet-stream', safeName_(file.name || 'line-payable-file'));
  var f = DriveApp.getFolderById(folderId).createFile(blob);
  return {
    id: f.getId(),
    webViewLink: f.getUrl(),
    downloadLink: 'https://drive.google.com/uc?id=' + f.getId() + '&export=download'
  };
}
function authorizeLineUpload() {
  var folderId = prop_('DRIVE_FOLDER_ID', '');
  if (!folderId) throw new Error('ยังไม่ได้ตั้งค่า DRIVE_FOLDER_ID ใน Script Properties');
  var folder = DriveApp.getFolderById(folderId);
  return 'OK: ' + folder.getName();
}

// ── GET: อ่านข้อมูลทั้ง tab ──────────────────────────────────────────────────
function doGet(e) {
  if ((e.parameter.token || '') !== TOKEN) return json_({ error: 'unauthorized' });
  var tabName = e.parameter.tab || DEFAULT_TAB;
  var sh = getTab_(tabName);
  if (!sh) return json_({ error: 'ไม่พบ tab "' + tabName + '"' });
  var last = sh.getLastRow();
  var rows = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, ID_COL).getValues();
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (!(v[0] || v[2] || v[8]) || (n_(v[7]) === 0 && n_(v[5]) === 0)) continue;
      rows.push({
        row:      i + 2,
        id:       s_(v[15]),
        dueDate:  d_(v[0]),
        paid:     v[1] === true,
        description: s_(v[2]),
        company:  s_(v[3]) || 'TG',
        gross:    n_(v[5]),
        wht:      n_(v[6]),
        net:      n_(v[7]),
        vendor:   s_(v[8]),
        accountNo: s_(v[9]),
        bank:     s_(v[10]),
        ref:      s_(v[11]),
        link:     s_(v[12]),
        docDate:  d_(v[13]) || s_(v[13])
      });
    }
  }
  return json_({ ok: true, tab: tabName, rows: rows });
}

// ── POST: เขียนข้อมูลกลับ ────────────────────────────────────────────────────
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ error: 'bad json' }); }
  if ((body.token || '') !== TOKEN) return json_({ error: 'unauthorized' });
  var tabName = body.tab || DEFAULT_TAB;

  // ── สร้าง tab ใหม่พร้อม format ────────────────────────────────────────────
  if (body.action === 'setupTab') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var existing = ss.getSheetByName(tabName);
    if (existing) return json_({ ok: true, created: false, message: 'tab "' + tabName + '" มีอยู่แล้ว' });

    var sh = ss.insertSheet(tabName);

    // Headers row 1
    var headers = ['รอบจ่าย','จ่ายแล้ว','รายละเอียด','บริษัท','','ยอดรวม','ภาษี ณ ที่จ่าย','สุทธิ','ผู้รับเงิน','เลขบัญชี','ธนาคาร','อ้างอิง','ลิ้งค์เอกสาร','วันที่เอกสาร','','TGM_ID'];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length)
      .setBackground('#1a2a3a').setFontColor('#ffffff').setFontWeight('bold');

    // คอลัมน์ B = checkbox ตั้งแต่แถว 2
    var checkRange = sh.getRange(2, 2, 1000, 1);
    checkRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());

    // ซ่อน column P (TGM ID)
    sh.hideColumns(ID_COL);

    // ความกว้าง column
    sh.setColumnWidth(1, 110);  // A วันที่
    sh.setColumnWidth(2, 80);   // B checkbox
    sh.setColumnWidth(3, 220);  // C รายละเอียด
    sh.setColumnWidth(4, 70);   // D บริษัท
    sh.setColumnWidth(8, 130);  // H สุทธิ
    sh.setColumnWidth(9, 200);  // I ผู้รับเงิน

    // Freeze header
    sh.setFrozenRows(1);

    return json_({ ok: true, created: true, tab: tabName });
  }

  var sh = getTab_(tabName);
  if (!sh) return json_({ error: 'ไม่พบ tab "' + tabName + '" — กด "สร้าง TGM Tab ใหม่" ก่อน' });

  // --- createPayable: รับไฟล์จาก LINE Bot -> Drive + เพิ่มแถวรายการทำจ่าย ---
  if (body.action === 'createPayable') {
    try {
      var r = body.row || {};
      var uploaded = body.file ? uploadLineFile_(body.file) : null;
      if (uploaded) r.link = uploaded.webViewLink;

      var row = sh.getLastRow() + 1;
      sh.getRange(row, 1, 1, 4).setValues([[
        r.dueDate ? new Date(r.dueDate + 'T00:00:00') : '',
        r.paid === true,
        r.description || '',
        r.company || 'TG'
      ]]);
      sh.getRange(row, 6, 1, 9).setValues([[
        r.gross || r.grossAmount || 0,
        r.wht || r.whtAmount || 0,
        r.net || r.netAmount || 0,
        r.vendor || '',
        r.accountNo || '',
        r.bank || '',
        r.ref || '',
        r.link || r.documentLink || '',
        r.docDate || ''
      ]]);
      sh.getRange(row, ID_COL).setValue(r.id || '');
      sh.getRange(row, 2).setDataValidation(
        SpreadsheetApp.newDataValidation().requireCheckbox().build()
      );
      return json_({
        ok: true,
        added: 1,
        row: row,
        fileId: uploaded ? uploaded.id : '',
        webViewLink: uploaded ? uploaded.webViewLink : (r.link || ''),
        downloadLink: uploaded ? uploaded.downloadLink : (r.link || '')
      });
    } catch (err) {
      return json_({
        error: 'createPayable failed: ' + err.message,
        stack: err.stack || ''
      });
    }
  }

  // ── กำหนด ID ให้แถวที่จับคู่ได้ ─────────────────────────────────────────
  if (body.action === 'assignIds') {
    (body.assignments || []).forEach(function(a) { sh.getRange(a.row, ID_COL).setValue(a.id); });
    return json_({ ok: true, assigned: (body.assignments || []).length });
  }

  // ── upsert: จับคู่ด้วย ID ก่อน → fallback วันที่+vendor+ยอด ───────────────
  if (body.action === 'upsert') {
    var last = sh.getLastRow();
    var allVals = last >= 2 ? sh.getRange(2, 1, last - 1, ID_COL).getValues() : [];
    var updated = 0, added = 0;

    (body.rows || []).forEach(function(r) {
      var idx = -1;

      // 1. จับคู่ด้วย ID
      for (var i = 0; i < allVals.length; i++) {
        if (s_(r.id) && s_(allVals[i][15]) === s_(r.id)) { idx = i; break; }
      }
      // 2. fallback: วันที่+vendor+ยอด (สำหรับแถวที่ยังไม่มี ID)
      if (idx < 0 && r.dueDate && r.vendor) {
        for (var j = 0; j < allVals.length; j++) {
          if (s_(allVals[j][15])) continue;
          if (d_(allVals[j][0]) === r.dueDate &&
              s_(allVals[j][8]) === s_(r.vendor) &&
              Math.abs(n_(allVals[j][7]) - n_(r.net)) < 0.01) { idx = j; break; }
        }
      }

      var row = idx >= 0 ? idx + 2 : sh.getLastRow() + 1;

      sh.getRange(row, 1, 1, 4).setValues([[
        r.dueDate ? new Date(r.dueDate + 'T00:00:00') : '',
        r.paid === true,
        r.description || '',
        r.company || 'TG'
      ]]);
      sh.getRange(row, 6, 1, 9).setValues([[
        r.gross || 0, r.wht || 0, r.net || 0,
        r.vendor || '', r.accountNo || '', r.bank || '',
        r.ref || '', r.link || '', ''
      ]]);
      sh.getRange(row, ID_COL).setValue(r.id);

      // เพิ่ม checkbox validation สำหรับแถวใหม่
      if (idx < 0) {
        sh.getRange(row, 2).setDataValidation(
          SpreadsheetApp.newDataValidation().requireCheckbox().build()
        );
        var placeholder = new Array(ID_COL).fill('');
        placeholder[15] = r.id;
        allVals.push(placeholder);
        added++;
      } else {
        allVals[idx][15] = r.id;
        updated++;
      }
    });
    return json_({ ok: true, updated: updated, added: added });
  }

  return json_({ error: 'unknown action: ' + (body.action || '') });
}
