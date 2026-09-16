const supabase = require('../supabase');
const { mapCallHistoryToFrontend } = require('../utils/mappers');

/**
 * Log call session history into DB
 */
async function logCall({ bookingId, callerId, receiverId, durationSeconds, status, quality }) {
  try {
    const { data: callLog, error } = await supabase
      .from('call_history')
      .insert({
        booking_id: bookingId || null,
        caller_id: callerId,
        receiver_id: receiverId,
        duration_seconds: durationSeconds || 0,
        status: status || 'completed', // incoming, outgoing, missed, rejected, completed
        quality: quality || 'good',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Call logging DB error:', error);
      return null;
    }
    return mapCallHistoryToFrontend(callLog);
  } catch (err) {
    console.error('Failed to log call history:', err);
    return null;
  }
}

/**
 * Get call history for a user
 */
async function getUserCallHistory(userId) {
  const { data: calls, error } = await supabase
    .from('call_history')
    .select(`
      *,
      caller:caller_id(id, name, profile_picture),
      receiver:receiver_id(id, name, profile_picture)
    `)
    .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Fetch user call history error:', error);
    return [];
  }

  return (calls || []).map((c) => {
    const isCaller = c.caller_id === userId;
    const otherUser = isCaller ? c.receiver : c.caller;
    let callType = c.status;
    if (['completed', 'ENDED', 'CONNECTED'].includes(c.status)) callType = isCaller ? 'outgoing' : 'incoming';
    else if (['MISSED', 'FAILED', 'CALLING', 'RINGING'].includes(c.status)) callType = isCaller ? 'outgoing' : 'missed';

    return {
      id: c.id,
      bookingId: c.booking_id,
      callerId: c.caller_id,
      receiverId: c.receiver_id,
      otherUserName: otherUser?.name || (isCaller ? 'Customer/Provider' : 'Caller'),
      otherUserProfilePicture: otherUser?.profile_picture || null,
      durationSeconds: c.duration_seconds || 0,
      status: c.status,
      callType,
      createdAt: c.created_at
    };
  });
}

module.exports = {
  logCall,
  getUserCallHistory
};
