-- =============================================================================
-- EduDigi — Storage buckets/policies and Realtime publication.
-- Object paths: documents/{school_id}/{document_id}/{file}
--               school-assets/{school_id}/logo.{ext}
--               avatars/{user_id}/avatar.{ext}
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('school-assets', 'school-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Private documents: an object is readable only if the matching metadata row is readable.
create policy documents_objects_read on storage.objects
  for select to authenticated using (
    bucket_id = 'documents'
    and exists (select 1 from public.documents d where d.storage_path = storage.objects.name and private.can_read_document(d.id))
  );

-- Upload allowed only for a metadata row the user just created (path is fixed server-side).
create policy documents_objects_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name and d.uploaded_by = auth.uid()
        and d.deleted_at is null and d.created_at > now() - interval '15 minutes'
    )
  );

create policy school_assets_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'school-assets' and private.has_perm(((storage.foldername(name))[1])::uuid, 'school.manage')
  );
create policy school_assets_update on storage.objects
  for update to authenticated using (
    bucket_id = 'school-assets' and private.has_perm(((storage.foldername(name))[1])::uuid, 'school.manage')
  );
create policy school_assets_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'school-assets' and private.has_perm(((storage.foldername(name))[1])::uuid, 'school.manage')
  );

create policy avatars_own on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime only where it brings value: notifications inbox and messages.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.messages;
  end if;
end $$;
