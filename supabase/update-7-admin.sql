-- ==========================================================
-- עדכון 7: דף המנהל החדש
-- "השלמת תשלום" (פותחים לזוג תשלום של היתרה ביום הצילום), "צולמו"
-- (המלצה מהזוג ותמונות טעימה להורדה מהדף האישי).
-- רק מוסיף עמודות, טבלה ופונקציות. לא מוחק כלום. בטוח להריץ שוב.
-- ==========================================================

alter table public.leads
  add column if not exists balance_open_at timestamptz,         -- פתחת לזוג השלמת תשלום
  add column if not exists full_paid_at timestamptz,            -- שילמו את כל הסכום
  add column if not exists full_paid_method text check (full_paid_method is null or char_length(full_paid_method) <= 20),
  add column if not exists review text check (review is null or char_length(review) <= 2000),
  add column if not exists review_at timestamptz;

-- תמונות טעימה לזוג (נשמרות כקובץ מוקטן, עד כ-3MB לתמונה)
create table if not exists public.lead_photos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  name text not null default 'photo.jpg' check (char_length(name) <= 120),
  data text not null check (char_length(data) <= 4200000 and data like 'data:image/%'),
  created_at timestamptz not null default now()
);
create index if not exists lead_photos_lead_idx on public.lead_photos(lead_id);
alter table public.lead_photos enable row level security;
revoke all on public.lead_photos from anon, authenticated;

-- ===== הדף האישי =====
create or replace function public.lead_get(p_token text)
returns json
language plpgsql security definer set search_path = public
as $$
declare l leads;
begin
  perform _expire();
  select * into l from leads where token = p_token;
  if not found then raise exception 'NOT_FOUND'; end if;
  return json_build_object(
    'names', l.names, 'status', l.status, 'recommended', l.recommended,
    'occasion', l.occasion, 'landscape', l.landscape, 'timing', l.timing,
    'day', l.day, 'package', l.package, 'hold_until', l.hold_until,
    'deposit_paid_at', l.deposit_paid_at, 'email', l.email,
    'page_title', l.page_title, 'page_note', l.page_note,
    'price_basic', l.price_basic, 'price_premium', l.price_premium,
    'location', l.location,
    'pref_style', l.pref_style, 'pref_location', l.pref_location, 'prefs_at', l.prefs_at,
    'approval_sent_at', l.approval_sent_at, 'finished_sent_at', l.finished_sent_at,
    'balance_open_at', l.balance_open_at, 'full_paid_at', l.full_paid_at,
    'review', l.review, 'review_at', l.review_at,
    'photos', coalesce((select json_agg(json_build_object('id', id, 'name', name) order by created_at)
                        from lead_photos where lead_id = l.id), '[]'::json),
    'dates', coalesce((select json_agg(d) from (select * from _available(l.id) limit 200) a(d)), '[]'::json)
  );
end $$;

