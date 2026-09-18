-- Protein पूरा — bring an existing preorders table up to date with payments.
--
-- RUN THIS WHOLE FILE, AS IS, in Supabase → SQL Editor → New query → Run.
-- Nothing here is commented out and nothing needs editing. It is safe to run
-- more than once, and it does not touch or delete a single existing row.
--
-- Why it is needed: the checkout writes razorpay_order_id, razorpay_payment_id
-- and paid_paise. Postgres refuses an INSERT that names a column the table
-- does not have -- and it refuses the WHOLE row, so the customer's address
-- goes down with it. A paid order then vanishes. That is what has been
-- happening: every row in the table still says 'pending', because no paid
-- order has ever been able to land.


-- 1. The three columns the checkout sends. ----------------------------------

alter table public.preorders
  add column if not exists razorpay_order_id   text,
  add column if not exists razorpay_payment_id text,
  add column if not exists paid_paise          integer;

-- Separate statement: a check constraint cannot be added by `add column if not
-- exists` when the column is already there.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'preorders_paid_paise_check'
  ) then
    alter table public.preorders
      add constraint preorders_paid_paise_check check (paid_paise is null or paid_paise >= 0);
  end if;
end $$;


-- 2. One payment, one order. ------------------------------------------------
-- If the same payment id ever arrives twice -- a double-tap, a retry -- the
-- second insert fails instead of quietly creating a duplicate order.

create unique index if not exists preorders_payment_idx
  on public.preorders (razorpay_payment_id)
  where razorpay_payment_id is not null;


-- 3. Bengaluru-only delivery, without breaking on the old rows. -------------
--
-- NOT VALID is the important word. The table already holds orders from when
-- the site shipped India-wide, and a plain CHECK would be validated against
-- every one of them and fail -- leaving you with an error message and no
-- migration. NOT VALID applies the rule to everything written from now on and
-- leaves the history alone, which is exactly what is wanted: the old orders
-- really were placed, and rewriting or deleting them to satisfy a rule added
-- afterwards would be lying about what happened.

alter table public.preorders
  drop constraint if exists preorders_pincode_check;

alter table public.preorders
  add constraint preorders_pincode_check
  check (pincode ~ '^560[0-9]{3}$')
  not valid;


-- 4. Tell me it worked. -----------------------------------------------------
-- Expect: three rows, one per column. If you get fewer, step 1 did not run.

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'preorders'
  and column_name in ('razorpay_order_id', 'razorpay_payment_id', 'paid_paise')
order by column_name;


-- ---------------------------------------------------------------------------
-- Afterwards, the orders worth acting on are the ones with a payment against
-- them. The old pre-order rows stay 'pending' and are not sales:
--
--   select reference, customer_name, phone, address1, address2, city, pincode,
--          items, total_paise, razorpay_payment_id, created_at
--   from public.preorders
--   where status = 'paid'
--   order by created_at desc;
--
-- Reconcile razorpay_payment_id against the Razorpay dashboard before you
-- pack anything. The browser writes these rows with the public key, so the
-- table records what the customer's browser claimed; Razorpay records what was
-- actually paid.
