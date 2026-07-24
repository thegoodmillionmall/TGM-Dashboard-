import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3001),
  supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  googleAiKey: process.env.GOOGLE_AI_KEY || '',
  googleAiModel: process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash',
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  googleServiceAccountPrivateKey: String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  googleDriveFolderId: process.env.GOOGLE_DRIVE_PAYABLES_FOLDER_ID || '',
  googleDrivePublicLink: String(process.env.GOOGLE_DRIVE_PUBLIC_LINK || 'false').toLowerCase() === 'true',
  googlePayablesSpreadsheetId: process.env.GOOGLE_PAYABLES_SPREADSHEET_ID || '',
  googlePayablesTab: process.env.GOOGLE_PAYABLES_TAB || 'TGM_Payables',
  payablesScriptUrl: process.env.PAYABLES_SCRIPT_URL || '',
  payablesScriptToken: process.env.PAYABLES_SCRIPT_TOKEN || '',
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  flowAccountUrl: process.env.FLOWACCOUNT_API_URL || '',
  flowAccountToken: process.env.FLOWACCOUNT_API_TOKEN || '',
  flowAccountCron: process.env.FLOWACCOUNT_CRON || ''
};

if (!config.supabaseUrl || !config.supabaseKey) {
  console.warn('[WARN] SUPABASE_URL / SUPABASE_SERVICE_KEY ยังไม่ได้ตั้งค่าใน .env');
}
