-- =============================================================================
-- EduDigi — Foundation: extensions, schemas, tenancy, identity, RBAC, audit.
-- =============================================================================
-- Conventions
--   * Every business table carries `school_id` (tenant key) and has RLS enabled.
--   * Helper functions used by policies live in the non-exposed `private` schema.
--   * SECURITY DEFINER functions always pin `search_path = ''` and fully qualify names.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Platform level
-- -----------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
comment on table public.platform_settings is 'Platform-wide configuration (product name, legal links). Public keys are readable anonymously.';

insert into public.platform_settings (key, value, is_public) values
  ('product.name', '"EduDigi"', true),
  ('product.tagline', '"La plateforme intelligente de gestion scolaire"', true),
  ('product.support_email', '"support@example.com"', true);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
comment on table public.platform_admins is 'Super-administrators of the SaaS platform. Created only through the secured bootstrap procedure.';

-- -----------------------------------------------------------------------------
-- Schools (tenants)
-- -----------------------------------------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  name text not null check (char_length(name) between 2 and 160),
  short_name text,
  school_type text not null default 'mixed'
    check (school_type in ('preschool', 'primary', 'secondary', 'middle', 'high', 'mixed')),
  sector text not null default 'private' check (sector in ('private', 'public')),
  logo_path text,
  address text,
  city text,
  country text not null default 'CI',
  phone text,
  email text,
  website text,
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Abidjan',
  locale text not null default 'fr',
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  settings jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.schools.is_demo is 'Marks an isolated demonstration tenant. Demo data must never be mixed with production tenants.';
create trigger schools_updated_at before update on public.schools
  for each row execute function private.set_updated_at();

-- Monotonic per-school counters (invoice numbers, receipts, matricules).
create table public.school_counters (
  school_id uuid not null references public.schools (id) on delete cascade,
  key text not null,
  value bigint not null default 0,
  primary key (school_id, key)
);

create or replace function private.next_counter(p_school uuid, p_key text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v bigint;
begin
  insert into public.school_counters (school_id, key, value) values (p_school, p_key, 1)
  on conflict (school_id, key) do update set value = public.school_counters.value + 1
  returning value into v;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 160),
  email text,
  phone text,
  avatar_path text,
  locale text not null default 'fr',
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  last_school_id uuid references public.schools (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 160), ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- RBAC: permissions catalogue, roles, role permissions, memberships
-- -----------------------------------------------------------------------------
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  resource text not null,
  action text not null check (action in ('read', 'create', 'update', 'delete', 'validate', 'publish', 'export', 'manage')),
  label text not null,
  description text,
  sensitive boolean not null default false
);
comment on table public.permissions is 'Catalogue of permission keys. action ∈ consulter/créer/modifier/supprimer/valider/publier/exporter/administrer.';

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,48}$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  is_privileged boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, key),
  unique (school_id, id)
);
comment on column public.roles.is_privileged is 'Privileged roles can only be granted by users holding roles.manage.';

-- Scope narrows a permission to a subset of the school's records:
--   school   : every record of the school
--   assigned : records linked to the classes/subjects the staff member is assigned to
--   linked   : records of the students the guardian is linked to
--   self     : the user's own records
create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  scope text not null default 'school' check (scope in ('school', 'assigned', 'linked', 'self')),
  primary key (role_id, permission_key)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  suspended_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (school_id, user_id, role_id),
  foreign key (school_id, role_id) references public.roles (school_id, id) on delete cascade
);
create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create index memberships_school_idx on public.memberships (school_id);
create trigger memberships_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Invitations (no public self-registration with a privileged role)
-- -----------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id uuid not null,
  token_hash text not null unique,
  link_kind text check (link_kind in ('student', 'guardian', 'staff')),
  link_id uuid,
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (school_id, role_id) references public.roles (school_id, id) on delete cascade,
  check ((link_kind is null) = (link_id is null))
);
create index invitations_school_idx on public.invitations (school_id, status);
create index invitations_email_idx on public.invitations (email) where status = 'pending';

-- -----------------------------------------------------------------------------
-- Security telemetry
-- -----------------------------------------------------------------------------
create table public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email_hash text,
  event text not null check (event in ('login_success', 'login_failure', 'logout', 'password_reset_requested', 'password_changed', 'locked_out', 'session_revoked')),
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index login_events_user_idx on public.login_events (user_id, created_at desc);
comment on table public.login_events is 'Important authentication events. Never stores passwords; e-mail and IP are stored as salted hashes.';

create table public.rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0,
  blocked_until timestamptz
);

