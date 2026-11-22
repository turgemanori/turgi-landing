-- ==========================================================
-- עדכון 2: מסע ההזמנה החדש (היכרות, דף אישי, מקדמה, יומן והתראות)
-- מריצים פעם אחת, אחרי setup.sql. בטוח להריץ שוב.
-- ==========================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ===== טבלאות =====

-- כל זוג הוא שורה אחת, מההיכרות ועד מסירת התמונות
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  names text not null check (char_length(names) between 2 and 80),
  phone text not null check (char_length(phone) between 7 and 20),
  email text check (email is null or (char_length(email) <= 120 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  instagram text check (instagram is null or char_length(instagram) <= 40),
  occasion text check (occasion is null or char_length(occasion) <= 40),
  landscape text check (landscape is null or char_length(landscape) <= 80),
  timing text check (timing is null or char_length(timing) <= 40),
  recommended text not null default 'basic' check (recommended in ('basic','premium')),
  day date,
  package text check (package is null or package in ('basic','premium')),
  status text not null default 'lead'
    check (status in ('lead','pending','awaiting_deposit','booked','shot','delivered','declined','expired')),
  hold_until timestamptz,
  requested_at timestamptz,
  terms_accepted_at timestamptz,
  approved_at timestamptz,
  deposit_paid_at timestamptz,
  deposit_method text check (deposit_method is null or char_length(deposit_method) <= 20),
  location text check (location is null or char_length(location) <= 160),
  travel_minutes int check (travel_minutes is null or travel_minutes between 0 and 600),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_day_idx on public.leads(day);
create index if not exists leads_status_idx on public.leads(status);

-- הגדרות: מפתח היומן הסודי ונושא ההתראות לטלפון
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  cal_key text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  ntfy_topic text,
  site_url text not null default 'https://turgi-landing.vercel.app'
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.leads enable row level security;
alter table public.site_settings enable row level security;
revoke all on public.leads, public.site_settings from anon, authenticated;

-- דף ההזמנה הישן מוחלף בשאלון. סוגרים את הפונקציה שלו לגישה מבחוץ.
revoke execute on function public.create_booking(date,text,text,text,text) from anon, authenticated;

-- ===== עזרים פנימיים =====

create or replace function public._today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Jerusalem')::date $$;

-- 10:00 בבוקר של היום שאחרי היום (שעון ישראל)
create or replace function public._next_morning()
returns timestamptz language sql stable as $$
  select ((public._today() + 1) + time '10:00') at time zone 'Asia/Jerusalem'
$$;

-- התראה לטלפון דרך אפליקציית ntfy (חינם). לא עושה כלום אם לא הוגדר נושא.
create or replace function public._notify(p_title text, p_message text, p_click text default null)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_topic text;
begin
  select ntfy_topic into v_topic from site_settings where id = 1;
  if coalesce(v_topic, '') = '' then return; end if;
  perform net.http_post(
    url := 'https://ntfy.sh/',
    body := jsonb_build_object('topic', v_topic, 'title', p_title, 'message', p_message,
                               'click', p_click, 'tags', jsonb_build_array('camera')),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
exception when others then
  null; -- התראה שנכשלה לא עוצרת הזמנה
end $$;

-- תאריך מוחזק שלא שולמה עליו מקדמה בזמן חוזר להיות פנוי
create or replace function public._expire()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record; v_url text;
begin
  select site_url into v_url from site_settings where id = 1;
  for r in
    update leads set status = 'expired', updated_at = now()
    where status = 'awaiting_deposit' and hold_until < now()
    returning names, day
  loop
    perform _notify('תאריך שוחרר', r.names || ' לא שילמו מקדמה בזמן. ' || to_char(r.day, 'DD/MM') || ' פנוי שוב.', v_url || '/admin');
  end loop;
end $$;

-- ימים שתפוסים (מוחזקים או שמורים)
create or replace function public._taken(p_except uuid default null)
returns setof date language sql stable security definer set search_path = public as $$
  select day from leads
  where day is not null
    and status in ('awaiting_deposit','booked','shot','delivered')
    and (p_except is null or id <> p_except)
$$;

-- ימים פתוחים ופנויים מהיום והלאה
create or replace function public._available(p_except uuid default null)
returns setof date language sql stable security definer set search_path = public as $$
  select o.day from open_dates o
  where o.day >= public._today()
    and o.day not in (select * from public._taken(p_except))
  order by o.day
$$;

-- ===== פונקציות ציבוריות (שאלון ודף אישי) =====

create or replace function public.lead_create(
  p_names text, p_phone text, p_email text, p_instagram text,
  p_occasion text, p_landscape text, p_timing text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
  v_names text := trim(coalesce(p_names,''));
  v_token text;
  v_rec text := 'basic';
  v_url text;
begin
  if char_length(v_names) < 2 then raise exception 'NAMES_REQUIRED'; end if;
  if char_length(v_phone) < 9 then raise exception 'PHONE_INVALID'; end if;
  if (select count(*) from leads where created_at > now() - interval '1 hour') > 40 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;

  -- שליחה כפולה באותן דקות מחזירה את אותו דף
  select token into v_token from leads
  where phone = v_phone and names = v_names and created_at > now() - interval '15 minutes'
  order by created_at desc limit 1;
  if v_token is not null then return v_token; end if;

  if p_occasion in ('לפני חתונה', 'יום נישואין', 'הריון')
     or coalesce(p_landscape,'') like '%,%' then
    v_rec := 'premium';
  end if;

  insert into leads(names, phone, email, instagram, occasion, landscape, timing, recommended)
  values (v_names, v_phone,
          nullif(lower(trim(coalesce(p_email,''))), ''),
          nullif(regexp_replace(trim(coalesce(p_instagram,'')), '^@', ''), ''),
          nullif(trim(coalesce(p_occasion,'')), ''),
          nullif(trim(coalesce(p_landscape,'')), ''),
          nullif(trim(coalesce(p_timing,'')), ''),
          v_rec)
  returning token into v_token;

  select site_url into v_url from site_settings where id = 1;
  perform _notify('היכרות חדשה: ' || v_names,
    concat_ws(' · ', p_occasion, p_landscape, p_timing) || E'\n' || v_phone,
    v_url || '/admin');
  return v_token;
end $$;

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
    'dates', coalesce((select json_agg(d) from (select * from _available(l.id) limit 200) a(d)), '[]'::json)
  );
end $$;

create or replace function public.lead_request(p_token text, p_day date, p_package text, p_terms boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare l leads; v_url text;
begin
  perform _expire();
  select * into l from leads where token = p_token for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not coalesce(p_terms, false) then raise exception 'TERMS_REQUIRED'; end if;
  if p_package not in ('basic','premium') then raise exception 'BAD_PACKAGE'; end if;
  if l.status not in ('lead','pending','declined','expired') then raise exception 'LOCKED'; end if;
  if p_day is null or p_day not in (select * from _available(l.id)) then raise exception 'DATE_NOT_AVAILABLE'; end if;

  update leads set day = p_day, package = p_package, status = 'pending',
    requested_at = now(), terms_accepted_at = now(), hold_until = null, updated_at = now()
  where id = l.id;

  select site_url into v_url from site_settings where id = 1;
  perform _notify('בקשת תאריך: ' || l.names,
    to_char(p_day, 'DD/MM/YYYY') || ' · ' || case p_package when 'premium' then 'פרימיום' else 'שקיעה' end
      || E'\nמחכה לאישור שלך', v_url || '/admin');
end $$;

-- תשלום מקדמה במצב דמו (עד שיחובר ספק סליקה)
create or replace function public.lead_pay_demo(p_token text, p_method text)
returns void
language plpgsql security definer set search_path = public
as $$
declare l leads; v_url text;
begin
  perform _expire();
  select * into l from leads where token = p_token for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if l.status <> 'awaiting_deposit' then raise exception 'HOLD_EXPIRED'; end if;
  if p_method not in ('bit','card') then raise exception 'BAD_METHOD'; end if;

  update leads set status = 'booked', deposit_paid_at = now(),
    deposit_method = p_method || '-demo', hold_until = null, updated_at = now()
  where id = l.id;

  select site_url into v_url from site_settings where id = 1;
  perform _notify('מקדמה שולמה (דמו): ' || l.names,
    to_char(l.day, 'DD/MM/YYYY') || ' שמור', v_url || '/admin');
end $$;

-- ===== פונקציות מנהל =====

create or replace function public.admin_leads(p_pass text)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  perform _expire();
  return json_build_object(
    'dates', coalesce((select json_agg(day order by day) from open_dates where day >= _today() - 30), '[]'::json),
    'leads', coalesce((select json_agg(l order by l.created_at desc) from (
        select * from leads
        where created_at > now() - interval '400 days' or day >= _today() - 60) l), '[]'::json),
    'settings', (select json_build_object('cal_key', cal_key, 'ntfy_topic', ntfy_topic, 'site_url', site_url)
                 from site_settings where id = 1)
  );
end $$;

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

create or replace function public.admin_lead_save(p_pass text, p_id uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare l leads; v_day date;
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  select * into l from leads where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_day := case when p_data ? 'day' then nullif(p_data->>'day','')::date else l.day end;
  if v_day is distinct from l.day
     and l.status in ('awaiting_deposit','booked','shot','delivered')
     and v_day in (select * from _taken(l.id)) then
    raise exception 'DATE_TAKEN';
  end if;
  update leads set
    day = v_day,
    package = case when p_data ? 'package' then nullif(p_data->>'package','') else package end,
    location = case when p_data ? 'location' then nullif(trim(p_data->>'location'),'') else location end,
    travel_minutes = case when p_data ? 'travel_minutes' then nullif(p_data->>'travel_minutes','')::int else travel_minutes end,
    admin_note = case when p_data ? 'admin_note' then nullif(trim(p_data->>'admin_note'),'') else admin_note end,
    email = case when p_data ? 'email' then nullif(lower(trim(p_data->>'email')),'') else email end,
    updated_at = now()
  where id = l.id;
end $$;

create or replace function public.admin_settings_save(p_pass text, p_ntfy_topic text, p_rotate_cal boolean default false)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  update site_settings set
    ntfy_topic = nullif(trim(coalesce(p_ntfy_topic,'')), ''),
    cal_key = case when p_rotate_cal then encode(extensions.gen_random_bytes(18), 'hex') else cal_key end
  where id = 1;
  return (select json_build_object('cal_key', cal_key, 'ntfy_topic', ntfy_topic) from site_settings where id = 1);
end $$;

create or replace function public.admin_test_notify(p_pass text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  perform _notify('בדיקה ✓', 'ההתראות מהאתר מחוברות לטלפון.', (select site_url || '/admin' from site_settings where id = 1));
end $$;

-- ===== יומן אפל (נקרא מהשרת של Vercel עם המפתח הסודי) =====

create or replace function public.calendar_feed(p_key text)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(p_key,'') = '' or not exists (select 1 from site_settings where id = 1 and cal_key = p_key) then
    raise exception 'BAD_KEY';
  end if;
  perform _expire();
  return json_build_object(
    'site_url', (select site_url from site_settings where id = 1),
    'open', coalesce((select json_agg(d) from (
        select o.day from open_dates o
        where o.day >= _today() - 7
          and o.day not in (select day from leads where day is not null
                            and status in ('pending','awaiting_deposit','booked','shot','delivered'))
        order by o.day) x(d)), '[]'::json),
    'items', coalesce((select json_agg(i) from (
        select id, token, names, phone, email, instagram, occasion, landscape, timing, day, package, status,
               hold_until, deposit_paid_at, deposit_method, location, travel_minutes, admin_note, updated_at
        from leads
        where day is not null and day >= _today() - 60
          and status in ('pending','awaiting_deposit','booked','shot','delivered')
        order by day) i), '[]'::json)
  );
end $$;

-- ===== תזכורות יומיות (pg_cron) =====

create or replace function public._daily_reminders()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record; v_url text;
begin
  select site_url into v_url from site_settings where id = 1;
  for r in select names, day, location from leads
           where status = 'booked' and day in (_today() + 1, _today() + 2)
  loop
    perform _notify(
      case when r.day = _today() + 1 then 'מחר צילום: ' else 'בעוד יומיים צילום: ' end || r.names,
      'לבדוק תחזית ושעת שקיעה' || coalesce(' ב' || r.location, '') || ' ולשלוח לזוג הודעת תיאום.',
      v_url || '/admin#upcoming');
  end loop;
end $$;

do $$
begin
  perform cron.schedule('turgi-expire-holds', '*/15 * * * *', 'select public._expire()');
  perform cron.schedule('turgi-daily-reminders', '0 7 * * *', 'select public._daily_reminders()');
end $$;

-- ===== הרשאות =====

revoke all on function public._today() from public;
revoke all on function public._next_morning() from public;
revoke all on function public._notify(text,text,text) from public, anon, authenticated;
revoke all on function public._expire() from public, anon, authenticated;
revoke all on function public._taken(uuid) from public, anon, authenticated;
revoke all on function public._available(uuid) from public, anon, authenticated;
revoke all on function public._daily_reminders() from public, anon, authenticated;
revoke all on function public.lead_create(text,text,text,text,text,text,text) from public;
revoke all on function public.lead_get(text) from public;
revoke all on function public.lead_request(text,date,text,boolean) from public;
revoke all on function public.lead_pay_demo(text,text) from public;
revoke all on function public.admin_leads(text) from public;
revoke all on function public.admin_lead_action(text,uuid,text) from public;
revoke all on function public.admin_lead_save(text,uuid,jsonb) from public;
revoke all on function public.admin_settings_save(text,text,boolean) from public;
revoke all on function public.admin_test_notify(text) from public;
revoke all on function public.calendar_feed(text) from public;

grant execute on function public.lead_create(text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.lead_get(text) to anon, authenticated;
grant execute on function public.lead_request(text,date,text,boolean) to anon, authenticated;
grant execute on function public.lead_pay_demo(text,text) to anon, authenticated;
grant execute on function public.admin_leads(text) to anon, authenticated;
grant execute on function public.admin_lead_action(text,uuid,text) to anon, authenticated;
grant execute on function public.admin_lead_save(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.admin_settings_save(text,text,boolean) to anon, authenticated;
grant execute on function public.admin_test_notify(text) to anon, authenticated;
grant execute on function public.calendar_feed(text) to anon, authenticated;
