-- =============================================================================
-- EduDigi — Final privilege hardening (runs last; idempotent).
-- Default privileges on Supabase grant table access to `anon`; business tables
-- must never be reachable without authentication.
-- =============================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.platform_settings to anon;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.bootstrap_platform_admin(uuid) from authenticated;
revoke execute on function public.consume_rate_limit(text, integer, integer, integer) from authenticated;
revoke execute on function public.reset_rate_limit(text) from authenticated;

-- Service-only tables.
revoke all on public.rate_limits, public.school_counters, public.outbound_messages from authenticated;
revoke insert, update, delete on public.login_events from authenticated;
revoke update, delete on public.audit_logs from authenticated;
revoke insert on public.audit_logs from authenticated;

-- Future tables created in later migrations must be explicitly granted to anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;
