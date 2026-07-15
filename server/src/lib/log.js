import { sbRequest } from '../supabase.js';

// พอร์ตจาก writeActivityLogToSupabase_ ใน Code.gs (ตาราง activity_log_events เดิม)
export async function writeActivityLog(user, action, entity, entityId, status, message, payload) {
  try {
    await sbRequest('activity_log_events', 'post', [{
      username: user?.username || '',
      display_name: user?.displayName || '',
      role: user?.role || '',
      action: action || '',
      entity: entity || '',
      entity_id: entityId || '',
      status: status || '',
      message: message || '',
      payload: payload || null
    }], { Prefer: 'return=minimal' });
  } catch (err) {
    console.warn('[activity log]', err.message);
  }
}
