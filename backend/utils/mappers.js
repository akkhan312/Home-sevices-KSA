// ─── DATA MAPPING UTILITY FOR SUPABASE / EXPRESS API ──────────────────────────
// Maps PostgreSQL snake_case columns to MongoDB-style camelCase/_id properties 
// to prevent breaking any frontend contracts.
const { API_HOST } = require('../config');
const { fileUrl } = require('../services/files');

/** Single customer-facing lifecycle stage derived from order, payment and payout state. */
function orderStage(b) {
  const status = b.status;
  const payment = b.payment_status;
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'disputed') return 'DISPUTED';
  if (status === 'completed') return b.payout_status === 'PAID' ? 'COMPLETED' : 'PAYOUT_PENDING';
  if (['CUSTOMER_CONFIRMED', 'customer_confirmed'].includes(status)) return b.payout_status === 'PAID' ? 'PROVIDER_PAID' : 'PAYOUT_PENDING';
  if (['WAITING_CUSTOMER_CONFIRMATION', 'completed_by_provider'].includes(status)) return 'SERVICE_COMPLETED';
  if (['IN_PROGRESS', 'in-progress', 'REVISION_REQUESTED'].includes(status)) return 'SERVICE_STARTED';
  if (status === 'ARRIVED') return 'ARRIVED';
  if (status === 'ON_THE_WAY') return 'PROVIDER_ON_THE_WAY';
  if (status === 'VERIFIED') return b.communication_status === 'UNLOCKED' ? 'COMMUNICATION_UNLOCKED' : 'PAID';
  if (payment === 'PENDING_VERIFICATION' || payment === 'PAYMENT_SUBMITTED') return 'PAYMENT_VERIFICATION';
  if (['OFFER_ACCEPTED', 'accepted', 'PAYMENT_PENDING'].includes(status)) return 'PAYMENT_PENDING';
  if (status === 'BIDDING') return 'PROPOSALS_RECEIVED';
  return 'REQUESTED';
}


// --- USER MAPPERS ---
function mapUserToFrontend(u) {
  if (!u) return null;
  
  let profilePicture = u.profile_picture || '';
  if (profilePicture && !profilePicture.startsWith('http')) {
    const host = API_HOST;
    profilePicture = `${host}${profilePicture}`;
  }

  return {
    uid: u.id,
    _id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    phone: u.phone || '',
    iqamaNumber: u.iqama_number || '',
    profilePicture: profilePicture,
    googleId: u.google_id || '',
    city: u.city || '',
    serviceCategories: u.service_categories || [],
    bio: u.bio || '',
    rating: Number(u.rating || 0),
    status: u.status || 'active',
    approvalStatus: u.approval_status || 'APPROVED',
    completedJobs: Number(u.completed_jobs || 0),
    createdAt: u.created_at,
    updatedAt: u.updated_at
  };
}

function mapUserToDatabase(u) {
  if (!u) return null;
  const dbUser = {};
  if (u.uid || u._id) dbUser.id = u.uid || u._id;
  if (u.email !== undefined) dbUser.email = u.email;
  if (u.password !== undefined) dbUser.password = u.password;
  if (u.name !== undefined) dbUser.name = u.name;
  if (u.role !== undefined) dbUser.role = u.role;
  if (u.iqamaNumber !== undefined) dbUser.iqama_number = u.iqamaNumber;
  if (u.phone !== undefined) dbUser.phone = u.phone;
  if (u.googleId !== undefined) dbUser.google_id = u.googleId;
  if (u.profilePicture !== undefined) dbUser.profile_picture = u.profilePicture;
  return dbUser;
}

// --- BOOKING MAPPERS ---
function mapBookingToFrontend(b) {
  if (!b) return null;
  
  const paymentSlip = b.payment_slip ? fileUrl(b.payment_slip) : '';

  return {
    _id: b.id,
    customerId: b.customer_id,
    customerName: b.customer_name || '',
    customerPhone: b.customer_phone || '',
    providerId: b.provider_id || null,
    providerName: b.provider_name || null,
    category: b.category,
    categoryName: b.category_name,
    serviceOption: b.service_option,
    scheduledDate: b.scheduled_date,
    scheduledTime: b.scheduled_time,
    address: b.address,
    price: Number(b.price),
    commission: Number(b.commission || 0),
    providerEarnings: Number(b.provider_earnings || 0),
    escrowAmount: Number(b.escrow_amount || b.price || 0),
    budget: Number(b.budget || b.price || 0),
    selectedOfferId: b.selected_offer_id || null,
    selectedProviderId: b.selected_provider_id || null,
    orderNumber: b.order_number || null,
    paymentReference: b.payment_reference || b.order_number || null,
    status: b.status,
    stage: orderStage(b),
    paymentStatus: b.payment_status || 'UNPAID',
    paymentRejectionReason: b.payment_rejection_reason || null,
    communicationStatus: b.communication_status || 'LOCKED',
    payoutStatus: b.payout_status || 'NONE',
    commissionRate: b.commission_rate !== undefined && b.commission_rate !== null ? Number(b.commission_rate) : null,
    city: b.city || '',
    area: b.area || '',
    description: b.description || b.notes || '',
    latitude: b.latitude ?? null,
    longitude: b.longitude ?? null,
    paymentSlip: paymentSlip,
    earningsReleased: b.earnings_released !== undefined ? b.earnings_released : false,
    releasedAt: b.released_at || null,
    releasedBy: b.released_by || null,
    transactionId: b.transaction_id || null,
    completedAt: b.completed_at || null,
    confirmedAt: b.confirmed_at || null,
    notes: b.notes || '',
    createdAt: b.created_at,
    updatedAt: b.updated_at
  };
}

