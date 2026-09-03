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
  pincode       text        not null,
  notes         text        not null default '',
  items         jsonb       not null,
  -- Money as whole paise. ₹99 is 9900. Never a decimal.
  total_paise   integer     not null check (total_paise >= 0),
  created_at    timestamptz not null default now()
);

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
