-- Supabase/PostgreSQL facility catalog with reviewable source state.
create table if not exists public.facilities (
  facility_id text primary key,
  name text not null,
  prefecture text not null,
  municipality text not null,
  address text not null,
  category text not null check (category in ('美術館','博物館','科学館','動物園','水族館','植物園')),
  regular_fee text not null,
  free_conditions text not null default '',
  free_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(free_rules) = 'array'),
  hours text not null,
  closed text not null,
  official_url text not null,
  source_url text not null,
  last_checked date,
  audit_status text not null default 'needs_review' check (audit_status in ('confirmed','needs_review')),
  field_status jsonb not null default '{}'::jsonb check (jsonb_typeof(field_status) = 'object'),
  audit_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(audit_issues) = 'array'),
  audited_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists facilities_area_category_idx
  on public.facilities (prefecture, category);
create index if not exists facilities_audit_status_idx
  on public.facilities (audit_status);
create index if not exists facilities_free_rules_gin_idx
  on public.facilities using gin (free_rules);

-- Normalize field-level checks so an update job can find stale or unresolved
-- values without parsing JSON. Keep a row even for unverified fields.
create table if not exists public.facility_field_checks (
  facility_id text not null references public.facilities(facility_id) on delete cascade,
  field_name text not null check (field_name in (
    'name','prefecture','municipality','address','category','regular_fee',
    'free_conditions','free_rules','hours','closed','official_url',
    'source_url','last_checked'
  )),
  status text not null default 'needs_review'
    check (status in ('confirmed','needs_review','unverified')),
  source_url text,
  reviewed_at timestamptz,
  note text not null default '',
  primary key (facility_id, field_name)
);

create index if not exists facility_field_checks_status_idx
  on public.facility_field_checks (status, reviewed_at);

-- Keep source_url and last_checked with each facility and preserve the
-- per-field provenance/status here. Refresh a status only after reviewing
-- the corresponding official source.