-- Atomic fixed-window rate limiter. Returns true when the call is allowed.
create or replace function public.consume_rate_limit(p_key text, p_max integer, p_window_seconds integer, p_block_seconds integer default 0)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r public.rate_limits;
begin
  if p_key is null or char_length(p_key) > 200 or p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments';
  end if;
  insert into public.rate_limits as rl (key, window_started_at, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rl.window_started_at < now() - make_interval(secs => p_window_seconds) then 1 else rl.hits + 1 end,
    window_started_at = case when rl.window_started_at < now() - make_interval(secs => p_window_seconds) then now() else rl.window_started_at end
  returning * into r;

  if r.blocked_until is not null and r.blocked_until > now() then
    return false;
  end if;
  if r.hits > p_max then
    if p_block_seconds > 0 then
      update public.rate_limits set blocked_until = now() + make_interval(secs => p_block_seconds) where key = p_key;
    end if;
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.reset_rate_limit(p_key text) returns void
language sql security definer set search_path = '' as $$
  delete from public.rate_limits where key = p_key;
$$;

-- -----------------------------------------------------------------------------
-- Audit log
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  changes jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_school_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
comment on table public.audit_logs is 'Append-only audit trail. Rows cannot be updated or deleted by application roles.';

create or replace function private.write_audit(
  p_school uuid, p_action text, p_entity_type text, p_entity_id text, p_changes jsonb default null, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (school_id, actor_id, action, entity_type, entity_id, changes, reason)
  values (p_school, auth.uid(), p_action, p_entity_type, p_entity_id, p_changes, p_reason);
end;
$$;

-- Generic row-level audit trigger. Columns listed in TG_ARGV are redacted.
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_diff jsonb := '{}'::jsonb;
  v_key text;
  v_redact text;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at') and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_diff = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := v_new;
  else
    v_diff := v_old;
  end if;

  if tg_nargs > 0 then
    foreach v_redact in array tg_argv loop
      if v_diff ? v_redact then
        v_diff := v_diff || jsonb_build_object(v_redact, '[redacted]');
      end if;
    end loop;
  end if;

  insert into public.audit_logs (school_id, actor_id, action, entity_type, entity_id, changes, reason)
  values (
    coalesce((v_new ->> 'school_id')::uuid, (v_old ->> 'school_id')::uuid),
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    v_diff,
    nullif(current_setting('app.audit_reason', true), '')
  );
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Core permission helpers (used by RLS and by RPC functions)
-- -----------------------------------------------------------------------------
create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

create or replace function private.is_member(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.schools s on s.id = m.school_id and s.status = 'active'
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function private.my_school_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.school_id from public.memberships m
  join public.schools s on s.id = m.school_id and s.status = 'active'
  where m.user_id = auth.uid() and m.status = 'active';
$$;

-- All scopes under which the current user holds `p_perm` in `p_school`.
create or replace function private.perm_scopes(p_school uuid, p_perm text) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct rp.scope), '{}')
  from public.memberships m
  join public.schools s on s.id = m.school_id and s.status = 'active'
  join public.role_permissions rp on rp.role_id = m.role_id
  where m.school_id = p_school
    and m.user_id = auth.uid()
    and m.status = 'active'
    and rp.permission_key = p_perm;
$$;

-- True when the user holds `p_perm` with a school-wide scope.
create or replace function private.has_perm(p_school uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select 'school' = any (private.perm_scopes(p_school, p_perm));
$$;

-- True when the user holds `p_perm` under any scope.
create or replace function private.has_any_perm(p_school uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(private.perm_scopes(p_school, p_perm)) > 0;
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS for foundation tables
-- -----------------------------------------------------------------------------
alter table public.platform_settings enable row level security;
alter table public.platform_admins enable row level security;
alter table public.schools enable row level security;
alter table public.school_counters enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.login_events enable row level security;
alter table public.rate_limits enable row level security;
alter table public.audit_logs enable row level security;

create policy platform_settings_public_read on public.platform_settings
  for select to anon, authenticated using (is_public or private.is_platform_admin());
create policy platform_settings_admin_write on public.platform_settings
  for all to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());

create policy platform_admins_self_read on public.platform_admins
  for select to authenticated using (user_id = auth.uid() or private.is_platform_admin());

create policy schools_member_read on public.schools
  for select to authenticated using (private.is_member(id) or private.is_platform_admin());
create policy schools_manage on public.schools
  for update to authenticated
  using (private.has_perm(id, 'school.manage') or private.is_platform_admin())
  with check (private.has_perm(id, 'school.manage') or private.is_platform_admin());
create policy schools_platform_insert on public.schools
  for insert to authenticated with check (private.is_platform_admin());

-- profiles: self, plus co-members holding users.read (directory)
create policy profiles_self_read on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id and private.has_any_perm(m.school_id, 'users.read')
    )
    or private.is_platform_admin()
  );
create policy profiles_self_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and is_active);

create policy permissions_read on public.permissions
  for select to authenticated using (true);

create policy roles_member_read on public.roles
  for select to authenticated using (private.is_member(school_id) or private.is_platform_admin());
create policy roles_manage on public.roles
  for all to authenticated
  using (private.has_perm(school_id, 'roles.manage'))
  with check (private.has_perm(school_id, 'roles.manage') and not is_system);

create policy role_permissions_read on public.role_permissions
  for select to authenticated using (
    exists (select 1 from public.roles r where r.id = role_id and (private.is_member(r.school_id) or private.is_platform_admin()))
  );
create policy role_permissions_manage on public.role_permissions
  for all to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and private.has_perm(r.school_id, 'roles.manage')))
  with check (exists (select 1 from public.roles r where r.id = role_id and private.has_perm(r.school_id, 'roles.manage')));

create policy memberships_read on public.memberships
  for select to authenticated using (
    user_id = auth.uid()
    or private.has_any_perm(school_id, 'users.read')
    or private.is_platform_admin()
  );
-- Writes go through public.assign_role / public.set_membership_status (permission + escalation checks).

create policy invitations_read on public.invitations
  for select to authenticated using (private.has_perm(school_id, 'users.invite'));

create policy login_events_self_read on public.login_events
  for select to authenticated using (user_id = auth.uid() or private.is_platform_admin());

create policy audit_logs_read on public.audit_logs
  for select to authenticated using (private.has_perm(school_id, 'audit.read') or private.is_platform_admin());

-- Defence in depth: anonymous visitors only reach explicitly public data.
revoke all on all tables in schema public from anon;
grant select on public.platform_settings to anon;
revoke all on public.rate_limits, public.school_counters from authenticated;
revoke update, delete on public.audit_logs from authenticated;
revoke execute on function public.consume_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.reset_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.reset_rate_limit(text) to service_role;
