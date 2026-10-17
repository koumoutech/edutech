-- =============================================================================
-- EduDigi — School finance: fees, invoices, payments, allocations, expenses.
-- Amounts are stored as numeric(14,2) in the school's currency.
-- Invariant: invoice.amount_paid = Σ active allocations; balance = total − amount_paid.
-- =============================================================================

create table public.fee_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  category text not null check (category in ('tuition', 'registration', 'exam', 'transport', 'canteen', 'uniform', 'supplies', 'activity', 'other')),
  is_active boolean not null default true,
  unique (school_id, name),
  unique (school_id, id)
);

create table public.fee_schedules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  fee_type_id uuid not null,
  level_id uuid,
  amount numeric(14, 2) not null check (amount >= 0),
  installments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade,
  foreign key (school_id, fee_type_id) references public.fee_types (school_id, id) on delete cascade,
  foreign key (school_id, level_id) references public.levels (school_id, id) on delete cascade
);
comment on column public.fee_schedules.installments is 'Array of {"due_on":"YYYY-MM-DD","percent":number}; percents must sum to 100.';
create unique index fee_schedules_unique on public.fee_schedules
  (academic_year_id, fee_type_id, coalesce(level_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(14, 2) not null check (value > 0),
  is_scholarship boolean not null default false,
  applies_to_category text,
  is_active boolean not null default true,
  unique (school_id, name),
  unique (school_id, id),
  check (kind <> 'percent' or value <= 100)
);

create table public.student_discounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  discount_id uuid not null,
  academic_year_id uuid not null,
  reason text,
  granted_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (student_id, discount_id, academic_year_id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, discount_id) references public.discounts (school_id, id) on delete cascade,
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other')),
  requires_reference boolean not null default false,
  is_active boolean not null default true,
  unique (school_id, name),
  unique (school_id, id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  number text not null,
  student_id uuid not null,
  academic_year_id uuid,
  issue_date date not null default current_date,
  due_date date not null,
  currency text not null,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14, 2) not null default 0 check (discount_total >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  balance numeric(14, 2) generated always as (total - amount_paid) stored,
  status text not null default 'draft' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  notes text,
  cancelled_reason text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, number),
  unique (school_id, id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete restrict,
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete set null (academic_year_id),
  check (amount_paid <= total),
  check (due_date >= issue_date)
);
create index invoices_student_idx on public.invoices (student_id);
create index invoices_status_idx on public.invoices (school_id, status, due_date);
create trigger invoices_updated_at before update on public.invoices
  for each row execute function private.set_updated_at();

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  invoice_id uuid not null,
  fee_type_id uuid,
  description text not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_amount numeric(14, 2) not null check (unit_amount >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  line_total numeric(14, 2) generated always as (round(quantity * unit_amount - discount_amount, 2)) stored,
  position smallint not null default 0,
  foreign key (school_id, invoice_id) references public.invoices (school_id, id) on delete cascade,
  foreign key (school_id, fee_type_id) references public.fee_types (school_id, id) on delete set null (fee_type_id),
  check (discount_amount <= quantity * unit_amount)
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

create table public.invoice_installments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  invoice_id uuid not null,
  due_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  position smallint not null,
  unique (invoice_id, position),
  foreign key (school_id, invoice_id) references public.invoices (school_id, id) on delete cascade
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  receipt_number text not null,
  student_id uuid not null,
  payer_name text,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null,
  method_id uuid not null,
  reference text,
  paid_at timestamptz not null default now(),
  received_by uuid references auth.users (id) on delete set null default auth.uid(),
  status text not null default 'completed' check (status in ('completed', 'reversed')),
  reconciled boolean not null default false,
  reconciled_at timestamptz,
  reconciled_by uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (school_id, receipt_number),
  unique (school_id, id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete restrict,
  foreign key (school_id, method_id) references public.payment_methods (school_id, id) on delete restrict
);
create index payments_student_idx on public.payments (student_id);
create index payments_school_date_idx on public.payments (school_id, paid_at desc);
create unique index payments_reference_unique on public.payments (school_id, method_id, reference)
  where reference is not null and status = 'completed';

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  payment_id uuid not null,
  invoice_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (school_id, payment_id) references public.payments (school_id, id) on delete restrict,
  foreign key (school_id, invoice_id) references public.invoices (school_id, id) on delete restrict
);
create index payment_allocations_invoice_idx on public.payment_allocations (invoice_id) where is_active;
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  payment_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  reason text not null check (char_length(reason) >= 5),
  status text not null default 'completed' check (status in ('completed')),
  approved_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (school_id, payment_id) references public.payments (school_id, id) on delete restrict
);

