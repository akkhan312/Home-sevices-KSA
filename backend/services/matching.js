// Decides which providers receive an open service request.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Provider columns needed by `matchesProvider`. */
const MATCHING_FIELDS = 'id, name, status, approval_status, service_categories, city, service_areas, is_available, working_hours';

/**
 * Validates working hours sent by a provider: `{ days: [0-6], start: 'HH:MM', end: 'HH:MM' }` (0 = Sunday), or null
 * to accept requests at any time. Returns the cleaned value or throws a message for the user.
 */
function parseWorkingHours(input) {
  if (input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Working hours must be an object');
  const days = [...new Set((Array.isArray(input.days) ? input.days : []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) throw new Error('Choose at least one working day');
  if (!TIME.test(String(input.start)) || !TIME.test(String(input.end))) throw new Error('Working hours must use HH:MM');
  if (input.start >= input.end) throw new Error('Working hours must end after they start');
  return { days, start: input.start, end: input.end };
}

/** Whether a request scheduled for `date` (YYYY-MM-DD) at `time` (HH:MM) falls inside the provider's working hours. */
function withinWorkingHours(hours, date, time) {
  if (!hours || !Array.isArray(hours.days) || !hours.days.length) return true;
  if (date && DATE.test(date)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!hours.days.includes(weekday)) return false;
  }
  if (time && TIME.test(time) && hours.start && hours.end) {
    if (time < hours.start || time >= hours.end) return false;
  }
  return true;
}

/**
 * A provider sees a request when they are accepting work, offer the service, serve the city (their home city or one
 * of their service areas) and work at the requested day and time. A dimension the provider has not configured is not
 * used to filter.
 */
function matchesProvider(booking, provider) {
  if (!provider || provider.is_available === false) return false;

  const categories = provider.service_categories || [];
  if (categories.length && booking.category && !categories.includes(booking.category)) return false;

  const cities = [provider.city, ...(provider.service_areas || [])].filter(Boolean).map((c) => String(c).toLowerCase());
  if (cities.length && booking.city && !cities.includes(String(booking.city).toLowerCase())) return false;

  return withinWorkingHours(provider.working_hours, booking.scheduled_date, booking.scheduled_time);
}

/** Approved, active providers who can work on new requests. */
const isApprovedActive = (p) => p && p.status !== 'suspended' && (p.approval_status || 'APPROVED') === 'APPROVED';

module.exports = { MATCHING_FIELDS, matchesProvider, withinWorkingHours, parseWorkingHours, isApprovedActive };
