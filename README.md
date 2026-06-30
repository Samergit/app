# تطبيق الموبايل (Flutter) — أوقاف دمشق

كود واحد يولّد تطبيقَي **أندرويد** و**آيفون**، ويتصل بنفس سيرفر النسخة الويب.

## المتطلبات

- **Flutter SDK** (الإصدار 3.x فأحدث) — https://docs.flutter.dev/get-started/install
- لأندرويد: **Android Studio** + محاكي أو جهاز.
- لآيفون: **جهاز Mac** + **Xcode** (إلزامي — لا يمكن بناء تطبيق آيفون على ويندوز).

## التشغيل أول مرة

```bash
cd mobile_flutter
flutter pub get          # تنزيل المكتبات
flutter run              # تشغيل على المحاكي/الجهاز المتصل
```

## ضبط عنوان السيرفر

في `lib/api.dart` المتغيّر `kApiBase`:

- محاكي أندرويد: `http://10.0.2.2:3000` (القيمة الافتراضية — تشير إلى جهازك).
- محاكي آيفون: `http://localhost:3000`.
- جهاز حقيقي على نفس الشبكة: `http://<عنوان-IP-للكمبيوتر>:3000`.
- عند النشر: نطاق المديرية، مثل `https://app.awqaf-damas.com`.

> شغّل سيرفر النسخة الويب (`node server.js`) أولاً ليتصل به التطبيق.

## البناء للنشر

```bash
# أندرويد — ملف تثبيت
flutter build apk --release
# أو حزمة للنشر على Google Play
flutter build appbundle --release

# آيفون (على Mac فقط)
flutter build ios --release
# ثم الأرشفة والرفع عبر Xcode إلى App Store
```

## الأذونات المطلوبة (الكاميرا)

التطبيق يلتقط صور الأغراض، لذا يحتاج إذن الكاميرا:

- **أندرويد** — في `android/app/src/main/AndroidManifest.xml`:
  ```xml
  <uses-permission android:name="android.permission.CAMERA"/>
  ```
- **آيفون** — في `ios/Runner/Info.plist`:
  ```xml
  <key>NSCameraUsageDescription</key>
  <string>يحتاج التطبيق إلى الكاميرا لتصوير الأغراض الفائضة.</string>
  ```

> ملاحظة: مجلدات `android/` و `ios/` تُنشأ تلقائياً عند أول `flutter create .` داخل هذا المجلد إن لم تكن موجودة. شغّل `flutter create .` ثم أضِف الأذونات أعلاه.

## بنية المشروع

| الملف | الوظيفة |
|------|---------|
| `lib/main.dart` | نقطة البداية، التطبيق، شاشة الدخول، الهيكل والتنقّل |
| `lib/api.dart` | الاتصال بالـ API، النماذج، حفظ الجلسة |
| `lib/theme.dart` | الألوان والثيم وشارة الحالة |
| `lib/imam.dart` | شاشات قيّم المسجد + رفع غرض بصورة |
| `lib/ministry.dart` | طابور موافقات الوزارة + سجل العمليات |
| `lib/manager.dart` | لوحة المدير والمساجد |
| `pubspec.yaml` | اسم التطبيق والمكتبات |

تفاصيل الكود الكاملة في: `../docs/04_توثيق_تطبيق_الموبايل.md`
