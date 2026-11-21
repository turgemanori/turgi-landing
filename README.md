# דף נחיתה: בוקים זוגיים וצילום אירועים

דף נחיתה סטטי (HTML, CSS ו-JavaScript נקיים, בלי תלויות ובלי שלב build), בעברית ובכיוון RTL מלא, מותאם קודם כול למובייל. מיועד לשמש כקישור ב-Bio באינסטגרם ולהוביל לפניות בוואטסאפ.

## מבנה התיקיות

```
├── index.html          ← מבנה הדף וכל הטקסטים
├── css/style.css       ← עיצוב, צבעים ופונטים (המשתנים בראש הקובץ)
├── css/logo.css        ← הלוגו המוטמע (נוצר מ-images/logo.png)
├── js/config.js        ← ★ ההגדרות המרכזיות: וואטסאפ, שם עסק, אינסטגרם, תמונות
├── js/main.js          ← לוגיקה (אין צורך לערוך)
├── images/             ← כאן שמים את התמונות שלכם
│   └── gallery/
├── favicon.svg
└── vercel.json
```

## 1. עדכון מספר הוואטסאפ, שם העסק והאינסטגרם

הכול נמצא בקובץ אחד: `js/config.js`.

```js
businessName: "שם הסטודיו",
whatsappNumber: "972501234567",   // 050-1234567 → 972 + המספר בלי ה-0
whatsappMessage: "היי, אשמח לשמוע פרטים וזמינות לבוק זוגי בשקיעה ✨",
instagramHandle: "your_instagram", // בלי @
location: " (ריק = לא מוצג)",
```

בנוסף יש `whatsappWeddingMessage`, הודעה נפרדת לכפתור שבסעיף החתונות.

כל כפתורי הוואטסאפ בדף (למעלה, בפתיחה, בסגירה, בפוטר והכפתור הצף) מתעדכנים אוטומטית.

## 2. החלפת תמונות

1. מעתיקים את התמונות לתיקייה `images` (או `images/gallery`).
2. ב-`js/config.js` מעדכנים את הנתיב:

```js
heroImage: "images/hero.jpg",
aboutImage: "images/about.jpg",
weddingImage: "images/wedding.jpg",
gallery: [
  { src: "images/gallery/01.jpg", alt: "זוג מחובק בשדה זהוב באור שקיעה", ratio: "tall" },
  ...
]
```

- `ratio` קובע את יחס התמונה בגריד: `portrait` (4:5), `tall` (2:3), `landscape` (3:2), `square` (1:1). כדאי שיתאים לתמונה עצמה.
- `alt` הוא תיאור קצר בעברית, חשוב לנגישות ול-SEO.
- כל עוד `src` ריק, מוצג placeholder בגוון חול.
- אפשר להוסיף או למחוק פריטים במערך כרצונכם.

**המלצות:** JPG או WebP, ברוחב של עד כ-1600 פיקסלים ובמשקל של עד כ-400KB לתמונה. תמונת הפתיחה תיראה הכי טוב אם הזוג נמצא בחלק העליון או בצד שמאל של הפריים, כי הטקסט יושב למטה במובייל ומימין בדסקטופ.

**תמונת שיתוף:** הוסיפו קובץ `images/og-image.jpg` (1200×630). זו התמונה שתופיע כשמישהו ישתף את הקישור בוואטסאפ.

**לוגו:** הלוגו הנוכחי מוטמע ב-`css/logo.css` ונצבע אוטומטית (אספרסו למעלה, קרם בפוטר). להחלפה, שימו PNG על רקע שקוף ב-`images` ועדכנו `logo: "images/new-logo.png"` ב-`js/config.js`.

## 3. עריכת טקסטים, צבעים ופונטים

- **טקסטים:** ישירות ב-`index.html`, כל סעיף מסומן בהערה (`<!-- ===== 2. החוויה הזוגית ===== -->` וכו').
- **צבעים:** בראש `css/style.css`, תחת `:root` (קרם, שנהב, חול, אספרסו וברונזה).
- **פונטים:** Frank Ruhl Libre לכותרות ו-Assistant לטקסט, נטענים מ-Google Fonts ב-`index.html`.

## 4. צפייה מקומית

פשוט פותחים את `index.html` בדפדפן (לחיצה כפולה). אין צורך בהתקנה.

## 5. העלאה ל-GitHub

1. נכנסים ל-[github.com/new](https://github.com/new) ויוצרים ריפו חדש (למשל `landing-page`).
2. בדף הריפו לוחצים **uploading an existing file**, גוררים את **תוכן** התיקייה (לא את התיקייה עצמה, כך ש-`index.html` יהיה בשורש) ולוחצים **Commit changes**.

או מהטרמינל:

```bash
git init
git add .
git commit -m "דף נחיתה ראשון"
git branch -M main
git remote add origin https://github.com/<USERNAME>/landing-page.git
git push -u origin main
```

## 6. חיבור ל-Vercel

1. נכנסים ל-[vercel.com](https://vercel.com) ומתחברים עם חשבון ה-GitHub.
2. **Add New → Project**, בוחרים את הריפו ולוחצים **Import**.
3. ב-Framework Preset משאירים **Other**. אין צורך ב-Build Command או ב-Output Directory.
4. לוחצים **Deploy**. תוך פחות מדקה תקבלו כתובת כמו `landing-page.vercel.app`.
5. מדביקים את הכתובת ב-Bio באינסטגרם.

מעכשיו, כל שינוי שתעלו ל-GitHub יתעדכן באתר אוטומטית. אפשר גם לחבר דומיין משלכם דרך **Settings → Domains** ב-Vercel.
