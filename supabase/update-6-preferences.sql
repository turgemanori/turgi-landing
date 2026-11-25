-- ==========================================================
-- עדכון 6: שאלון העדפות אחרי בחירת הערב, מייל בשלב המקדמה,
-- ומעקב אחרי ההודעות שהזוג שלח לאורי בוואטסאפ.
-- רק מוסיף עמודות ומעדכן פונקציות. לא מוחק כלום. בטוח להריץ שוב.
-- ==========================================================

alter table public.leads
  -- הסגנון שבחרו (טבעי, רומנטי וכו') ומקום מיוחד שביקשו (לא חובה)
  add column if not exists pref_style text check (pref_style is null or char_length(pref_style) <= 60),
  add column if not exists pref_location text check (pref_location is null or char_length(pref_location) <= 160),
  add column if not exists prefs_at timestamptz,
  -- לחצו "שליחה לאורי לאישור" אחרי בחירת הערב
  add column if not exists approval_sent_at timestamptz,
  -- לחצו "סיימנו את ההרשמה" אחרי המקדמה
  add column if not exists finished_sent_at timestamptz;

-- ===== הזוג שומר את ההעדפות שלו =====
create or replace function public.lead_prefs(p_token text, p_style text, p_location text)
returns void
language plpgsql security definer set search_path = public
as $$
declare l leads;
begin
  select * into l from leads where token = p_token for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if l.status not in ('lead','pending','awaiting_deposit','booked') then raise exception 'LOCKED'; end if;
  if char_length(trim(coalesce(p_style,''))) < 2 then raise exception 'STYLE_REQUIRED'; end if;
  update leads set
    pref_style = left(trim(p_style), 60),
    pref_location = nullif(left(trim(coalesce(p_location,'')), 160), ''),
    prefs_at = now(), updated_at = now()
  where id = l.id;
end $$;

-- ===== מייל לקבלות ולתמונות (נאסף בשלב המקדמה) =====
create or replace function public.lead_email(p_token text, p_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v text := lower(trim(coalesce(p_email,'')));
begin
  if char_length(v) > 120 or v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'EMAIL_INVALID'; end if;
  update leads set email = v, updated_at = now() where token = p_token;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- ===== סימון שהזוג לחץ על הודעת וואטסאפ לאורי =====
create or replace function public.lead_mark(p_token text, p_what text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_what = 'approval_sent' then
    update leads set approval_sent_at = coalesce(approval_sent_at, now()) where token = p_token;
  elsif p_what = 'finished_sent' then
    update leads set finished_sent_at = coalesce(finished_sent_at, now()) where token = p_token;
  end if;
exception when others then
  null; -- סימון שנכשל לא מפריע לזוג
end $$;

-- ===== הדף האישי: מחזיר גם את ההעדפות ואת המיקום שקבעת =====
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
    'dates', coalesce((select json_agg(d) from (select * from _available(l.id) limit 200) a(d)), '[]'::json)
  );
end $$;

-- ===== יומן אפל: אותו יומן, עם הסגנון והמקום שהזוג ביקש =====
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
               hold_until, deposit_paid_at, deposit_method, location, travel_minutes, admin_note, updated_at,
               price_basic, price_premium, pref_style, pref_location
        from leads
        where day is not null and day >= _today() - 60
          and status in ('pending','awaiting_deposit','booked','shot','delivered')
        order by day) i), '[]'::json)
  );
end $$;

revoke all on function public.lead_prefs(text,text,text) from public;
revoke all on function public.lead_email(text,text) from public;
revoke all on function public.lead_mark(text,text) from public;
grant execute on function public.lead_prefs(text,text,text) to anon, authenticated;
grant execute on function public.lead_email(text,text) to anon, authenticated;
grant execute on function public.lead_mark(text,text) to anon, authenticated;
