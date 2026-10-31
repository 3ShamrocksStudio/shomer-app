-- SH✡MER Command: paid-plan lock for dashboard.html (branch dashboard-lock).
-- NOT APPLIED. Apply only with Dave's OK (see DASHBOARD-LOCK.md).
--
-- One row per dashboard account. A new dashboard sign-up gets status 'pending'.
-- Only an admin (SQL editor / service role) can change status or plan; signed-in users can
-- read their OWN row and nothing else. Live data in the dashboard is shown only when
-- status = 'active'.

create table if not exists public.command_accounts (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  org          text not null default '',
  territory    text not null default '',
  status       text not null default 'pending' check (status in ('pending','active','suspended')),
  plan         text not null default 'none'    check (plan in ('none','pilot','annual','council')),
  requested_at timestamptz not null default now(),
  activated_at timestamptz,
  note         text not null default ''
);

alter table public.command_accounts enable row level security;

-- read your own row only; no client insert/update/delete policies at all
drop policy if exists command_accounts_read_own on public.command_accounts;
create policy command_accounts_read_own on public.command_accounts
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.command_accounts from anon;
revoke insert, update, delete, truncate on public.command_accounts from authenticated;
grant select on public.command_accounts to authenticated;

-- A dashboard sign-up (user metadata role = 'client', set by dashboard.html) becomes a pending row.
-- Status and plan are never taken from user metadata.
create or replace function public.command_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data->>'role','') = 'client' then
    insert into public.command_accounts (user_id, email, org, territory)
    values (new.id, coalesce(new.email,''),
            left(coalesce(new.raw_user_meta_data->>'org',''), 120),
            left(coalesce(new.raw_user_meta_data->>'territory',''), 120))
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists command_on_signup on auth.users;
create trigger command_on_signup after insert on auth.users
  for each row execute function public.command_on_signup();

-- Dashboard accounts that already exist start as pending too (no one keeps live access by default).
insert into public.command_accounts (user_id, email, org, territory)
select u.id, coalesce(u.email,''), left(coalesce(u.raw_user_meta_data->>'org',''),120), left(coalesce(u.raw_user_meta_data->>'territory',''),120)
from auth.users u
where coalesce(u.raw_user_meta_data->>'role','') = 'client'
on conflict (user_id) do nothing;

-- Admin-only: activate / suspend an account. Run in the Supabase SQL editor, e.g.
--   select public.command_set_status('ops@city.gov.il', 'active', 'pilot', 'signed pilot 2026-11-02');
create or replace function public.command_set_status(p_email text, p_status text, p_plan text default null, p_note text default null)
returns public.command_accounts language plpgsql security definer set search_path = public as $$
declare r public.command_accounts;
begin
  update public.command_accounts
     set status = p_status,
         plan = coalesce(p_plan, plan),
         note = coalesce(p_note, note),
         activated_at = case when p_status = 'active' then now() else activated_at end
   where lower(email) = lower(p_email)
  returning * into r;
  if r.user_id is null then raise exception 'no command account for %', p_email; end if;
  return r;
end $$;

revoke all on function public.command_set_status(text,text,text,text) from public, anon, authenticated;
revoke all on function public.command_on_signup() from public, anon, authenticated;
