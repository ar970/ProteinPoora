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


-- 3. Prove it, with a real Delhi order. ---------------------------------------
--
-- Checking the rule by reading it back only proves the rule was written. This
-- puts an actual Delhi row through the same table the website writes to, which
-- is the thing that has been failing, and then deletes it again. It leaves
-- nothing behind.
--
-- If the migration above did not take, THIS is where it stops, with Postgres
-- saying exactly why. That error is the answer, not a problem with this file.

insert into public.preorders
  (reference, status, customer_name, email, phone,
   address1, address2, city, state, pincode, notes, items, total_paise)
values
  ('PP-SELFTEST', 'test', 'Self test — this row deletes itself',
   'selftest@example.com', '9999999999',
   'Automated check from docs/migrate-pan-india.sql', '',
   'New Delhi', 'Delhi', '110001', 'safe to delete', '[]'::jsonb, 0);

delete from public.preorders where reference = 'PP-SELFTEST';


-- 4. Tell me it worked. -------------------------------------------------------
-- Expect one row, reading: CHECK ((pincode ~ '^[1-9][0-9]{5}$'::text)) NOT VALID
-- Getting this far at all means a Delhi order inserted cleanly, because step 3
-- would have stopped the whole thing otherwise.

select pg_get_constraintdef(oid) as pin_rule_now,
       'A Delhi order inserted and was removed. The table is open across India.'
         as result
from pg_constraint
where conrelid = 'public.preorders'::regclass
  and conname = 'preorders_pincode_check';


-- ---------------------------------------------------------------------------
-- From a terminal, with the repo checked out, the same check again plus the
-- column list the checkout needs:
--
--   npm run check:supabase              -- read-only
--   npm run check:supabase -- --write   -- places and removes a test order
