import type { Href } from 'expo-router';
import type { UserRole } from '../store/authStore';

export interface NotificationData {
  type?: string | null;
  bookingId?: string | null;
  [key: string]: unknown;
}

const ADMIN_PAYMENT_TYPES = ['payment_submitted', 'payout_pending', 'new_withdrawal_request'];
const PROVIDER_EARNING_TYPES = ['payout_paid', 'payout_pending', 'withdrawal_update', 'refund'];

/** Screen to open for a notification (push or in-app), or null when it has nowhere to go. */
export function routeForNotification(data: NotificationData | null | undefined, role?: UserRole | null): Href | null {
  if (!data || !role) return null;
  const bookingId = typeof data.bookingId === 'string' ? data.bookingId : null;

  if (role === 'admin') {
    if (data.type && ADMIN_PAYMENT_TYPES.includes(data.type)) return '/(admin)/payments';
    return '/(admin)';
  }
  if (role === 'provider') {
    if (bookingId) return { pathname: '/(provider)/jobs/[id]', params: { id: bookingId } };
    if (data.type && PROVIDER_EARNING_TYPES.includes(data.type)) return '/(provider)/earnings';
    return '/(provider)/notifications';
  }
  if (bookingId) return { pathname: '/(customer)/booking/[id]', params: { id: bookingId } };
  if (data.type === 'refund') return '/(customer)/wallet';
  return '/(customer)/notifications';
}
