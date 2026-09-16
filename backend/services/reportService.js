const supabase = require('../supabase');
const { emitToRole } = require('./access');

/**
 * Files an objection/report. It is stored in `reports` and surfaced to admins as a single
 * `objection` notification (which the admin moderation panel reads). The reported user is never notified.
 */
async function createObjection({ reporter, targetUserId, bookingId, reason, description, io }) {
  const [{ data: reporterRow }, { data: targetUser }, { data: admins }] = await Promise.all([
    supabase.from('users').select('name, role, email').eq('id', reporter.id).maybeSingle(),
    targetUserId ? supabase.from('users').select('name, role, email').eq('id', targetUserId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('users').select('id').eq('role', 'admin').order('created_at', { ascending: true }),
  ]);

  const cleanReason = String(reason).slice(0, 200);
  const cleanDescription = String(description || '').slice(0, 2000);

  const { data: report, error: reportErr } = await supabase
    .from('reports')
    .insert({
      booking_id: bookingId || null,
      reporter_id: reporter.id,
      reported_user_id: targetUserId || null,
      reason: cleanReason,
      description: cleanDescription,
      status: 'open',
    })
    .select()
    .single();
  if (reportErr) throw reportErr;

  if (!admins || admins.length === 0) {
    console.warn('No admin account exists to receive objection', report.id);
    return { report, notification: null };
  }

  const title = `🚨 OBJECTION/REPORT: ${cleanReason}${targetUser ? ` against ${targetUser.name}` : ''}`;
  const body = `Reported by ${reporterRow?.name || 'User'} (${reporterRow?.role || reporter.role}): ${cleanDescription || cleanReason}`;

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      user_id: admins[0].id,
      title,
      body,
      type: 'objection',
      read: false,
      data: {
        reportId: report.id,
        reporterId: reporter.id,
        reporterName: reporterRow?.name || 'User',
        reporterRole: reporterRow?.role || reporter.role,
        targetUserId: targetUserId || null,
        targetUserName: targetUser?.name || null,
        targetUserRole: targetUser?.role || null,
        bookingId: bookingId || null,
        reason: cleanReason,
        description: cleanDescription,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    })
    .select()
    .single();
  if (error) throw error;

  emitToRole(io, 'admin', 'new_report_alert', { id: notification.id, title, body, data: notification.data });
  return { report, notification };
}

module.exports = { createObjection };
