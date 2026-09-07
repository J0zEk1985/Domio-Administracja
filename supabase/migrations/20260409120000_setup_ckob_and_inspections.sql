-- Phase 1 (Schema-First): c-KOB Read-Only Watchdog + Hybrid Building Inspections
-- PostgreSQL / Supabase migration

-- 0) Utility function for updated_at maintenance
create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) c-KOB credentials vault
create table if not exists public.ckob_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  api_key_encrypted text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ckob_credentials_org_id_uq
  on public.ckob_credentials (org_id);

create index if not exists ckob_credentials_org_id_idx
  on public.ckob_credentials (org_id);

drop trigger if exists trg_ckob_credentials_set_updated_at on public.ckob_credentials;
create trigger trg_ckob_credentials_set_updated_at
before update on public.ckob_credentials
for each row
execute function public.set_row_updated_at();

-- 2) Local -> c-KOB building mappings
create table if not exists public.ckob_property_mappings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.cleaning_locations(id) on delete cascade,
  ckob_building_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists ckob_property_mappings_location_ckob_uq
  on public.ckob_property_mappings (location_id, ckob_building_id);

create index if not exists ckob_property_mappings_location_id_idx
  on public.ckob_property_mappings (location_id);

-- 3) Hybrid inspections registry
create table if not exists public.building_inspections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.cleaning_locations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  inspection_type text not null,
  source text not null check (source in ('CKOB', 'INTERNAL')),
  status text not null check (status in ('PLANNED', 'COMPLETED', 'OVERDUE')),
  planned_date date not null,
  execution_date date null,
  ckob_document_ref text null,
  internal_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint building_inspections_execution_after_planned_chk
    check (execution_date is null or execution_date >= planned_date)
);

create index if not exists building_inspections_org_id_idx
  on public.building_inspections (org_id);

create index if not exists building_inspections_location_id_idx
  on public.building_inspections (location_id);

create index if not exists building_inspections_status_idx
  on public.building_inspections (status);

create index if not exists building_inspections_org_status_planned_idx
  on public.building_inspections (org_id, status, planned_date);

drop trigger if exists trg_building_inspections_set_updated_at on public.building_inspections;
create trigger trg_building_inspections_set_updated_at
before update on public.building_inspections
for each row
execute function public.set_row_updated_at();

-- 4) c-KOB sync watchdog logs
create table if not exists public.ckob_sync_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  status text not null check (status in ('SUCCESS', 'ERROR')),
  records_processed integer not null default 0 check (records_processed >= 0),
  error_details jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists ckob_sync_logs_org_id_idx
  on public.ckob_sync_logs (org_id);

create index if not exists ckob_sync_logs_status_created_at_idx
  on public.ckob_sync_logs (status, created_at desc);

-- RLS enablement (required on all 4 tables)
alter table public.ckob_credentials enable row level security;
alter table public.ckob_property_mappings enable row level security;
alter table public.building_inspections enable row level security;
alter table public.ckob_sync_logs enable row level security;

-- Extra hardening for credentials table
-- Service key automation path (n8n with service_role claim)
create policy ckob_credentials_service_role_select
on public.ckob_credentials
for select
using ((auth.jwt() ->> 'role') = 'service_role');

-- Org-scoped insert/update for logged users (no read policy for authenticated users)
create policy ckob_credentials_org_insert
on public.ckob_credentials
for insert
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = ckob_credentials.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

create policy ckob_credentials_org_update
on public.ckob_credentials
for update
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = ckob_credentials.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = ckob_credentials.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

-- Optional controlled read via SECURITY DEFINER function
create or replace function public.get_ckob_api_key(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api_key text;
begin
  if (auth.jwt() ->> 'role') = 'service_role' then
    select c.api_key_encrypted
      into v_api_key
    from public.ckob_credentials c
    where c.org_id = p_org_id
      and c.is_active = true
    order by c.created_at desc
    limit 1;
    return v_api_key;
  end if;

  if not exists (
    select 1
    from public.memberships m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
      and lower(coalesce(m.role, '')) in ('admin', 'manager')
  ) then
    raise exception 'insufficient_privilege';
  end if;

  select c.api_key_encrypted
    into v_api_key
  from public.ckob_credentials c
  where c.org_id = p_org_id
    and c.is_active = true
  order by c.created_at desc
  limit 1;

  return v_api_key;
end;
$$;

revoke all on function public.get_ckob_api_key(uuid) from public;
grant execute on function public.get_ckob_api_key(uuid) to authenticated, service_role;

-- RLS policies: ckob_property_mappings (org scoped via cleaning_locations.org_id)
create policy ckob_property_mappings_org_select
on public.ckob_property_mappings
for select
using (
  exists (
    select 1
    from public.cleaning_locations cl
    join public.memberships m on m.org_id = cl.org_id
    where cl.id = ckob_property_mappings.location_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

create policy ckob_property_mappings_org_insert
on public.ckob_property_mappings
for insert
with check (
  exists (
    select 1
    from public.cleaning_locations cl
    join public.memberships m on m.org_id = cl.org_id
    where cl.id = ckob_property_mappings.location_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

create policy ckob_property_mappings_org_update
on public.ckob_property_mappings
for update
using (
  exists (
    select 1
    from public.cleaning_locations cl
    join public.memberships m on m.org_id = cl.org_id
    where cl.id = ckob_property_mappings.location_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.cleaning_locations cl
    join public.memberships m on m.org_id = cl.org_id
    where cl.id = ckob_property_mappings.location_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

create policy ckob_property_mappings_org_delete
on public.ckob_property_mappings
for delete
using (
  exists (
    select 1
    from public.cleaning_locations cl
    join public.memberships m on m.org_id = cl.org_id
    where cl.id = ckob_property_mappings.location_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

-- RLS policies: building_inspections (direct org_id isolation)
create policy building_inspections_org_select
on public.building_inspections
for select
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = building_inspections.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

create policy building_inspections_org_insert
on public.building_inspections
for insert
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = building_inspections.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

create policy building_inspections_org_update
on public.building_inspections
for update
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = building_inspections.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = building_inspections.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

create policy building_inspections_org_delete
on public.building_inspections
for delete
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = building_inspections.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

-- RLS policies: ckob_sync_logs (org scoped, read/write by org members; service_role full)
create policy ckob_sync_logs_org_select
on public.ckob_sync_logs
for select
using (
  (auth.jwt() ->> 'role') = 'service_role'
  or exists (
    select 1
    from public.memberships m
    where m.org_id = ckob_sync_logs.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);

create policy ckob_sync_logs_org_insert
on public.ckob_sync_logs
for insert
with check (
  (auth.jwt() ->> 'role') = 'service_role'
  or exists (
    select 1
    from public.memberships m
    where m.org_id = ckob_sync_logs.org_id
      and m.user_id = auth.uid()
      and coalesce(m.is_active, true) = true
  )
);
