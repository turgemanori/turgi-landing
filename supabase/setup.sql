-- ==========================================================
-- הקמת מסד הנתונים למערכת ההזמנות (מריצים פעם אחת)
-- Supabase → הפרויקט turgi-booking → SQL Editor → New query
-- 1. מדביקים את כל הקובץ
-- 2. בשורה האחרונה מחליפים את CHANGE_ME בסיסמה שתבחר לדף המנהל (לפחות 8 תווים)
-- 3. לוחצים Run
-- ==========================================================

create extension if not exists pgcrypto with schema extensions;

-- תאריכים שפתחת לבוקים
create table if not exists public.open_dates (
  day date primary key,
  created_at timestamptz not null default now()
);

-- בקשות שריון מהמתעניינים
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  package text not null check (package in ('basic','premium')),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null check (char_length(phone) between 7 and 20),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);
create index if not exists bookings_day_idx on public.bookings(day);

-- סיסמת דף המנהל (נשמרת מוצפנת)
create table if not exists public.admin_secret (
  id int primary key default 1 check (id = 1),
  pass_hash text not null
);

-- אף אחד מבחוץ לא ניגש לטבלאות ישירות, רק דרך הפונקציות למטה
alter table public.open_dates enable row level security;
alter table public.bookings enable row level security;
alter table public.admin_secret enable row level security;
revoke all on public.open_dates, public.bookings, public.admin_secret from anon, authenticated;

-- ===== פונקציות ציבוריות (דף ההזמנה) =====

create or replace function public.public_open_dates()
returns table(day date)
language sql security definer set search_path = public
as $$
  select o.day from open_dates o
  where o.day >= (now() at time zone 'Asia/Jerusalem')::date
    and not exists (select 1 from bookings b where b.day = o.day and b.status = 'approved')
  order by o.day;
$$;

create or replace function public.create_booking(p_day date, p_package text, p_name text, p_phone text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_phone text := regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
begin
  if not exists (select 1 from public_open_dates() d where d.day = p_day) then
    raise exception 'DATE_NOT_AVAILABLE';
  end if;
  if (select count(*) from bookings where created_at > now() - interval '1 hour') > 30 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  if exists (select 1 from bookings where day = p_day and phone = v_phone and status <> 'declined') then
    raise exception 'ALREADY_REQUESTED';
  end if;
  insert into bookings(day, package, name, phone, note)
  values (p_day, p_package, trim(p_name), v_phone, nullif(trim(coalesce(p_note,'')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ===== פונקציות מנהל (דורשות סיסמה) =====

create or replace function public._admin_ok(p_pass text)
returns boolean
language sql security definer set search_path = public, extensions
as $$
  -- הסיסמה לדוגמה CHANGE_ME לעולם לא תעבוד, גם אם שכחתם להחליף אותה
  select coalesce(p_pass,'') <> 'CHANGE_ME'
     and exists (select 1 from admin_secret where pass_hash = extensions.crypt(coalesce(p_pass,''), pass_hash));
$$;

create or replace function public.admin_get(p_pass text)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  return json_build_object(
    'dates', coalesce((select json_agg(day order by day) from open_dates
                       where day >= (now() at time zone 'Asia/Jerusalem')::date - 30), '[]'::json),
    'bookings', coalesce((select json_agg(b order by b.day, b.created_at) from (
        select id, day, package, name, phone, note, status, created_at from bookings
        where day >= (now() at time zone 'Asia/Jerusalem')::date - 30) b), '[]'::json)
  );
end $$;

create or replace function public.admin_set_dates(p_pass text, p_add date[], p_remove date[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  insert into open_dates(day) select unnest(coalesce(p_add, '{}')) on conflict do nothing;
  delete from open_dates where day = any(coalesce(p_remove, '{}'));
end $$;

create or replace function public.admin_set_status(p_pass text, p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  update bookings set status = p_status where id = p_id;
end $$;

create or replace function public.admin_change_password(p_pass text, p_new text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  if char_length(coalesce(p_new,'')) < 8 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  update admin_secret set pass_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = 1;
end $$;

-- הרשאות: רק הפונקציות האלה פתוחות לאתר
revoke all on function public._admin_ok(text) from public, anon, authenticated;
revoke all on function public.public_open_dates() from public;
revoke all on function public.create_booking(date,text,text,text,text) from public;
revoke all on function public.admin_get(text) from public;
revoke all on function public.admin_set_dates(text,date[],date[]) from public;
revoke all on function public.admin_set_status(text,uuid,text) from public;
revoke all on function public.admin_change_password(text,text) from public;
grant execute on function public.public_open_dates() to anon, authenticated;
grant execute on function public.create_booking(date,text,text,text,text) to anon, authenticated;
grant execute on function public.admin_get(text) to anon, authenticated;
grant execute on function public.admin_set_dates(text,date[],date[]) to anon, authenticated;
grant execute on function public.admin_set_status(text,uuid,text) to anon, authenticated;
grant execute on function public.admin_change_password(text,text) to anon, authenticated;

-- ★ סיסמה לדף המנהל: החליפו את CHANGE_ME בסיסמה שלכם לפני ההרצה
insert into public.admin_secret (id, pass_hash)
values (1, extensions.crypt('CHANGE_ME', extensions.gen_salt('bf', 10)))
on conflict (id) do nothing;
