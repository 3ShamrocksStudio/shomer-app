# Dashboard paid-plan lock (branch `dashboard-lock`, NOT merged, migration NOT applied)

Staging preview (no backend, noindex): https://3shamrocksstudio.github.io/shomer-dashboard-lock-preview/
(bottom bar: login gate · waiting screen · suspended · demo)

## What changes in `dashboard.html`
- **No open live view.** The green "תצוגה חיה · נתוני רשת אמת (PoC)" button is gone, and a visitor who
  is not signed in stays on the login gate (before: the page booted straight into the live network view).
- **Demo stays open to everyone** and now uses **sample data only**: the incidents were already samples;
  the network numbers (devices online, daily activity, trends) used to come from the real feed and are
  now a generated sample too. The demo never requests the real feed. Labels: top banner
  "מצב הדגמה · נתוני דוגמה, לא נתונים חיים", profile panel "מצב הדגמה · נתוני דוגמה", report badge and
  the impact panel say the network numbers are samples. Police statistics stay the public official data.
- **Live data only for an activated account.** After login the page reads the account's own row in
  `public.command_accounts`. Only `status = 'active'` opens the live dashboard. Pending, suspended,
  no row, or any error (for example the table not existing yet) shows the waiting screen. It fails closed.
- **Waiting screen:** "החשבון שלך ממתין להפעלה. נחזור אליך תוך יום עסקים אחד." plus the English line,
  a button to the Command plans, a demo button and sign-out. Suspended accounts get "הגישה לנתונים
  החיים מושהית" with the support address.
- **Upgrade path:** the gate and the waiting screen link to
  https://3shamrocksstudio.github.io/shomer-command/#plans (staging until the production page exists).
- Sign-up now says the request was received and the account is activated after we get back to them.

## Backend: `supabase/migrations/20261031120000_command_accounts.sql`
- Table `command_accounts` (user, email, org, territory, `status` pending/active/suspended,
  `plan` none/pilot/annual/council, dates, note). RLS on: a signed-in user can read **only their own
  row**; nobody can insert, update or delete from the browser.
- A trigger creates a `pending` row for every dashboard sign-up (metadata `role = 'client'`). Status and
  plan are never taken from what the user sends.
- Existing dashboard accounts are back-filled as `pending`, so nobody keeps live access by default.
- Admin-only function `command_set_status(email, status, plan, note)`; execution is revoked from
  browser roles, so it runs only from the Supabase SQL editor (Dave, or Claude with access).
- Tested on a local Postgres 16 with a Supabase-like auth shim: back-fill, sign-up trigger ignores
  `status/plan` in metadata, own-row read only, self-activation refused, anon read refused,
  browser call of the admin function refused, admin activation works, bad status / unknown email refused.

## NEEDS YOUR EYES: what Dave approves
1. The gate and waiting-screen wording (Hebrew + English), and "within one business day" as a promise.
2. Existing dashboard accounts become `pending` until activated by hand.
3. **Shared Supabase project.** The dashboard logs into the same Supabase project as Trashure Hunters
   (kids' game). Municipal accounts therefore sit in the same `auth.users` as parents, and the game's
   existing `create_parent_profile_on_signup` trigger also creates a `parent_profiles` row for every
   dashboard sign-up. I did not change that. A separate Supabase project for Command would keep them
   apart (the free tier allows a second project; it needs your OK).
4. **Limit of this lock:** it locks the dashboard, not the data source. The live feed (`dashfeed` in
   Firebase) is still publicly readable by design (it holds no names, ids or precise locations). If the
   live numbers themselves must be paid-only, the next step is a small server proxy (Supabase Edge
   Function) that checks `command_accounts` and reads `dashfeed` with a server key, after which
   `dashfeed` can be closed to the public. Not built.

## Apply steps (in this order)
1. Supabase dashboard → project `otkvebgrdiayjnqrytrn` → SQL editor → paste and run
   `supabase/migrations/20261031120000_command_accounts.sql` (or `supabase db push` from this repo).
2. Activate each paying account:
   `select public.command_set_status('ops@city.gov.il', 'active', 'pilot', 'pilot signed <date>');`
   Suspend: `select public.command_set_status('ops@city.gov.il', 'suspended');`
   List waiting accounts: `select email, org, territory, requested_at from public.command_accounts where status = 'pending' order by requested_at;`
3. Merge `dashboard-lock` into `main` (this is the step that changes the live site).
   If step 1 is skipped, every login shows the waiting screen (fails closed); the demo still works.
4. When the production Command page exists, replace the two `shomer-command/#plans` links.

Rollback: revert the merge; in SQL `drop trigger if exists command_on_signup on auth.users;
drop function if exists public.command_on_signup(); drop function if exists public.command_set_status(text,text,text,text);
drop table if exists public.command_accounts;`
