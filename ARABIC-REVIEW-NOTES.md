# SH✡MER — Arabic (العربية) translation review notes

Arabic is **shipped** (Dave's call — no native reviewer available, so we ship our best work).
This logs the translations a native-Arabic speaker should eventually verify. Everything here is
**live**; nothing is withheld. Translations are Modern Standard Arabic (فصحى), chosen for clarity
and unambiguity in emergencies (clarity over style).

Where to change a string later: edit the `AR` dictionary or `LANGS.ar` in `shomer.html`, or the
`ar` branch of `disclaimerHTML` / `tosHTML` / `privacyHTML`.

## 🔴 SAFETY-CRITICAL — verify first (tagged `SAFETY` in source)
These are emergency/SOS/disclaimer strings. A mistranslation here is dangerous.

| String (EN) | Arabic shipped | Confidence / note |
|---|---|---|
| Emergency disclaimer — "not a replacement… call 100/101/102" | "شومير ليس بديلاً عن خدمات الطوارئ… اتصل بـ 100/101/102" | High. Standard terms. |
| "Shomer does not call authorities… dial 100/101/102 yourself" | "شومير لا يتصل بالسلطات… اتصل بـ 100/101/102 بنفسك" | High. |
| 100 — Police | 100 — الشرطة (إسرائيل) | High. Official term. |
| 101 — Magen David Adom (medical) | 101 — نجمة داوود الحمراء (إسعاف) | High. MDA = نجمة داوود الحمراء is the standard Arabic name. |
| 102 — Fire & Rescue | 102 — الإطفاء والإنقاذ | High. |
| 1201 — ZAKA | 1201 — زاكا | Transliteration of the org name (no standard Arabic). Verify. |
| 1202 — Shin Bet | 1202 — الشاباك | High. Common Arabic name for the agency. |
| "EMERGENCY — calling for help" (SOS strobe) | "طوارئ — نطلب المساعدة" | High. |
| "SOS nearby" (incoming banner) | "نداء استغاثة قريب" | High. |
| "Distress" (SOS type fallback) | "استغاثة" | High. |
| SOS type labels (assault/violence/stalking/theft/drugs/medical) | LANGS.ar l1–l6 (اعتداء جنسي / عنف / مطاردة / سرقة / مخدرات / طبي) | Medium-High. Verify register. |
| Lock-screen SOS steps (iPhone/Android/Shake) | آيفون… أندرويد… هزّة شومير… | High. |
| PIN cancel note — "never a fingerprint" | "وليس بصمة إصبع أبداً" | High. |
| Mutual check-in — "'Are you OK?' … your guardian is alerted" | "„هل أنت بخير؟" … يُنبَّه حارسك" | High. |

## 🟡 Judgment calls worth a glance
- **Brand vs. role.** "SHOMER" (the product) → transliterated **شومير**. The role "a SHOMER"
  (a guardian) → **حارس** (pl. حُرّاس). The Hebrew word *shomer* literally means guardian/keeper,
  so this split keeps the brand recognizable while the role reads naturally. Confirm you're happy
  with شومير as the brand spelling.
- **"My SHOMERs"** (the trusted circle) → **حُرّاسي**. Confident.
- **"Dead Man's Switch"** → **مفتاح الأمان الميت** (literal). The concept term has no settled Arabic
  idiom; this is clear enough but a reviewer may prefer a descriptive phrase.
- **"Ghost mode"** → **وضع التخفّي**. Confident.
- **"Distress / Responder / opt-in"** — رendered استغاثة / مُستجيب / اختياري. Confident.
- **Legal text** (Terms, Privacy, Disclaimer) fully translated. Plain-language, not lawyer-drafted —
  ideally a legal translator reviews before a commercial launch, but it is shipped and accurate to
  the English/Hebrew source.

## ✅ Confident — no action expected
Onboarding, map, dropdown, settings labels, status/diagnostic panel, common toasts and actions.
Modern Standard Arabic, RTL verified clean at mobile.

## Remaining English (graceful fallback, not Hebrew)
A small number of rarely-seen strings (demo contact names like "Danny", a few deep toasts) may still
appear in English. They degrade to English (never stale Hebrew) and can be added to the `AR`
dictionary one line at a time.

## Circles panel strings (added 14 Nov 2026, branch i18n-circles, not live yet)
Seven strings in "My SHOMERs" stayed Hebrew in EN and AR. Now tagged data-he/en/ar (the generic sweep translates them):
| EN | AR | Note |
|---|---|---|
| SHOMER circles | دوائر الحُرّاس | Verify |
| New circle | دائرة جديدة | High |
| Add to my circle | إضافة إلى دائرتي | High (same as nature-layer a02da25) |
| My SHOMER's name: | اسم حارسي: | High |
| Add to group: | أضف إلى مجموعة: | High |
| Add SHOMER | أضف حارسًا | High |
| My SHOMERs location alerts | تنبيهات موقع حُرّاسي | High (already used by #arr-ttl) |
Screen-reader labels and the name placeholder in the same panel now switch too (data-aria-* / data-ph-*): إغلاق (Close), اسم الحارس (SHOMER name), مجموعة (Group), وضع التخفّي (Ghost mode), الدوائر (Circles), placeholder جدّي (Grandpa). High confidence; glance at جدّي.
