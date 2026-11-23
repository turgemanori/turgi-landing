-- עדכון 3: עריכת הדף האישי של כל זוג מדף המנהל (כותרת, הודעה אישית, מחיר מיוחד)
-- כבר הורץ על הפרויקט. נשמר כאן לתיעוד.
alter table public.leads
  add column if not exists page_title text check (page_title is null or char_length(page_title) <= 140),
  add column if not exists page_note text check (page_note is null or char_length(page_note) <= 1500),
  add column if not exists price_basic int check (price_basic is null or price_basic between 0 and 100000),
  add column if not exists price_premium int check (price_premium is null or price_premium between 0 and 100000);
-- בנוסף עודכנו הפונקציות lead_get, admin_lead_save ו-calendar_feed כך שיחזירו וישמרו את השדות האלה.
