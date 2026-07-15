import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3001),
  supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  googleAiKey: process.env.GOOGLE_AI_KEY || '',
  googleAiModel: process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash',
  flowAccountUrl: process.env.FLOWACCOUNT_API_URL || '',
  flowAccountToken: process.env.FLOWACCOUNT_API_TOKEN || '',
  flowAccountCron: process.env.FLOWACCOUNT_CRON || ''
};

if (!config.supabaseUrl || !config.supabaseKey) {
  console.warn('[WARN] SUPABASE_URL / SUPABASE_SERVICE_KEY ยังไม่ได้ตั้งค่าใน .env');
}
