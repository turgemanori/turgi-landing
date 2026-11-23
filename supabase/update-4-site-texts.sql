-- עדכון 4: עריכת הטקסטים של דף הנחיתה מדף המנהל
-- כבר הורץ על הפרויקט. נשמר כאן לתיעוד.
-- נשמרים רק טקסטים ששונו. טקסט שלא מופיע בטבלה מוצג כמו שהוא כתוב ב-index.html.

create table if not exists public.site_texts (
  key text primary key check (key ~ '^[a-z0-9_.-]{1,60}$'),
  value text not null check (char_length(value) between 1 and 3000),
  updated_at timestamptz not null default now()
);
alter table public.site_texts enable row level security;
revoke all on public.site_texts from anon, authenticated;

-- קריאה ציבורית: מחזיר {"מפתח": "טקסט", ...}
create or replace function public.public_site_texts()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from site_texts;
$$;

-- שמירה מדף המנהל. p_texts = {"מפתח": "טקסט"}. טקסט ריק או null מחזיר את המקור.
create or replace function public.admin_site_texts_save(p_pass text, p_texts jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  if not _admin_ok(p_pass) then raise exception 'BAD_PASSWORD'; end if;
  if jsonb_typeof(p_texts) <> 'object' then raise exception 'BAD_INPUT'; end if;
  if (select count(*) from jsonb_object_keys(p_texts)) > 300 then raise exception 'BAD_INPUT'; end if;
  for r in select k, v from jsonb_each(p_texts) as t(k, v) loop
    if r.v is null or jsonb_typeof(r.v) = 'null' or btrim(r.v #>> '{}') = '' then
      delete from site_texts where key = r.k;
    else
      insert into site_texts(key, value, updated_at) values (r.k, r.v #>> '{}', now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    end if;
  end loop;
  return public_site_texts();
end $$;

revoke all on function public.public_site_texts() from public;
revoke all on function public.admin_site_texts_save(text, jsonb) from public;
grant execute on function public.public_site_texts() to anon, authenticated;
grant execute on function public.admin_site_texts_save(text, jsonb) to anon, authenticated;
