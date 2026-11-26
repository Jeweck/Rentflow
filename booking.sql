-- ============ BOOKING REQUESTS (Supabase) ============
-- ASSUMPTIONS: tables public.rooms(id, property_id, landlord_id, status, ...) and
-- public.profiles(id, full_name, email, phone, avatar_url). Rename to match your schema.

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references auth.users(id) on delete cascade,
  landlord_id uuid not null references auth.users(id),
  property_id uuid references public.properties(id),
  room_id     uuid not null references public.rooms(id),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','confirmed','cancelled')),
  full_name text not null, email text not null, phone text not null,
  current_address text not null, date_of_birth date not null,
  valid_id_type text not null, valid_id_number text not null, valid_id_url text not null,
  move_in_date date not null, stay_duration text not null,
  occupants_count int not null check (occupants_count >= 1),
  additional_occupants text, rental_purpose text not null,
  employment_school text not null, monthly_income numeric(12,2) not null,
  emergency_contact_name text not null, emergency_contact_relationship text not null,
  emergency_contact_phone text not null,
  tenant_message text, rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.booking_requests(tenant_id);
create index on public.booking_requests(landlord_id);
create index on public.booking_requests(room_id);

-- Race-condition guard: only ONE approved/confirmed booking per room, enforced by the DB.
create unique index one_active_booking_per_room
  on public.booking_requests(room_id) where status in ('approved','confirmed');
-- A tenant can only have one pending request per room.
create unique index one_pending_per_tenant_room
  on public.booking_requests(tenant_id, room_id) where status = 'pending';

alter table public.booking_requests enable row level security;

create policy "tenant reads own" on public.booking_requests
  for select using (tenant_id = auth.uid());
create policy "landlord reads own rooms" on public.booking_requests
  for select using (landlord_id = auth.uid());
-- No direct insert/update/delete: all writes go through the functions below.

-- ---------- Create (called by the form) ----------
create or replace function public.create_booking_request(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.rooms; new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into r from public.rooms where id = (p->>'room_id')::uuid for update; -- locks the room row
  if not found then raise exception 'Room not found'; end if;
  if r.landlord_id = auth.uid() then raise exception 'You cannot book your own room'; end if;
  if exists (select 1 from booking_requests
             where room_id = r.id and status in ('approved','confirmed'))
     or coalesce(lower(r.status),'available') in ('booked','occupied') then
    raise exception 'This room is no longer available.';
  end if;

  insert into booking_requests (
    tenant_id, landlord_id, property_id, room_id, full_name, email, phone, current_address,
    date_of_birth, valid_id_type, valid_id_number, valid_id_url, move_in_date, stay_duration,
    occupants_count, additional_occupants, rental_purpose, employment_school, monthly_income,
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, tenant_message)
  values (
    auth.uid(), r.landlord_id, r.property_id, r.id, p->>'full_name', p->>'email', p->>'phone',
    p->>'current_address', (p->>'date_of_birth')::date, p->>'valid_id_type', p->>'valid_id_number',
    p->>'valid_id_url', (p->>'move_in_date')::date, p->>'stay_duration',
    (p->>'occupants_count')::int, p->>'additional_occupants', p->>'rental_purpose',
    p->>'employment_school', (p->>'monthly_income')::numeric, p->>'emergency_contact_name',
    p->>'emergency_contact_relationship', p->>'emergency_contact_phone', p->>'tenant_message')
  returning id into new_id;
  return new_id;
end $$;

-- ---------- Status changes (used by dashboards later) ----------
create or replace function public.set_booking_status(b uuid, new_status text, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare bk public.booking_requests;
begin
  select * into bk from booking_requests where id = b for update;
  if not found then raise exception 'Booking not found'; end if;

  if new_status in ('approved','rejected') then
    if bk.landlord_id <> auth.uid() or bk.status <> 'pending' then raise exception 'Not allowed'; end if;
    if new_status = 'rejected' and coalesce(trim(reason),'') = '' then
      raise exception 'A rejection reason is required'; end if;
  elsif new_status = 'confirmed' then
    if bk.tenant_id <> auth.uid() or bk.status <> 'approved' then raise exception 'Not allowed'; end if;
  elsif new_status = 'cancelled' then
    if bk.tenant_id <> auth.uid() or bk.status <> 'pending' then raise exception 'Not allowed'; end if;
  else raise exception 'Invalid status'; end if;

  update booking_requests set status = new_status,
    rejection_reason = case when new_status='rejected' then reason else rejection_reason end,
    updated_at = now() where id = b;

  if new_status = 'confirmed' then
    update rooms set status = 'booked' where id = bk.room_id;  -- adjust value to your enum
  end if;
end $$;

-- ---------- Storage for ID uploads (private) ----------
insert into storage.buckets (id, name, public) values ('valid-ids','valid-ids', false)
on conflict do nothing;

create policy "tenant uploads own id" on storage.objects for insert to authenticated
  with check (bucket_id='valid-ids' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "tenant reads own id" on storage.objects for select to authenticated
  using (bucket_id='valid-ids' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "landlord reads ids of own requests" on storage.objects for select to authenticated
  using (bucket_id='valid-ids' and exists (
    select 1 from public.booking_requests b
    where b.valid_id_url = storage.objects.name and b.landlord_id = auth.uid()));