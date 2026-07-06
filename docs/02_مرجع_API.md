# 02 — مرجع واجهة برمجة التطبيقات (API)

كل المسارات تحت `/api`. الطلبات والردود بصيغة **JSON** عبر HTTP(S). المسارات المحمية تتطلب ترويسة:

```
Authorization: Bearer <token>
```

العنوان الأساسي محلياً: `http://localhost:3000`.

---

## المصادقة

### POST /api/auth/request-otp
طلب رمز تحقق. يقبل **البريد الإلكتروني أو رقم الجوال** في الحقل `identifier` (ويقبل أيضاً `email` أو `phone` لأجل التوافق).

**الطلب:** `{ "identifier": "ahmad@awqaf-damas.gov.sy" }` أو `{ "identifier": "0911000001" }`
**الرد (200):** `{ "message": "تم إرسال رمز التحقق", "dev_code": "123456" }`

> `dev_code` يظهر في وضع التجربة فقط؛ في الإنتاج يُرسَل عبر البريد أو الـ SMS ولا يُعاد.
> **الأخطاء:** `404` البريد أو الرقم غير مسجّل.

### POST /api/auth/verify-otp
التحقق من الرمز وإصدار رمز الدخول.

**الطلب:** `{ "identifier": "ahmad@awqaf-damas.gov.sy", "code": "123456" }`
**الرد (200):**
```json
{
  "token": "eyJ...",
  "user": { "id": 1, "fullName": "الشيخ أحمد", "role": "imam", "mosqueId": 2, "mosque": "جامع الإيمان" }
}
```
**الأخطاء:** `401` رمز غير صحيح.

---

## المستخدم والمساجد

### GET /api/me
بيانات المستخدم الحالي. **الرد:** كائن المستخدم.

### GET /api/mosques
قائمة المساجد. **الرد:** `{ "data": [ { "id", "name", "area" } ] }`

---

## الأغراض

### GET /api/items?scope=...
قائمة الأغراض حسب النطاق:

| `scope` | المعنى |
|--------|--------|
| `browse` | المتاحة من مساجد أخرى (للقيّم) |
| `mine` | أغراض مسجدي |
| `myrequests` | الأغراض التي طلبها مسجدي |

**الرد:** `{ "data": [ Item, ... ] }` حيث `Item`:
```json
{
  "id": 1, "name": "مكيّف", "category": "تكييف وتدفئة", "quantity": "2",
  "description": "...", "photo": "/uploads/item_1.jpg", "status": "available",
  "decisionNote": "", "createdAt": 1718000000000,
  "sourceMosque": { "id": 1, "name": "الجامع الأموي" },
  "requesterMosque": null
}
```

### POST /api/items  *(قيّم فقط)*
رفع غرض فائض.

**الطلب:**
```json
{ "name": "براد ماء", "category": "أخرى", "quantity": "1",
  "description": "فائض", "photo": "data:image/jpeg;base64,..." }
```
**الرد (201):** الغرض المُنشأ. **الأخطاء:** `400` بيانات ناقصة، `403` ليس قيّماً.

### DELETE /api/items/:id  *(المالك فقط)*
سحب إعلان غرض متاح. **الرد:** `{ "ok": true }`. **الأخطاء:** `403`, `404`.

### POST /api/items/:id/request  *(قيّم من مسجد آخر)*
طلب غرض — يحوّله إلى `pending`.
**الرد (201):** الغرض بحالة `pending`.
**الأخطاء:** `403` ليس قيّماً، `409` غرض مسجده / غير متاح.

### POST /api/items/:id/deliver  *(المسجد المصدر فقط)*
تأكيد التسليم بعد الموافقة — يحوّله إلى `delivered`.
**الأخطاء:** `403` ليس المصدر، `409` الحالة ليست `approved`.

---

## الطلبات والموافقات

### GET /api/requests?status=...  *(وزارة / مدير)*
قائمة العمليات (الأغراض التي لها طالب). `status` اختياري (`pending` لطابور الموافقات).
**الرد:** `{ "data": [ Item, ... ] }`. **الأخطاء:** `403`.

### POST /api/requests/:id/approve  *(موظف وزارة فقط)*
الموافقة على عملية — يحوّلها إلى `approved`.
**الطلب:** `{ "note": "ملاحظة اختيارية" }`
**الأخطاء:** `403` ليس موظف وزارة، `404`, `409` ليست `pending`.

### POST /api/requests/:id/reject  *(موظف وزارة فقط)*
رفض عملية — يعيد الغرض إلى `available` ويُلغي الطالب.
**الطلب:** `{ "note": "سبب الرفض" }`

---

## الإحصاءات

### GET /api/stats/overview  *(مدير فقط)*
**الرد:**
```json
{
  "total": 6, "available": 4, "pending": 1, "approved": 1, "delivered": 2,
  "mosques": 6,
  "categories": { "تكييف وتدفئة": 2, "أثاث": 2 },
  "perMosque": [ { "name": "الجامع الأموي", "given": 2, "received": 0 } ]
}
```

---

## رموز الحالة (HTTP)

| الرمز | الدلالة |
|------|---------|
| 200 / 201 | نجاح / تم الإنشاء |
| 400 | بيانات ناقصة أو غير صحيحة |
| 401 | غير مسجّل دخول / رمز غير صالح |
| 403 | الصلاحية غير كافية للدور |
| 404 | المورد غير موجود |
| 409 | تعارض حالة (مثل طلب غرض غير متاح) |

## مثال تدفّق كامل (cURL)

```bash
B=http://localhost:3000
# 1) دخول القيّم
CODE=$(curl -s -X POST $B/api/auth/request-otp -d '{"phone":"0911000001"}' | jq -r .dev_code)
TOK=$(curl -s -X POST $B/api/auth/verify-otp -d "{\"phone\":\"0911000001\",\"code\":\"$CODE\"}" | jq -r .token)
# 2) طلب غرض
curl -s -X POST $B/api/items/1/request -H "Authorization: Bearer $TOK"
# 3) دخول الوزارة والموافقة
MC=$(curl -s -X POST $B/api/auth/request-otp -d '{"phone":"0922000000"}' | jq -r .dev_code)
MT=$(curl -s -X POST $B/api/auth/verify-otp -d "{\"phone\":\"0922000000\",\"code\":\"$MC\"}" | jq -r .token)
curl -s -X POST $B/api/requests/1/approve -H "Authorization: Bearer $MT" -d '{"note":"موافق"}'
```
