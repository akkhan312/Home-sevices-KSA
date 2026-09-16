// In-memory stand-in for the Supabase (PostgREST) client used by the API. It implements the query-builder
// subset the backend uses, with SQL NULL semantics, table defaults, unique indexes and the CHECK constraints
// that matter for the marketplace workflow, so integration tests exercise real route/service code.
const crypto = require('crypto');

const nowIso = () => new Date().toISOString();

const DEFAULTS = {
  users: () => ({ role: 'customer', status: 'active', approval_status: 'APPROVED', rating: 0, review_count: 0, completed_jobs: 0, service_categories: [] }),
  bookings: (db) => ({
    status: 'pending',
    payment_status: 'UNPAID',
    communication_status: 'LOCKED',
    payout_status: 'NONE',
    earnings_released: false,
    order_number: `BP-${db.nextSeq('booking_order_seq', 10001)}`,
  }),
  wallets: () => ({ available_balance: 0, pending_balance: 0, released_balance: 0 }),
  payment_proofs: () => ({ status: 'PENDING' }),
  payouts: () => ({ status: 'PENDING', currency: 'SAR' }),
  ledger_entries: () => ({ currency: 'SAR', status: 'COMPLETED' }),
  messages: () => ({ seen: false, delivered: false, reactions: {} }),
  notifications: () => ({ read: false, data: {} }),
  booking_offers: () => ({ status: 'pending' }),
  reports: () => ({ status: 'open' }),
  wallet_transactions: () => ({ status: 'completed' }),
  withdrawals: () => ({ status: 'pending' }),
};

// [columns, optional predicate for partial unique indexes]
const UNIQUE = {
  users: [[['email']]],
  bookings: [[['order_number']]],
  wallets: [[['user_id']]],
  reviews: [[['booking_id']]],
  payouts: [[['booking_id']]],
  payments: [[['booking_id']], [['transaction_id']]],
  booking_offers: [[['booking_id', 'provider_id']]],
  ledger_entries: [[['transaction_id']], [['booking_id', 'type'], (r) => r.type !== 'ADJUSTMENT' && r.booking_id !== null]],
  payment_proofs: [[['booking_id'], (r) => r.status === 'PENDING']],
  platform_settings: [[['key']]],
  commission_rules: [[['category']]],
  user_push_tokens: [[['user_id']]],
  chat_pinned: [[['user_id', 'booking_id']]],
};

const CHECKS = {
  bookings: [
    (r) => ['UNPAID', 'PAYMENT_SUBMITTED', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'REFUNDED'].includes(r.payment_status) || 'bookings_payment_status_check',
    (r) => r.communication_status === 'LOCKED' || r.payment_status === 'PAID' || 'bookings_unlock_requires_payment',
    (r) => ['NONE', 'PENDING', 'PAID', 'CANCELLED'].includes(r.payout_status) || 'bookings_payout_status_check',
  ],
  ledger_entries: [(r) => Number(r.amount) >= 0 || 'ledger_amount_check'],
  reviews: [(r) => (Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5) || 'reviews_rating_check'],
};

class FakeDb {
  constructor() {
    this.tables = new Map();
    this.sequences = new Map();
  }
  table(name) {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name);
  }
  nextSeq(name, start) {
    const v = this.sequences.has(name) ? this.sequences.get(name) + 1 : start;
    this.sequences.set(name, v);
    return v;
  }
  reset() {
    this.tables.clear();
    this.sequences.clear();
  }
}

const isNull = (v) => v === null || v === undefined;

function coerce(raw) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

const same = (a, b) => (typeof a === 'number' || typeof b === 'number' ? Number(a) === Number(b) : String(a) === String(b));

function splitTopLevel(expr) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of expr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function parseOrCondition(part) {
  const firstDot = part.indexOf('.');
  const col = part.slice(0, firstDot);
  const rest = part.slice(firstDot + 1);
  const opDot = rest.indexOf('.');
  const op = rest.slice(0, opDot);
  const value = rest.slice(opDot + 1);
  switch (op) {
    case 'eq':
      return (r) => !isNull(r[col]) && same(r[col], coerce(value));
    case 'neq':
      return (r) => !isNull(r[col]) && !same(r[col], coerce(value));
    case 'is':
      return (r) => (value === 'null' ? isNull(r[col]) : r[col] === coerce(value));
    case 'in': {
      const list = value.replace(/^\(|\)$/g, '').split(',');
      return (r) => !isNull(r[col]) && list.some((v) => same(r[col], v));
    }
    default:
      throw new Error(`fakeSupabase: unsupported or() operator ${op}`);
  }
}

