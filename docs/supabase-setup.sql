-- Protein पूरा — pre-order storage
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run more than once.
--
-- What it does:
--   1. Creates the table orders are written to.
--   2. Turns on row-level security and grants the public exactly one thing:
--      the ability to ADD an order. Nobody can read, edit or delete orders
--      through the public key — only you, signed in to Supabase.
--
-- After running it, read your orders in Supabase → Table Editor → preorders.

create table if not exists public.preorders (
  id            bigint generated always as identity primary key,
  reference     text        not null unique,
  status        text        not null default 'pending',
  customer_name text        not null,
  email         text        not null,
  phone         text        not null,
  address1      text        not null,
  address2      text        not null default '',
  city          text        not null,
  state         text        not null,
  -- Bengaluru PIN codes, and only those: 560xxx. We deliver in one city, and
  -- the form filters what can be typed, but the form is not the guard --
  -- anyone can post to this table with the public key, so the rule lives here
  -- too. Widen this the day a second city opens, not before.
  pincode       text        not null check (pincode ~ '^560[0-9]{3}$'),
  notes         text        not null default '',
  items         jsonb       not null,
  -- Money as whole paise. ₹99 is 9900. Never a decimal.
  total_paise   integer     not null check (total_paise >= 0),

  -- What Razorpay was paid, as /api/verify-payment read it back from Razorpay
  -- itself. These are the figures to reconcile against the dashboard; the
  -- dashboard, not this table, is the record of the money.
  razorpay_order_id   text,
  razorpay_payment_id text,
  paid_paise          integer check (paid_paise >= 0),

  created_at    timestamptz not null default now()
);

-- One payment, one order. If the same payment id ever arrives twice, the
-- second insert fails rather than quietly creating a duplicate order.
create unique index if not exists preorders_payment_idx
  on public.preorders (razorpay_payment_id)
  where razorpay_payment_id is not null;

create index if not exists preorders_created_idx on public.preorders (created_at desc);

-- Locked by default: with RLS on and no policy, nothing is allowed at all.
alter table public.preorders enable row level security;

-- The single hole in that wall: the website may insert an order.
-- No select, no update, no delete — so the public key on the website cannot
-- read anybody's address back, including its own order.
drop policy if exists "website can place a pre-order" on public.preorders;
create policy "website can place a pre-order"
  on public.preorders
  for insert
  to anon
  with check (true);


-- ---------------------------------------------------------------------------
-- Already have the table? `create table if not exists` will not add the PIN
-- code rule to it. Run this once instead. It fails if a row already breaks the
-- rule -- fix or delete that row, then run it again.

--   alter table public.preorders
--     drop constraint if exists preorders_pincode_check;
--   alter table public.preorders
--     add constraint preorders_pincode_check
--     check (pincode ~ '^560[0-9]{3}$');

-- To see whether anything would fail first:

--   select id, reference, pincode from public.preorders
--   where pincode !~ '^560[0-9]{3}$';


-- ---------------------------------------------------------------------------
-- Same again for the Razorpay columns, if the table predates payments:

--   alter table public.preorders
--     add column if not exists razorpay_order_id   text,
--     add column if not exists razorpay_payment_id text,
--     add column if not exists paid_paise          integer check (paid_paise >= 0);
--
--   create unique index if not exists preorders_payment_idx
--     on public.preorders (razorpay_payment_id)
--     where razorpay_payment_id is not null;


-- ---------------------------------------------------------------------------
-- WORTH KNOWING. The insert policy above says `with check (true)`: the public
-- key may write any row it likes, including one that claims status 'paid' with
-- no payment behind it. That was harmless when nothing was being charged.
--
-- It is still not a way to get free snacks -- no order ships without a payment
-- in the Razorpay dashboard to match it -- but it does mean this table is a
-- convenience record, and Razorpay is the truth. Reconcile on
-- razorpay_payment_id before shipping anything.
--
-- To close the gap properly the server has to write the row: give the Vercel
-- project a SUPABASE_SERVICE_ROLE_KEY, have /api/verify-payment insert it
-- after verifying, and drop this insert policy so the browser cannot write at
-- all. That key is a password -- it must never go in assets/ or in git.