// --- OFFER MAPPER ---
function mapOfferToFrontend(o) {
  if (!o) return null;
  let avatar = o.provider_avatar || '';
  if (avatar && !avatar.startsWith('http')) {
    const host = API_HOST;
    avatar = `${host}${avatar}`;
  }

  return {
    id: o.id,
    _id: o.id,
    bookingId: o.booking_id,
    providerId: o.provider_id,
    providerName: o.provider_name || 'Provider',
    providerAvatar: avatar,
    price: Number(o.price || 0),
    etaMinutes: Number(o.eta_minutes || 15),
    completionHours: Number(o.completion_hours || 1.0),
    message: o.message || '',
    rating: Number(o.rating || 0),
    reviewCount: Number(o.review_count || 0),
    completedJobs: Number(o.completed_jobs || 0),
    experienceYears: Number(o.experience_years || 0),
    distanceKm: o.distance_km !== undefined && o.distance_km !== null ? Number(o.distance_km) : null,
    verifiedBadge: Boolean(o.verified_badge),
    notes: o.notes || '',
    status: o.status || 'pending',
    createdAt: o.created_at,
    updatedAt: o.updated_at
  };
}

// --- REVIEW MAPPER ---
function mapReviewToFrontend(r) {
  if (!r) return null;
  return {
    id: r.id,
    bookingId: r.booking_id,
    customerId: r.customer_id,
    providerId: r.provider_id,
    rating: Number(r.rating || 5),
    reviewText: r.review_text || r.comment || '',
    recommend: r.recommend !== undefined ? r.recommend : true,
    quality: r.quality ?? null,
    professionalism: r.professionalism ?? null,
    punctuality: r.punctuality ?? null,
    value: r.value_rating ?? null,
    createdAt: r.created_at
  };
}

function mapBookingToDatabase(b) {
  if (!b) return null;
  const dbBooking = {};
  if (b._id || b.id) dbBooking.id = b._id || b.id;
  if (b.customerId !== undefined) dbBooking.customer_id = b.customerId;
  if (b.customerName !== undefined) dbBooking.customer_name = b.customerName;
  if (b.customerPhone !== undefined) dbBooking.customer_phone = b.customerPhone;
  if (b.providerId !== undefined) dbBooking.provider_id = b.providerId;
  if (b.providerName !== undefined) dbBooking.provider_name = b.providerName;
  if (b.category !== undefined) dbBooking.category = b.category;
  if (b.categoryName !== undefined) dbBooking.category_name = b.categoryName;
  if (b.serviceOption !== undefined) dbBooking.service_option = b.serviceOption;
  if (b.scheduledDate !== undefined) dbBooking.scheduled_date = b.scheduledDate;
  if (b.scheduledTime !== undefined) dbBooking.scheduled_time = b.scheduledTime;
  if (b.address !== undefined) dbBooking.address = b.address;
  if (b.price !== undefined) dbBooking.price = b.price;
  if (b.commission !== undefined) dbBooking.commission = b.commission;
  if (b.providerEarnings !== undefined) dbBooking.provider_earnings = b.providerEarnings;
  if (b.escrowAmount !== undefined) dbBooking.escrow_amount = b.escrowAmount;
  if (b.status !== undefined) dbBooking.status = b.status;
  if (b.paymentStatus !== undefined) dbBooking.payment_status = b.paymentStatus;
  if (b.paymentSlip !== undefined) dbBooking.payment_slip = b.paymentSlip;
  if (b.earningsReleased !== undefined) dbBooking.earnings_released = b.earningsReleased;
  if (b.releasedAt !== undefined) dbBooking.released_at = b.releasedAt;
  if (b.releasedBy !== undefined) dbBooking.released_by = b.releasedBy;
  if (b.transactionId !== undefined) dbBooking.transaction_id = b.transactionId;
  if (b.notes !== undefined) dbBooking.notes = b.notes;
  return dbBooking;
}

// --- WITHDRAWAL MAPPERS ---
function mapWithdrawalToFrontend(w) {
  if (!w) return null;
  return {
    _id: w.id,
    providerId: w.provider_id,
    providerName: w.provider_name || '',
    amount: Number(w.amount),
    bankName: w.bank_name,
    accountNumber: w.account_number || w.iban || '',
    iban: w.account_number || w.iban || '',
    accountHolder: w.account_holder || w.account_name || 'Holder',
    status: w.status,
    note: w.admin_notes || w.note || '',
    createdAt: w.created_at,
    updatedAt: w.updated_at
  };
}

