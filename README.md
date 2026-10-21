# آخر الناجين: دليل التشغيل

لعبة معركة بقاء تشتغل من المتصفح، وتنزل على الجوال كتطبيق من Chrome بدون متجر.

## الملفات وش فيها

| الملف | وظيفته |
|---|---|
| `index.html` | صفحة اللعبة (الشاشات والأزرار) |
| `game.js` | كود اللعبة كامل: الجندي، الأسلحة، البوتات، العاصفة، الأونلاين |
| `models/Soldier.glb` | مجسم الجندي ثلاثي الأبعاد بالحركات |
| `vendor/` | مكتبة three.js للرسم ثلاثي الأبعاد (لا تعدّلها) |
| `config.js` | **الملف الوحيد اللي تعدّله**: بيانات Supabase عشان الأونلاين |
| `net-supabase.js` | يربط اللعب الأونلاين بـ Supabase Realtime |
| `sw.js` | يخلي اللعبة تشتغل **بدون إنترنت** بعد أول فتح |
| `manifest.webmanifest` | اسم التطبيق وأيقونته، عشان ينزل على الجوال |
| `icons/` | أيقونات التطبيق |

## الخطوات

### 1. افتح المشروع في VS Code
فك ضغط الملف، وفي VS Code اختر File ← Open Folder ← مجلد `last-survivor-site`.

### 2. شغّل الأونلاين (اختياري)
1. افتح Supabase ← مشروعك ← Project Settings ← API.
2. انسخ **Project URL** وحطه مكان `PUT_SUPABASE_URL_HERE` في `config.js`.
3. انسخ **anon public** وحطه مكان `PUT_SUPABASE_ANON_KEY_HERE`.
4. احفظ (Ctrl + S).

> مفتاح anon عام ومسموح يكون في المتصفح. **لا تحط مفتاح service_role أبداً.**
> بدون هالخطوة اللعبة تشتغل عادي، بس الفردي ضد البوتات فقط.

### 3. ارفعه على GitHub
1. github.com ← New repository ← الاسم `last-survivor` ← Create.
2. Upload files ← اسحب **محتويات** المجلد (مو المجلد نفسه) ← Commit changes.

### 4. انشره (GitHub Pages أو Vercel)
**GitHub Pages:** المستودع ← Settings ← Pages ← Branch: `main` و `/ (root)` ← Save. بعد دقيقتين الرابط: `USERNAME.github.io/last-survivor`

**أو Vercel:**
1. vercel.com ← Add New ← Project ← اختر `last-survivor` ← Deploy.
2. بعد دقيقة يعطيك رابط مثل `last-survivor.vercel.app`.

### 5. نزّله على الجوال
- **أندرويد (Chrome):** افتح الرابط ← ⋮ ← **تثبيت التطبيق**.
- **أيفون (Safari):** افتح الرابط ← زر المشاركة ← **إضافة إلى الشاشة الرئيسية**.

## لما تعدّل اللعبة
بعد أي تعديل، افتح `sw.js` وغيّر رقم النسخة (`ls3d-v2` إلى `ls3d-v3` وهكذا). بدون هالخطوة الجوالات تظل على النسخة القديمة المحفوظة.

## Google Play (بعد التجربة)
1. افتح pwabuilder.com وحط رابط اللعبة.
2. اختر Android ← Generate Package، ويطلع لك ملف `.aab`.
3. سجّل في Google Play Console (رسوم مرة وحدة 25 دولار) وارفع الملف.
4. PWABuilder يعطيك ملف `assetlinks.json`. حطه في مجلد اسمه `.well-known` داخل المشروع وارفعه على GitHub، عشان تفتح اللعبة كامل الشاشة بدون شريط المتصفح.

## حقوق
- مكتبة three.js مرخصة MIT (شوف `vendor/THREE-LICENSE.txt`).
- مجسم الجندي من أمثلة three.js (أصله من Mixamo)، ومسموح استخدامه في الألعاب.
