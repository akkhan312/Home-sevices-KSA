-- Database-level guarantees for the marketplace workflow. Run after supabase-schema.sql (CI does this).
-- Each block raises an exception if a forbidden write is accepted.

INSERT INTO users (id, email, name, role) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'ci-customer@test.sa', 'CI Customer', 'customer'),
  ('00000000-0000-0000-0000-0000000000d1', 'ci-provider@test.sa', 'CI Provider', 'provider')
ON CONFLICT DO NOTHING;

INSERT INTO bookings (id, customer_id, provider_id, category, price)
VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 'ac', 500)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  -- Communication cannot be unlocked while the order is unpaid.
  BEGIN
    UPDATE bookings SET communication_status = 'UNLOCKED' WHERE id = '00000000-0000-0000-0000-0000000000b1';
    RAISE EXCEPTION 'ASSERTION FAILED: unlocked an unpaid order';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Only known payment states are allowed.
  BEGIN
    UPDATE bookings SET payment_status = 'paid' WHERE id = '00000000-0000-0000-0000-0000000000b1';
    RAISE EXCEPTION 'ASSERTION FAILED: accepted legacy payment status';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- One pending receipt per order.
  INSERT INTO payment_proofs (booking_id, customer_id, file_path, transaction_number, amount)
  VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'private/a.png', 'T1', 500);
  BEGIN
    INSERT INTO payment_proofs (booking_id, customer_id, file_path, transaction_number, amount)
    VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'private/b.png', 'T2', 500);
    RAISE EXCEPTION 'ASSERTION FAILED: second pending receipt accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Payment then unlock is allowed.
  UPDATE bookings SET payment_status = 'PAID', communication_status = 'UNLOCKED' WHERE id = '00000000-0000-0000-0000-0000000000b1';

  -- One ledger entry per type per order.
  INSERT INTO ledger_entries (transaction_id, booking_id, amount, type) VALUES ('CI-TX-1', '00000000-0000-0000-0000-0000000000b1', 500, 'CUSTOMER_PAYMENT');
  BEGIN
    INSERT INTO ledger_entries (transaction_id, booking_id, amount, type) VALUES ('CI-TX-2', '00000000-0000-0000-0000-0000000000b1', 500, 'CUSTOMER_PAYMENT');
    RAISE EXCEPTION 'ASSERTION FAILED: duplicate ledger entry accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- One payout per order.
  INSERT INTO payouts (booking_id, provider_id, customer_payment, commission, amount)
  VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 500, 50, 450);
  BEGIN
    INSERT INTO payouts (booking_id, provider_id, customer_payment, commission, amount)
    VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 500, 50, 450);
    RAISE EXCEPTION 'ASSERTION FAILED: duplicate payout accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  RAISE NOTICE 'All database constraint assertions passed';
END $$;
