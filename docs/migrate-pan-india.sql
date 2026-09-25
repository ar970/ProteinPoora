-- Protein पूरा — open delivery up from Bengaluru to all of India.
--
-- RUN THIS WHOLE FILE, AS IS, in Supabase → SQL Editor → New query → Run,
-- BEFORE the pan-India site goes live. Nothing here is commented out and
-- nothing needs editing. It is safe to run more than once, and it does not
-- touch or delete a single existing row.
--
-- Why it has to go first: the table currently carries a check constraint that
-- only accepts 560xxx PIN codes. Postgres refuses an INSERT that breaks a
-- check constraint, and it refuses the WHOLE row — so a customer in Delhi
-- would pay, and then the order would be thrown away at the last step. The
-- site has no way to talk its way past a constraint. This is the fix, and it
-- is the one thing here that cannot wait.
--
-- (If it ever does happen, the order is not actually lost: the address and the
-- items are written into the Razorpay order's notes before the payment, so the
-- Razorpay dashboard is enough to fulfil it. The customer is told to call.
-- That is a backstop, not a plan.)


-- 1. The PIN rule, widened. ---------------------------------------------------
--
-- Any Indian PIN code: six digits, first never 0, because that range was never
-- allocated. NOT VALID for the same reason as last time — it applies to
-- everything written from now on and leaves the history alone, so the
-- migration cannot fail on a row somebody typed oddly two months ago.

alter table public.preorders
  drop constraint if exists preorders_pincode_check;

alter table public.preorders
  add constraint preorders_pincode_check
  check (pincode ~ '^[1-9][0-9]{5}$')
  not valid;


-- 2. City and state are real answers again. -----------------------------------
--
-- They were fixed to Bengaluru and Karnataka while we delivered in one city,
-- so every existing row says that whether or not anyone typed it. Nothing
-- needs changing for new orders — the columns already exist and the checkout
-- now sends what the customer entered — but if either column was ever given a
-- default, it has to go, or a blank city silently becomes Bengaluru.

alter table public.preorders
  alter column city  drop default,
  alter column state drop default;


-- 3. Tell me it worked. -------------------------------------------------------
-- Expect: one row, and its definition should read ~ '^[1-9][0-9]{5}$'.

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.preorders'::regclass
  and conname = 'preorders_pincode_check';


-- ---------------------------------------------------------------------------
-- Afterwards, a Delhi PIN should insert cleanly. `npm run check:supabase`
-- checks exactly that against the live table, and says so in one line:
--
--   npm run check:supabase           -- read-only
--   npm run check:supabase -- --write   -- places and removes a test order
