# דוח הרכב גוף — הפקת PDF

היישום מקבל תוצאות בדיקת הרכב גוף מה-Backend, בוחר את תמונת ה-Mockup המתאימה (לפי מין ואחוז השומן הקרוב ביותר),
מחליף את כל הערכים שבתמונה בערכים שנמדדו בפועל ומפיק PDF.

## הפעלה
```
powershell -ExecutionPolicy Bypass -File serve.ps1
```
ואז לפתוח http://localhost:8080 . השרת המקומי כולל Backend לדוגמה שמחזיר את הסשנים מ-`samples/`.

## זיהוי לפי Session ID
כל דוח שייך ל-Session ID שמונפק על ידי ה-Backend (סשן = בדיקה אחת של נבדק אחד). היישום מקבל אותו באחת מהדרכים:
1. **קישור מה-Backend:** `index.html?session=<SESSION_ID>&subject=<SUBJECT_ID>` (ה-subject אופציונלי, `&download=1` מוריד PDF מיד).
2. **הסשן הפעיל:** כפתור "טען את הסשן הפעיל מהשרת" או `index.html?session=current` — היישום שואל את השרת איזה סשן פתוח.
3. **ידנית:** הקלדה/בחירה מהרשימה בשדה Session ID.

לפני הפקת הדוח היישום מוודא שה-`session_id` (ומזהה הנבדק, אם נשלח) בתשובה זהים למה שהתבקש. אם לא, הוא מציג שגיאה ולא מפיק דוח.
ה-Session ID ומזהה הנבדק מופיעים בעמוד הסיכום, בשם הקובץ (`body-composition_<SESSION>_<SUBJECT>.pdf`) ובמטא-דאטה של ה-PDF.

### ה-API שהיישום מצפה לו (ניתן לשנות ב-`js/config.js`)
| בקשה | תשובה |
|---|---|
| `GET /api/sessions/current` | `{ "session_id": "...", "subject_id": "..." }` |
| `GET /api/sessions/{sessionId}/measurements?subject={subjectId}` | נתוני הבדיקה (ראו `samples/`) כולל `session_id` |
| `GET /api/sessions` (אופציונלי) | `[{ "session_id", "subject_id", "subject_name", "test_date" }]` |

## חיבור ל-Backend אמיתי
עורכים את `js/config.js`:
- `backendBaseUrl`, `measurementPath`, `currentSessionPath`, `listPath`, `headers` — כתובות ה-API והרשאות.
- `mapBackendResponse()` / `mapCurrentSession()` — המרה מהמבנה של ה-Backend למבנה של היישום (אם הוא שונה).
- `strictSessionMatch` — דחיית נתונים שלא שייכים לסשן/נבדק שהתבקש (ברירת מחדל: פעיל).
ה-Backend צריך לאפשר CORS אם הוא בכתובת אחרת.

## מבנה הנתונים
ראו `samples/SES-20261118-7F3A.json`. שדות חובה: `subject.gender` ו-`total_body_fat_pct`; מומלץ `session_id` ו-`subject.id`. שדה חסר יוצג כ-"—".

## כלל בחירת התמונה
לכל מין התמונה עם אחוז השומן הקרוב ביותר (התמונות במרווחים של 10%, כלומר ±5% סביב כל תמונה).
בדיוק באמצע (למשל 25%) — נבחרת התמונה עם השומן הגבוה. מחוץ לטווח — התמונה הקיצונית הקרובה.
גברים: 10/20/30/40. נשים: 10/20/30/40/50/60.

## הוספה/החלפה של תמונה
1. לשים את הקובץ ב-`assets/mockups/` ולהוסיף שורה ב-`js/templates.js`.
2. לפתוח http://localhost:8080/tools/calibrate.html — הכלי מאתר את תיבות הערכים בכל תמונה ומציג מסגרות לבדיקה.
3. להעתיק את הפלט אל `js/layouts.js`.

## קבצים
- `js/report.js` — מנוע הדוח: נרמול נתונים, ציור הערכים על התמונה, עמוד סיכום, כתיבת PDF (ללא ספריות חיצוניות).
- `js/templates.js` — רשימת התמונות וכלל הבחירה. `js/layouts.js` — מיקומי התיבות בכל תמונה.
- `js/app.js`, `index.html` — ממשק המשתמש.
- API להטמעה: `await BodyCompositionReport.generateForSession(sessionId, subjectId)` מחזיר `{ blob, fileName, template }`;
  `BodyCompositionReport.loadSession(sessionId, subjectId)` מציג את הדוח בממשק.