-- תמונה אחת להצגה ולהורדה
create or replace function public.lead_photo(p_token text, p_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select p.data from lead_photos p join leads l on l.id = p.lead_id
  where l.token = p_token and p.id = p_id
$$;

-- השלמת התשלום במצב דמו (עד שיחובר ספק סליקה)
create or replace function public.lead_pay_balance_demo(p_token text, p_method text)
returns void
language plpgsql security definer set search_path = public
as $$
declare l leads; v_url text;
begin
  select * into l from leads where token = p_token for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if l.balance_open_at is null or l.full_paid_at is not null then raise exception 'LOCKED'; end if;
  if p_method not in ('bit','card') then raise exception 'BAD_METHOD'; end if;
  update leads set full_paid_at = now(), full_paid_method = p_method || '-demo', updated_at = now() where id = l.id;
  select site_url into v_url from site_settings where id = 1;
  perform _notify('תשלום מלא (דמו): ' || l.names, 'השלימו את התשלום', v_url || '/admin');
end $$;

-- המלצה מהזוג אחרי הצילום
create or replace function public.lead_review(p_token text, p_text text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v text := left(trim(coalesce(p_text,'')), 2000);
begin
  if char_length(v) < 3 then raise exception 'REVIEW_EMPTY'; end if;
  update leads set review = v, review_at = now(), updated_at = now()
  where token = p_token and status in ('shot','delivered');
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- ===== מנהל =====
create or replace function public.admin_lead_action(p_pass text, p_id uuid, p_action text)
returns void
language plpgsql security definer set search_path = public
as $$
declare l leads;
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  perform _expire();
  select * into l from leads where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_action in ('approve', 'extend') then
    if l.day is null then raise exception 'NO_DATE'; end if;
    if l.day in (select * from _taken(l.id)) then raise exception 'DATE_TAKEN'; end if;
    if p_action = 'approve' and l.status not in ('pending','declined','expired') then raise exception 'LOCKED'; end if;
    if p_action = 'extend' and l.status not in ('awaiting_deposit','expired') then raise exception 'LOCKED'; end if;
    update leads set status = 'awaiting_deposit', hold_until = _next_morning(),
      approved_at = coalesce(approved_at, now()), updated_at = now() where id = l.id;
  elsif p_action = 'decline' then
    update leads set status = 'declined', hold_until = null, updated_at = now() where id = l.id;
  elsif p_action = 'mark_paid' then
    if l.day is null then raise exception 'NO_DATE'; end if;
    if l.day in (select * from _taken(l.id)) then raise exception 'DATE_TAKEN'; end if;
    update leads set status = 'booked', hold_until = null, deposit_paid_at = coalesce(deposit_paid_at, now()),
      deposit_method = coalesce(deposit_method, 'manual'), updated_at = now() where id = l.id;
  elsif p_action = 'open_balance' then
    if l.status not in ('booked','shot','delivered') then raise exception 'LOCKED'; end if;
    update leads set balance_open_at = coalesce(balance_open_at, now()), updated_at = now() where id = l.id;
  elsif p_action = 'mark_full_paid' then
    if l.status not in ('booked','shot','delivered') then raise exception 'LOCKED'; end if;
    update leads set balance_open_at = coalesce(balance_open_at, now()), full_paid_at = coalesce(full_paid_at, now()),
      full_paid_method = coalesce(full_paid_method, 'manual'), updated_at = now() where id = l.id;
  elsif p_action = 'shot' then
    update leads set status = 'shot', updated_at = now() where id = l.id;
  elsif p_action = 'delivered' then
    update leads set status = 'delivered', updated_at = now() where id = l.id;
  elsif p_action = 'restore' then
    update leads set status = case when day is null then 'lead' else 'pending' end,
      hold_until = null, updated_at = now() where id = l.id;
  elsif p_action = 'delete' then
    delete from leads where id = l.id;
  else
    raise exception 'BAD_ACTION';
  end if;
end $$;

create or replace function public.admin_photos(p_pass text, p_id uuid)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  return coalesce((select json_agg(json_build_object('id', id, 'name', name, 'data', data) order by created_at)
                   from lead_photos where lead_id = p_id), '[]'::json);
end $$;

create or replace function public.admin_photo_add(p_pass text, p_id uuid, p_name text, p_data text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v uuid;
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  if (select count(*) from lead_photos where lead_id = p_id) >= 30 then raise exception 'TOO_MANY_PHOTOS'; end if;
  insert into lead_photos(lead_id, name, data) values (p_id, left(coalesce(nullif(trim(p_name),''), 'photo.jpg'), 120), p_data)
  returning id into v;
  return v;
end $$;

create or replace function public.admin_photo_delete(p_pass text, p_photo uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  delete from lead_photos where id = p_photo;
end $$;

revoke all on function public.lead_photo(text,uuid) from public;
revoke all on function public.lead_pay_balance_demo(text,text) from public;
revoke all on function public.lead_review(text,text) from public;
revoke all on function public.admin_photos(text,uuid) from public;
revoke all on function public.admin_photo_add(text,uuid,text,text) from public;
revoke all on function public.admin_photo_delete(text,uuid) from public;
grant execute on function public.lead_photo(text,uuid) to anon, authenticated;
grant execute on function public.lead_pay_balance_demo(text,text) to anon, authenticated;
grant execute on function public.lead_review(text,text) to anon, authenticated;
grant execute on function public.admin_photos(text,uuid) to anon, authenticated;
grant execute on function public.admin_photo_add(text,uuid,text,text) to anon, authenticated;
grant execute on function public.admin_photo_delete(text,uuid) to anon, authenticated;
