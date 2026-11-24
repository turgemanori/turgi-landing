-- עדכון 5: סטטיסטיקות בדף המנהל וסימון "חדש" לזוגות
-- כבר הורץ על הפרויקט. נשמר כאן לתיעוד. בטוח להריץ שוב.
--
-- מעקב פשוט שלנו, בלי עוגיות ובלי מידע אישי: לכל ביקור נשמרים רק סוג האירוע, מאיפה הגיעו
-- (אינסטגרם, וואטסאפ וכו') ומזהה אקראי של הגלישה הנוכחית, שנמחק כשסוגרים את הדפדפן.
-- אירועים ישנים מ-400 יום נמחקים לבד.

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('visit','quiz_open','quiz_start','quiz_done','summary_sent')),
  source text not null default 'direct' check (source ~ '^[a-z_]{1,20}$'),
  sid text not null check (sid ~ '^[a-z0-9]{6,32}$'),
  lead_id uuid references public.leads(id) on delete set null
);
create index if not exists site_events_created_idx on public.site_events(created_at);
alter table public.site_events enable row level security;
revoke all on public.site_events from anon, authenticated;

-- זוג חדש = עוד לא פתחת את הכרטיס שלו. summary_sent_at = לחצו "שליחת הסיכום לאורי".
alter table public.leads
  add column if not exists seen_at timestamptz,
  add column if not exists summary_sent_at timestamptz;
-- מתי התחיל המעקב (לזוגות מלפני כן אין מידע על שליחת הסיכום)
alter table public.site_settings
  add column if not exists tracking_since timestamptz;

do $$
begin
  if (select tracking_since from public.site_settings where id = 1) is null then
    update public.site_settings set tracking_since = now() where id = 1;
    -- כל מי שכבר ברשימה נחשב "נראה", כדי שהסימון "חדש" יתחיל מעכשיו
    update public.leads set seen_at = coalesce(seen_at, now());
  end if;
end $$;

-- רישום אירוע מהאתר. לא מחזיר שגיאה אף פעם, כדי לא להפריע לגלישה.
create or replace function public.track_event(p_event text, p_source text, p_sid text, p_token text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_lead uuid; v_src text;
begin
  if p_event not in ('visit','quiz_open','quiz_start','quiz_done','summary_sent') then return; end if;
  if coalesce(p_sid,'') !~ '^[a-z0-9]{6,32}$' then return; end if;
  v_src := case when coalesce(p_source,'') ~ '^[a-z_]{1,20}$' then p_source else 'other' end;
  -- הגנה מהצפה
  if (select count(*) from site_events where created_at > now() - interval '10 minutes') > 1500 then return; end if;
  if p_token is not null and p_event in ('quiz_done','summary_sent') then
    select id into v_lead from leads where token = p_token;
    if v_lead is not null and p_event = 'summary_sent' then
      update leads set summary_sent_at = coalesce(summary_sent_at, now()) where id = v_lead;
    end if;
  end if;

  -- אותו אירוע מאותה גלישה נספר פעם אחת בשעה
  if exists (select 1 from site_events where sid = p_sid and event = p_event and created_at > now() - interval '1 hour') then
    return;
  end if;

  insert into site_events(event, source, sid, lead_id) values (p_event, v_src, p_sid, v_lead);
  delete from site_events where created_at < now() - interval '400 days';
exception when others then
  null;
end $$;

-- הכרטיס של הזוג נפתח בדף המנהל
create or replace function public.admin_lead_seen(p_pass text, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  update leads set seen_at = now() where id = p_id and seen_at is null;
end $$;

-- הסטטיסטיקות ל-p_days הימים האחרונים (שעון ישראל, כולל היום)
create or replace function public.admin_stats(p_pass text, p_days int default 30)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_from timestamptz := ((_today() - (v_days - 1)) + time '00:00') at time zone 'Asia/Jerusalem';
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  return json_build_object(
    'days', v_days,
    'tracking_since', (select tracking_since from site_settings where id = 1),
    -- כמה גלישות שונות הגיעו לכל שלב
    'funnel', (select json_build_object(
        'visit',        count(distinct sid) filter (where event = 'visit'),
        'quiz_open',    count(distinct sid) filter (where event = 'quiz_open'),
        'quiz_start',   count(distinct sid) filter (where event = 'quiz_start'),
        'quiz_done',    count(distinct sid) filter (where event = 'quiz_done'),
        'summary_sent', count(distinct sid) filter (where event = 'summary_sent'))
      from site_events where created_at >= v_from),
    -- מהשאלונים שהתקבלו בתקופה: כמה שלחו סיכום, ביקשו תאריך ושילמו מקדמה
    'leads', (select json_build_object(
        'total',     count(*),
        'summary',   count(*) filter (where summary_sent_at is not null),
        'requested', count(*) filter (where requested_at is not null),
        'paid',      count(*) filter (where deposit_paid_at is not null),
        'unseen',    (select count(*) from leads where seen_at is null))
      from leads where created_at >= v_from),
    -- מאיפה הגיעו לדף
    'sources', coalesce((select json_agg(s order by s.n desc) from (
        select source, count(distinct sid) n from site_events
        where created_at >= v_from and event in ('visit','quiz_open')
        group by source) s), '[]'::json),
    -- כניסות לפי יום
    'daily', coalesce((select json_agg(d order by d.day) from (
        select g::date as day,
          (select count(distinct sid) from site_events e
            where e.event = 'visit' and (e.created_at at time zone 'Asia/Jerusalem')::date = g::date) visits,
          (select count(*) from leads l
            where (l.created_at at time zone 'Asia/Jerusalem')::date = g::date) leads
        from generate_series((_today() - (v_days - 1))::timestamp, _today()::timestamp, interval '1 day') g) d), '[]'::json)
  );
end $$;

revoke all on function public.track_event(text,text,text,text) from public;
revoke all on function public.admin_lead_seen(text,uuid) from public;
revoke all on function public.admin_stats(text,int) from public;
grant execute on function public.track_event(text,text,text,text) to anon, authenticated;
grant execute on function public.admin_lead_seen(text,uuid) to anon, authenticated;
grant execute on function public.admin_stats(text,int) to anon, authenticated;
