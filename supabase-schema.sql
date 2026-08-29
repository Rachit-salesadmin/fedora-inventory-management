-- Fedora Inventory Management - Supabase production schema
-- Run this in Supabase SQL Editor once for the production/staging backend.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'warehouse_manager'
    check (role in ('owner', 'admin', 'warehouse_manager', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id text primary key,
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true
);

insert into public.warehouses (id, name, sort_order)
values
  ('panipat', 'Panipat', 1),
  ('delhi', 'Delhi', 2),
  ('bangalore', 'Bangalore', 3)
on conflict (id) do nothing;

create table if not exists public.catalogues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  box_size integer not null check (box_size > 0),
  delhi_refill_enabled boolean not null default true,
  bangalore_refill_enabled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skus (
  id uuid primary key default gen_random_uuid(),
  catalogue_id uuid not null references public.catalogues(id) on delete cascade,
  sku text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sku_refill_settings (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus(id) on delete cascade,
  warehouse_id text not null references public.warehouses(id),
  refill_enabled boolean not null default true,
  max_rolls integer not null default 24 check (max_rolls >= 0),
  reorder_1 integer not null default 12 check (reorder_1 >= 0),
  reorder_2 integer not null default 0 check (reorder_2 >= 0),
  reorder_3 integer not null default 0 check (reorder_3 >= 0),
  reorder_4 integer not null default 0 check (reorder_4 >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku_id, warehouse_id)
);

create table if not exists public.inventory_uploads (
  id uuid primary key default gen_random_uuid(),
  warehouse_id text not null references public.warehouses(id),
  file_name text,
  imported_skus integer not null default 0,
  missing_master_skus integer not null default 0,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.inventory_stock (
  warehouse_id text not null references public.warehouses(id),
  sku_id uuid not null references public.skus(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  last_upload_id uuid references public.inventory_uploads(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, sku_id)
);

create table if not exists public.pallet_ready_sos (
  id uuid primary key default gen_random_uuid(),
  so_number text not null,
  destination_warehouse_id text not null references public.warehouses(id),
  status text not null default 'pallet_ready'
    check (status in ('pallet_ready', 'voided', 'dispatched')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  void_reason text,
  unique (so_number)
);

create table if not exists public.pallet_ready_so_lines (
  id uuid primary key default gen_random_uuid(),
  so_id uuid not null references public.pallet_ready_sos(id) on delete cascade,
  sku_id uuid not null references public.skus(id),
  boxes integer not null check (boxes > 0),
  rolls integer not null check (rolls > 0),
  box_size integer not null check (box_size > 0)
);

create table if not exists public.dispatch_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  destination_warehouse_id text not null references public.warehouses(id),
  status text not null default 'in_transit'
    check (status in ('in_transit', 'received')),
  eta date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  received_by uuid references auth.users(id),
  received_at timestamptz
);

create table if not exists public.dispatch_batch_sos (
  batch_id uuid not null references public.dispatch_batches(id) on delete cascade,
  so_id uuid not null references public.pallet_ready_sos(id),
  primary key (batch_id, so_id)
);

create table if not exists public.dispatch_batch_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.dispatch_batches(id) on delete cascade,
  sku_id uuid not null references public.skus(id),
  boxes integer not null check (boxes > 0),
  rolls integer not null check (rolls > 0),
  box_size integer not null check (box_size > 0)
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  warehouse_id text references public.warehouses(id),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  read_by uuid[] not null default '{}'
);

create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  page text,
  screenshot_url text,
  browser_info text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  reported_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  page text,
  browser_info text,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_skus_catalogue_id on public.skus(catalogue_id);
create index if not exists idx_inventory_stock_sku_id on public.inventory_stock(sku_id);
create index if not exists idx_pallet_ready_sos_destination on public.pallet_ready_sos(destination_warehouse_id, status);
create index if not exists idx_dispatch_batches_destination on public.dispatch_batches(destination_warehouse_id, status);
create index if not exists idx_logs_created_at on public.logs(created_at desc);
create index if not exists idx_issue_reports_status on public.issue_reports(status, created_at desc);

alter table public.profiles enable row level security;
alter table public.warehouses enable row level security;
alter table public.catalogues enable row level security;
alter table public.skus enable row level security;
alter table public.sku_refill_settings enable row level security;
alter table public.inventory_uploads enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.pallet_ready_sos enable row level security;
alter table public.pallet_ready_so_lines enable row level security;
alter table public.dispatch_batches enable row level security;
alter table public.dispatch_batch_sos enable row level security;
alter table public.dispatch_batch_lines enable row level security;
alter table public.logs enable row level security;
alter table public.issue_reports enable row level security;
alter table public.app_errors enable row level security;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('owner', 'admin')
  );
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'warehouses',
    'catalogues',
    'skus',
    'sku_refill_settings',
    'inventory_uploads',
    'inventory_stock',
    'pallet_ready_sos',
    'pallet_ready_so_lines',
    'dispatch_batches',
    'dispatch_batch_sos',
    'dispatch_batch_lines',
    'logs',
    'issue_reports',
    'app_errors'
  ]
  loop
    execute format('drop policy if exists "active users can read %I" on public.%I', table_name, table_name);
    execute format('drop policy if exists "active users can write %I" on public.%I', table_name, table_name);
    execute format('create policy "active users can read %I" on public.%I for select to authenticated using (public.is_active_user())', table_name, table_name);
    execute format('create policy "active users can write %I" on public.%I for all to authenticated using (public.is_active_user()) with check (public.is_active_user())', table_name, table_name);
  end loop;
end $$;

drop policy if exists "users can read own profile" on public.profiles;
drop policy if exists "admins can manage profiles" on public.profiles;
create policy "users can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin_user());

create policy "admins can manage profiles"
on public.profiles for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issue-screenshots',
  'issue-screenshots',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users can upload issue screenshots" on storage.objects;
drop policy if exists "public can read issue screenshots" on storage.objects;

create policy "authenticated users can upload issue screenshots"
on storage.objects for insert
to authenticated
with check (bucket_id = 'issue-screenshots');

create policy "public can read issue screenshots"
on storage.objects for select
to public
using (bucket_id = 'issue-screenshots');

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
