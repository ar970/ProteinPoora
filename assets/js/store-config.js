/* Protein पूरा — where pre-orders are sent.
 *
 * Fill these two in and orders go straight from the customer's browser into
 * your Supabase table. Nothing else has to be configured: no Vercel settings,
 * no environment variables, no redeploy dance. You read the orders in
 * Supabase's own Table Editor.
 *
 * Both values below are PUBLIC by design. Supabase calls the second one the
 * "anon" or "publishable" key, and it is meant to sit in browser code where
 * anyone can read it. It is safe in this repository. What keeps your orders
 * private is the row-level security policy in docs/ADMIN-SETUP.md, which lets
 * the public *insert* an order and nothing else — no reading, no editing, no
 * deleting. Never put the "service_role" or "secret" key here; that one really
 * is a password and would hand anybody your whole database.
 *
 * Where to find them: Supabase → your project → Settings → API.
 *
 *   url     — Project URL,   like https://abcdefghijklmnop.supabase.co
 *   anonKey — the anon / publishable key, a long string starting "eyJ" or "sb_"
 *
 * Leave them empty and the site falls back to posting to its own /api/preorders,
 * which needs a database connected to the Vercel project instead.
 */
window.PP_SUPABASE = {
  url: 'https://rahalwezrtrxvpqaegha.supabase.co',
  anonKey: 'sb_publishable_5gIS4hjbDX-IXPAkx81rTw_LEjv6Kex',
  table: 'preorders'
};
