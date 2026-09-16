const supabase = require('../supabase');

/**
 * Checks for completed jobs where customer hasn't confirmed after 24h & 48h.
 */
async function checkConfirmationTimeouts(io) {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    // 1. Fetch bookings completed by provider where customer hasn't confirmed yet
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .in('status', ['WAITING_CUSTOMER_CONFIRMATION', 'completed_by_provider'])
      .is('confirmed_at', null);

    if (error || !bookings || bookings.length === 0) return;

    for (const b of bookings) {
      const completedTime = new Date(b.completed_at || b.updated_at).getTime();
      const hoursPassed = (now.getTime() - completedTime) / (1000 * 60 * 60);

      // ─── 24-HOUR NOTIFICATION ─────────────────────────────────
      if (hoursPassed >= 24 && hoursPassed < 48 && !b.timeout_notified_24h) {
        await supabase
          .from('bookings')
          .update({ timeout_notified_24h: true })
          .eq('id', b.id);

        await supabase.from('notifications').insert({
          user_id: b.customer_id,
          title: '⏳ Confirmation Needed: Job Completed',
          body: `Provider marked your ${b.category_name} job as complete 24h ago. Please confirm to release payment.`,
          type: 'customer_confirmation_reminder',
          read: false,
          data: { bookingId: b.id }
        });

        if (io) {
          io.to(`user:${b.customer_id}`).emit('notification_created', {
            type: 'customer_confirmation_reminder',
            bookingId: b.id
          });
        }
        console.log(`⏰ Sent 24h confirmation reminder for booking #${b.id}`);
      }

      // ─── 48-HOUR NOTIFICATION & ADMIN ESCALATION ───────────────
      if (hoursPassed >= 48 && !b.timeout_notified_48h) {
        await supabase
          .from('bookings')
          .update({ timeout_notified_48h: true })
          .eq('id', b.id);

        // Notify Customer second time
        await supabase.from('notifications').insert({
          user_id: b.customer_id,
          title: '⚠️ Final Reminder: Confirm Service Completion',
          body: `It has been 48h since service completion. Please confirm or report any issues before admin payment release.`,
          type: 'customer_confirmation_final',
          read: false,
          data: { bookingId: b.id }
        });

        // Notify Admin users
        const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
        if (admins && admins.length > 0) {
          const adminNotifs = admins.map((adm) => ({
            user_id: adm.id,
            title: `🚨 Customer Timeout (48h): Booking #${b.id.slice(0, 8)}`,
            body: `Customer ${b.customer_name || ''} has not responded to completion for 48h. Action required for payment release.`,
            type: 'admin_timeout_alert',
            read: false,
            data: { bookingId: b.id }
          }));
          await supabase.from('notifications').insert(adminNotifs);
        }

        if (io) {
          io.to('role:admin').emit('payment_pending', {
            bookingId: b.id,
            reason: 'customer_timeout_48h',
            message: `Booking #${b.id.slice(0, 8)} requires manual admin payment release due to 48h customer timeout.`
          });
        }
        console.log(`⏰ Sent 48h escalation alert for booking #${b.id}`);
      }
    }
  } catch (err) {
    console.error('Error running timeoutScheduler:', err.message);
  }
}

/**
 * Initializes recurring cron check every 15 minutes.
 */
function initTimeoutScheduler(io) {
  // Run once immediately on server startup
  checkConfirmationTimeouts(io);

  // Interval check every 15 minutes (900000 ms)
  const INTERVAL_MS = 15 * 60 * 1000;
  setInterval(() => {
    checkConfirmationTimeouts(io);
  }, INTERVAL_MS).unref();
  console.log('⏰ Customer Confirmation Timeout Scheduler initialized (every 15 min check).');
}

module.exports = {
  checkConfirmationTimeouts,
  initTimeoutScheduler
};