function mapWithdrawalToDatabase(w) {
  if (!w) return null;
  const dbWithdrawal = {};
  if (w._id || w.id) dbWithdrawal.id = w._id || w.id;
  if (w.providerId !== undefined) dbWithdrawal.provider_id = w.providerId;
  if (w.providerName !== undefined) dbWithdrawal.provider_name = w.providerName;
  if (w.amount !== undefined) dbWithdrawal.amount = w.amount;
  if (w.bankName !== undefined) dbWithdrawal.bank_name = w.bankName;
  
  if (w.accountNumber !== undefined) dbWithdrawal.account_number = w.accountNumber;
  else if (w.iban !== undefined) dbWithdrawal.account_number = w.iban;
  
  if (w.accountHolder !== undefined) dbWithdrawal.account_holder = w.accountHolder;
  else if (w.providerName !== undefined) dbWithdrawal.account_holder = w.providerName;

  if (w.status !== undefined) dbWithdrawal.status = w.status;
  if (w.note !== undefined) dbWithdrawal.admin_notes = w.note;
  return dbWithdrawal;
}

// --- MESSAGE MAPPERS ---
function mapMessageToFrontend(m) {
  if (!m) return null;
  let loc = m.location || null;
  if (typeof loc === 'string') {
    try { loc = JSON.parse(loc); } catch (e) {}
  }
  const img = fileUrl(m.image || (loc && loc.image ? loc.image : null)) || null;
  const voiceUrl = fileUrl(m.voice_url) || null;
  const docUrl = fileUrl(m.document_url) || null;

  return {
    _id: m.id,
    id: m.id,
    bookingId: m.booking_id,
    senderId: m.sender_id,
    senderName: m.sender_name,
    senderRole: m.sender_role,
    text: m.text || '',
    location: loc,
    image: img,
    voiceUrl: voiceUrl,
    voiceDuration: m.voice_duration || 0,
    documentUrl: docUrl,
    documentName: m.document_name || '',
    replyTo: m.reply_to || null,
    reactions: m.reactions || {},
    delivered: m.delivered !== undefined ? m.delivered : true,
    deliveredAt: m.delivered_at || null,
    deleted: m.deleted !== undefined ? m.deleted : false,
    seen: m.seen !== undefined ? m.seen : (m.read || false),
    seenAt: m.seen_at || null,
    status: 'sent',
    tempId: m.temp_id || null,
    createdAt: m.created_at
  };
}

function mapMessageToDatabase(m) {
  if (!m) return null;
  const dbMessage = {};
  if (m._id || m.id) dbMessage.id = m._id || m.id;
  if (m.bookingId !== undefined) dbMessage.booking_id = m.bookingId;
  if (m.senderId !== undefined) dbMessage.sender_id = m.senderId;
  if (m.senderName !== undefined) dbMessage.sender_name = m.senderName;
  if (m.senderRole !== undefined) dbMessage.sender_role = m.senderRole;
  if (m.text !== undefined) dbMessage.text = m.text;
  if (m.location !== undefined) dbMessage.location = m.location;
  if (m.image !== undefined) dbMessage.image = m.image;
  if (m.read !== undefined) dbMessage.read = m.read;
  return dbMessage;
}

// --- WALLET MAPPER ---
function mapWalletToFrontend(w) {
  if (!w) return null;
  return {
    id: w.id,
    userId: w.user_id,
    balance: Number(w.available_balance !== undefined ? w.available_balance : (w.balance || 0)),
    pendingEarnings: Number(w.pending_balance !== undefined ? w.pending_balance : (w.pending_earnings || 0)),
    releasedEarnings: Number(w.released_balance !== undefined ? w.released_balance : (w.released_earnings || 0)),
    createdAt: w.created_at,
    updatedAt: w.updated_at
  };
}

// --- CALL HISTORY MAPPER ---
function mapCallHistoryToFrontend(c) {
  if (!c) return null;
  return {
    id: c.id,
    bookingId: c.booking_id,
    callerId: c.caller_id,
    callerName: c.caller_name || 'Caller',
    receiverId: c.receiver_id,
    receiverName: c.receiver_name || 'Receiver',
    durationSeconds: c.duration_seconds || 0,
    status: c.status,
    quality: c.quality || 'good',
    createdAt: c.created_at
  };
}

module.exports = {
  mapUserToFrontend,
  mapUserToDatabase,
  mapBookingToFrontend,
  mapBookingToDatabase,
  mapWithdrawalToFrontend,
  mapWithdrawalToDatabase,
  mapMessageToFrontend,
  mapMessageToDatabase,
  mapWalletToFrontend,
  mapCallHistoryToFrontend,
  mapOfferToFrontend,
  mapReviewToFrontend,
  orderStage
};
