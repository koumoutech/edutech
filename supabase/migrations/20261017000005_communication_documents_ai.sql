-- =============================================================================
-- EduDigi — Communication, documents, administrative requests, AI assistant.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 1 and 10000),
  audience_roles text[] not null default '{}',
  audience_class_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_pinned boolean not null default false,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  published_at timestamptz,
  expires_at timestamptz,
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.announcements.audience_roles is 'Role keys targeted; empty array = every member of the school.';
create index announcements_school_idx on public.announcements (school_id, status, published_at desc);
create trigger announcements_updated_at before update on public.announcements
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Notifications (in-app inbox) and outbound delivery queue
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  channel text not null check (channel in ('in_app', 'email', 'sms', 'push')),
  enabled boolean not null default true,
  primary key (user_id, type, channel)
);

create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'push')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index outbound_messages_queue_idx on public.outbound_messages (next_attempt_at) where status = 'queued';
comment on table public.outbound_messages is 'E-mail/SMS/push queue processed by the background worker with the service role. Not exposed to clients.';

-- -----------------------------------------------------------------------------
-- Messaging
-- -----------------------------------------------------------------------------
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 160),
  student_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete set null (student_id)
);

create table public.message_participants (
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);
create index message_participants_user_idx on public.message_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null default auth.uid(),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

-- -----------------------------------------------------------------------------
-- Documents and templates
-- -----------------------------------------------------------------------------
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  kind text not null check (kind in ('enrollment_certificate', 'attendance_certificate', 'attestation', 'convocation', 'transfer_certificate', 'receipt', 'report_card', 'custom')),
  name text not null,
  title text not null,
  body text not null check (char_length(body) <= 20000),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);
comment on column public.document_templates.body is 'Plain text with {{placeholders}} (whitelisted on the server) rendered to PDF.';

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  category text not null check (category in ('student_file', 'justification', 'certificate', 'report_card', 'receipt', 'hr', 'administrative', 'other')),
  title text not null,
  student_id uuid,
  staff_id uuid,
  document_type_id uuid,
  storage_path text unique,
  mime_type text check (mime_type is null or mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer check (size_bytes is null or size_bytes between 1 and 10485760),
  sha256 text,
  visible_to_family boolean not null default false,
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, staff_id) references public.staff_members (school_id, id) on delete cascade,
  foreign key (school_id, document_type_id) references public.required_document_types (school_id, id) on delete set null (document_type_id),
  check (storage_path is null or storage_path like school_id::text || '/%')
);
create index documents_student_idx on public.documents (student_id) where deleted_at is null;
create index documents_staff_idx on public.documents (staff_id) where deleted_at is null;

alter table public.leave_requests
  add constraint leave_requests_document_fk foreign key (document_id) references public.documents (id) on delete set null;
alter table public.absence_justifications
  add constraint absence_justifications_document_fk foreign key (document_id) references public.documents (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Administrative requests and appointments
-- -----------------------------------------------------------------------------
create table public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  student_id uuid,
  kind text not null check (kind in ('certificate', 'transcript', 'transfer', 'appointment', 'information', 'complaint', 'other')),
  subject text not null check (char_length(subject) between 3 and 160),
  details text check (details is null or char_length(details) <= 4000),
  preferred_date timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'rejected', 'cancelled')),
  assigned_to uuid references auth.users (id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete set null (student_id)
);
create index admin_requests_school_idx on public.admin_requests (school_id, status, created_at desc);
create trigger admin_requests_updated_at before update on public.admin_requests
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- AI assistant
-- -----------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null default 'Nouvelle conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  tools_used text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_tool_invocations (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  tool_name text not null,
  outcome text not null check (outcome in ('ok', 'denied', 'invalid', 'error')),
  result_count integer,
  duration_ms integer,
  created_at timestamptz not null default now()
);
comment on table public.ai_tool_invocations is 'Audit of AI tool calls. Arguments and results are intentionally NOT stored (data minimisation).';
create index ai_tool_invocations_school_idx on public.ai_tool_invocations (school_id, created_at desc);