class Query {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
    this.op = 'select';
    this.filters = [];
    this.returning = false;
    this.countMode = null;
    this.head = false;
    this.singleMode = null;
    this.orderBy = null;
    this.limitN = null;
  }

  select(_cols, opts = {}) {
    if (this.op === 'select') {
      this.countMode = opts.count || null;
      this.head = Boolean(opts.head);
    } else {
      this.returning = true;
    }
    return this;
  }
  insert(rows) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  upsert(rows, opts = {}) {
    this.op = 'upsert';
    this.payload = rows;
    this.onConflict = (opts.onConflict || 'id').split(',').map((s) => s.trim());
    return this;
  }
  update(patch) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  eq(col, v) { this.filters.push((r) => !isNull(r[col]) && !isNull(v) && same(r[col], v)); return this; }
  neq(col, v) { this.filters.push((r) => !isNull(r[col]) && !same(r[col], v)); return this; }
  gt(col, v) { this.filters.push((r) => !isNull(r[col]) && Number(r[col]) > Number(v)); return this; }
  gte(col, v) { this.filters.push((r) => !isNull(r[col]) && Number(r[col]) >= Number(v)); return this; }
  lt(col, v) { this.filters.push((r) => !isNull(r[col]) && Number(r[col]) < Number(v)); return this; }
  lte(col, v) { this.filters.push((r) => !isNull(r[col]) && Number(r[col]) <= Number(v)); return this; }
  in(col, list) { this.filters.push((r) => !isNull(r[col]) && list.some((v) => same(r[col], v))); return this; }
  is(col, v) { this.filters.push((r) => (v === null ? isNull(r[col]) : r[col] === v)); return this; }
  not(col, op, v) {
    if (op !== 'is' || v !== null) throw new Error('fakeSupabase: only not(col, "is", null) is supported');
    this.filters.push((r) => !isNull(r[col]));
    return this;
  }
  contains(col, arr) { this.filters.push((r) => Array.isArray(r[col]) && arr.every((v) => r[col].includes(v))); return this; }
  ilike(col, pattern) {
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
    this.filters.push((r) => !isNull(r[col]) && re.test(String(r[col])));
    return this;
  }
  or(expr) {
    const conds = splitTopLevel(expr).map(parseOrCondition);
    this.filters.push((r) => conds.some((c) => c(r)));
    return this;
  }
  order(col, { ascending = true } = {}) { this.orderBy = { col, ascending }; return this; }
  limit(n) { this.limitN = n; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }

  then(resolve, reject) {
    try {
      resolve(this.execute());
    } catch (err) {
      reject(err);
    }
  }

  matches(row) {
    return this.filters.every((f) => f(row));
  }

  violation(rows, candidate, ignore) {
    for (const [cols, predicate] of UNIQUE[this.tableName] || []) {
      if (predicate && !predicate(candidate)) continue;
      if (cols.some((c) => isNull(candidate[c]))) continue;
      const clash = rows.find((r) => r !== ignore && (!predicate || predicate(r)) && cols.every((c) => same(r[c], candidate[c])));
      if (clash) return { code: '23505', message: `duplicate key value violates unique constraint on ${this.tableName}(${cols.join(',')})` };
    }
    for (const check of CHECKS[this.tableName] || []) {
      const result = check(candidate);
      if (result !== true) return { code: '23514', message: `new row violates check constraint "${result}"` };
    }
    return null;
  }

  finish(rows) {
    let out = rows.map((r) => structuredClone(r));
    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      out.sort((a, b) => {
        if (a[col] === b[col]) return 0;
        if (isNull(a[col])) return 1;
        if (isNull(b[col])) return -1;
        return (a[col] > b[col] ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN);

    if (this.singleMode === 'single') {
      if (out.length !== 1) return { data: null, error: { code: 'PGRST116', message: `JSON object requested, ${out.length} rows returned` } };
      return { data: out[0], error: null };
    }
    if (this.singleMode === 'maybe') {
      if (out.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows returned' } };
      return { data: out[0] || null, error: null };
    }
    return { data: out, error: null };
  }

  execute() {
    const rows = this.db.table(this.tableName);

    if (this.op === 'select') {
      const matched = rows.filter((r) => this.matches(r));
      if (this.head) return { data: null, count: matched.length, error: null };
      const result = this.finish(matched);
      if (this.countMode) result.count = matched.length;
      return result;
    }

    if (this.op === 'insert' || this.op === 'upsert') {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload];
      const staged = [];
      for (const raw of input) {
        if (this.op === 'upsert') {
          const existing = rows.find((r) => this.onConflict.every((c) => same(r[c], raw[c])));
          if (existing) {
            const next = { ...existing, ...raw };
            const err = this.violation(rows, next, existing);
            if (err) return { data: null, error: err };
            Object.assign(existing, next);
            staged.push(existing);
            continue;
          }
        }
        const defaults = DEFAULTS[this.tableName] ? DEFAULTS[this.tableName](this.db) : {};
        const row = { id: crypto.randomUUID(), created_at: nowIso(), updated_at: nowIso(), ...defaults, ...raw };
        const err = this.violation([...rows, ...staged], row, null);
        if (err) return { data: null, error: err };
        staged.push(row);
      }
      for (const row of staged) if (!rows.includes(row)) rows.push(row);
      if (!this.returning) return { data: null, error: null };
      return this.finish(staged);
    }

    if (this.op === 'update') {
      const matched = rows.filter((r) => this.matches(r));
      for (const r of matched) {
        const err = this.violation(rows, { ...r, ...this.payload }, r);
        if (err) return { data: null, error: err };
      }
      for (const r of matched) Object.assign(r, this.payload);
      if (!this.returning) return { data: null, error: null };
      return this.finish(matched);
    }

    if (this.op === 'delete') {
      const keep = rows.filter((r) => !this.matches(r));
      const removed = rows.length - keep.length;
      rows.length = 0;
      rows.push(...keep);
      return { data: null, error: null, count: removed };
    }

    throw new Error(`fakeSupabase: unsupported op ${this.op}`);
  }
}

function createFakeSupabase() {
  const db = new FakeDb();
  return {
    db,
    from: (table) => new Query(db, table),
    rows: (table) => db.table(table),
    insertRow: (table, row) => {
      const q = new Query(db, table).insert(row).select().single();
      const { data, error } = q.execute();
      if (error) throw new Error(error.message);
      return data;
    },
  };
}

module.exports = { createFakeSupabase };
