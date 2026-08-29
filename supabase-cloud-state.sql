create table if not exists public.app_state (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint app_state_singleton check (id = 'main')
);

alter table public.app_state enable row level security;

drop policy if exists "active users can read app state" on public.app_state;
drop policy if exists "active users can write app state" on public.app_state;

create policy "active users can read app state"
on public.app_state
for select
to authenticated
using (public.is_active_user());

create policy "active users can write app state"
on public.app_state
for all
to authenticated
using (public.is_active_user())
with check (public.is_active_user());

insert into public.app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
