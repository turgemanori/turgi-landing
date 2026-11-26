-- ==========================================================
-- עדכון 9: חיזוק אבטחה וביצועים (מבדיקת Supabase, 26/11)
-- כבר הורץ על המאגר החי (migration: security_perf_hardening_nov26).
-- הקובץ כאן לתיעוד. בטוח להריץ שוב. לא משנה נתונים.
-- ==========================================================

-- נועלים את נתיב החיפוש של שלוש פונקציות העזר הקטנות
alter function public._today() set search_path = public;
alter function public._next_morning() set search_path = public;
alter function public._review_what(text) set search_path = public;

-- פונקציות העזר משמשות רק בתוך פונקציות אחרות בשרת, לא ישירות מהאתר
revoke execute on function public._today() from public, anon, authenticated;
revoke execute on function public._next_morning() from public, anon, authenticated;
revoke execute on function public._review_what(text) from public, anon, authenticated;

-- אינדקס חסר בטבלת הסטטיסטיקות
create index if not exists site_events_lead_id_idx on public.site_events (lead_id);
