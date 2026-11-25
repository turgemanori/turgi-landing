-- ==========================================================
-- עדכון 8: המלצות של זוגות
-- המלצה שזוג כותב בדף האישי מחכה לאישור שלך, ורק אחרי אישור היא
-- מופיעה בדף הנחיתה (עם תאריך). אפשר גם להוסיף בעצמך המלצה
-- שקיבלת בוואטסאפ, בשם של זוג שצילמת.
-- רק מוסיף טבלה ופונקציות. לא מוחק ולא משנה נתונים קיימים. בטוח להריץ שוב.
-- ==========================================================

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,   -- הזוג (אם יש)
  names text not null check (char_length(names) between 1 and 80),
  what text check (what is null or char_length(what) <= 60),      -- למשל "בוק לפני חתונה"
  body text not null check (char_length(body) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  source text not null default 'site' check (source in ('site', 'whatsapp')),
  review_date date not null default ((now() at time zone 'Asia/Jerusalem')::date), -- התאריך שמוצג באתר
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists reviews_status_idx on public.reviews(status, review_date desc);
create index if not exists reviews_lead_idx on public.reviews(lead_id);
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;

-- איך מציגים את סוג הצילום לפי הסיבה מהשאלון
create or replace function public._review_what(p_occasion text)
returns text language sql immutable as $$
  select case p_occasion
    when 'לפני חתונה' then 'בוק לפני חתונה'
    when 'יום נישואין' then 'בוק יום נישואין'
    when 'הריון' then 'בוק הריון'
    when 'במתנה' then 'בוק זוגי במתנה'
    else 'בוק זוגי בשקיעה' end
$$;

-- המלצות שכבר נכתבו בדף האישי לפני העדכון: נכנסות כממתינות לאישור
insert into public.reviews(lead_id, names, what, body, status, source, review_date, created_at)
select l.id, left(l.names, 80), _review_what(l.occasion), l.review, 'pending', 'site',
       (coalesce(l.review_at, now()) at time zone 'Asia/Jerusalem')::date, coalesce(l.review_at, now())
from public.leads l
where l.review is not null and char_length(l.review) >= 3
  and not exists (select 1 from public.reviews r where r.lead_id = l.id and r.source = 'site');

-- ===== הזוג כותב המלצה בדף האישי: נשמרת כממתינה לאישור =====
create or replace function public.lead_review(p_token text, p_text text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v text := left(trim(coalesce(p_text,'')), 2000); l leads; v_url text;
begin
  if char_length(v) < 3 then raise exception 'REVIEW_EMPTY'; end if;
  select * into l from leads where token = p_token and status in ('shot','delivered') for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update leads set review = v, review_at = now(), updated_at = now() where id = l.id;
  -- המלצה ממתינה אחת לכל זוג: אם כתבו שוב לפני שאישרת, היא מתעדכנת
  update reviews set body = v, updated_at = now(), review_date = _today()
    where lead_id = l.id and source = 'site' and status = 'pending';
  if not found then
    insert into reviews(lead_id, names, what, body, status, source)
    values (l.id, left(l.names, 80), _review_what(l.occasion), v, 'pending', 'site');
  end if;
  select site_url into v_url from site_settings where id = 1;
  perform _notify('המלצה חדשה: ' || l.names, 'מחכה לאישור שלך לפני שהיא עולה לאתר', v_url || '/admin#reviews');
end $$;

-- ===== דף הנחיתה: רק המלצות שאישרת, החדשות קודם =====
create or replace function public.public_reviews()
returns json
language sql stable security definer set search_path = public
as $$
  select coalesce(json_agg(json_build_object('names', names, 'what', what, 'text', body, 'date', review_date)
                           order by review_date desc, created_at desc), '[]'::json)
  from (select * from reviews where status = 'approved' order by review_date desc, created_at desc limit 24) r
$$;

-- ===== מנהל =====
create or replace function public.admin_reviews(p_pass text)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  return coalesce((select json_agg(json_build_object(
      'id', r.id, 'lead_id', r.lead_id, 'names', r.names, 'what', r.what, 'text', r.body,
      'status', r.status, 'source', r.source, 'date', r.review_date,
      'created_at', r.created_at, 'approved_at', r.approved_at)
    order by (r.status = 'pending') desc, r.review_date desc, r.created_at desc)
    from reviews r), '[]'::json);
end $$;

-- הוספה (p_id ריק) או עריכה של המלצה. p_status: pending / approved / hidden
create or replace function public.admin_review_save(p_pass text, p_id uuid, p_lead uuid,
  p_names text, p_what text, p_text text, p_date date, p_status text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_names text := left(trim(coalesce(p_names,'')), 80);
  v_what text := nullif(left(trim(coalesce(p_what,'')), 60), '');
  v_text text := left(trim(coalesce(p_text,'')), 2000);
  v_status text := coalesce(nullif(p_status,''), 'approved');
  v uuid;
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  if v_names = '' then raise exception 'NAMES_REQUIRED'; end if;
  if char_length(v_text) < 3 then raise exception 'REVIEW_EMPTY'; end if;
  if v_status not in ('pending','approved','hidden') then raise exception 'BAD_ACTION'; end if;
  if p_lead is not null and not exists (select 1 from leads where id = p_lead) then p_lead := null; end if;
  if p_id is null then
    insert into reviews(lead_id, names, what, body, status, source, review_date, approved_at)
    values (p_lead, v_names, v_what, v_text, v_status, 'whatsapp', coalesce(p_date, _today()),
            case when v_status = 'approved' then now() end)
    returning id into v;
  else
    update reviews set lead_id = p_lead, names = v_names, what = v_what, body = v_text,
      status = v_status, review_date = coalesce(p_date, review_date),
      approved_at = case when v_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
      updated_at = now()
    where id = p_id returning id into v;
    if v is null then raise exception 'NOT_FOUND'; end if;
  end if;
  return v;
end $$;

-- approve = מופיעה באתר, hide = מוסתרת, delete = נמחקת
create or replace function public.admin_review_action(p_pass text, p_id uuid, p_action text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  if p_action = 'approve' then
    update reviews set status = 'approved', approved_at = coalesce(approved_at, now()), updated_at = now() where id = p_id;
  elsif p_action = 'hide' then
    update reviews set status = 'hidden', updated_at = now() where id = p_id;
  elsif p_action = 'delete' then
    delete from reviews where id = p_id;
  else
    raise exception 'BAD_ACTION';
  end if;
end $$;

revoke all on function public._review_what(text) from public;
revoke all on function public.public_reviews() from public;
revoke all on function public.admin_reviews(text) from public;
revoke all on function public.admin_review_save(text,uuid,uuid,text,text,text,date,text) from public;
revoke all on function public.admin_review_action(text,uuid,text) from public;
grant execute on function public.public_reviews() to anon, authenticated;
grant execute on function public.admin_reviews(text) to anon, authenticated;
grant execute on function public.admin_review_save(text,uuid,uuid,text,text,text,date,text) to anon, authenticated;
grant execute on function public.admin_review_action(text,uuid,text) to anon, authenticated;