-- Recompute invoice paid amount and status from active allocations.
create or replace function private.refresh_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_paid numeric(14, 2);
  v_inv public.invoices;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    return;
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.payment_allocations
    where invoice_id = p_invoice and is_active;
  if v_paid > v_inv.total then
    raise exception 'OVERPAYMENT: le montant affecté dépasse le total de la facture' using errcode = 'P0001';
  end if;
  update public.invoices set
    amount_paid = v_paid,
    status = case
      when v_inv.status in ('draft', 'cancelled') then v_inv.status
      when v_paid = 0 then 'issued'
      when v_paid < v_inv.total then 'partially_paid'
      else 'paid'
    end
  where id = p_invoice;
end;
$$;

create or replace function private.payment_allocations_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if not exists (select 1 from public.invoices i where i.id = new.invoice_id and i.status in ('issued', 'partially_paid', 'paid')) then
      if tg_op = 'INSERT' or new.is_active then
        raise exception 'INVOICE_NOT_PAYABLE: la facture doit être émise et non annulée' using errcode = 'P0001';
      end if;
    end if;
    perform private.refresh_invoice(new.invoice_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.invoice_id is distinct from coalesce(new.invoice_id, null) then
    perform private.refresh_invoice(old.invoice_id);
  end if;
  return coalesce(new, old);
end;
$$;
create trigger payment_allocations_sync after insert or update or delete on public.payment_allocations
  for each row execute function private.payment_allocations_sync();

-- Invoice totals recomputed from lines.
create or replace function private.refresh_invoice_totals(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_sub numeric(14, 2);
  v_disc numeric(14, 2);
begin
  select coalesce(sum(round(quantity * unit_amount, 2)), 0), coalesce(sum(discount_amount), 0)
    into v_sub, v_disc
  from public.invoice_lines where invoice_id = p_invoice;
  update public.invoices set subtotal = v_sub, discount_total = v_disc, total = v_sub - v_disc
  where id = p_invoice;
end;
$$;

create or replace function private.invoice_lines_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  if exists (select 1 from public.invoices where id = v_invoice and status <> 'draft') then
    raise exception 'INVOICE_LOCKED: seules les factures en brouillon sont modifiables' using errcode = 'P0001';
  end if;
  perform private.refresh_invoice_totals(v_invoice);
  return coalesce(new, old);
end;
$$;
create trigger invoice_lines_sync after insert or update or delete on public.invoice_lines
  for each row execute function private.invoice_lines_sync();

-- Status of an issued invoice is only changed by the payment machinery or the RPCs.
create or replace function private.invoices_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.finance_rpc', true), '') = 'on' then
    return new;
  end if;
  if pg_trigger_depth() > 1 then
    -- Nested call from refresh_invoice / refresh_invoice_totals.
    return new;
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'INVOICE_MUST_START_AS_DRAFT' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (
       old.status <> new.status
       or old.total <> new.total
       or old.amount_paid <> new.amount_paid
       or (old.status <> 'draft' and (old.student_id, old.due_date, old.currency) is distinct from (new.student_id, new.due_date, new.currency))
     ) then
    raise exception 'INVOICE_CHANGE_REQUIRES_RPC' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger invoices_guard before insert or update on public.invoices
  for each row execute function private.invoices_guard();

-- -----------------------------------------------------------------------------
-- Expenses, suppliers, budgets
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  tax_id text,
  is_active boolean not null default true,
  unique (school_id, name),
  unique (school_id, id)
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  unique (school_id, name),
  unique (school_id, id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  category_id uuid not null,
  supplier_id uuid,
  academic_year_id uuid,
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  spent_on date not null default current_date,
  method_id uuid,
  reference text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  requested_by uuid references auth.users (id) on delete set null default auth.uid(),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, category_id) references public.expense_categories (school_id, id) on delete restrict,
  foreign key (school_id, supplier_id) references public.suppliers (school_id, id) on delete set null (supplier_id),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete set null (academic_year_id),
  foreign key (school_id, method_id) references public.payment_methods (school_id, id) on delete set null (method_id)
);
create index expenses_school_date_idx on public.expenses (school_id, spent_on desc);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  category_id uuid not null,
  amount numeric(14, 2) not null check (amount >= 0),
  notes text,
  unique (academic_year_id, category_id),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade,
  foreign key (school_id, category_id) references public.expense_categories (school_id, id) on delete cascade
);
