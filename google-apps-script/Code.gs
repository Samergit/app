/*
 * بوابة Gmail HTTPS لتطبيق أوقاف دمشق.
 * خزّن WEBHOOK_SECRET في Script Properties ولا تضعه داخل هذا الملف.
 */

const REQUEST_MAX_AGE_MS = 5 * 60 * 1000;

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(value) {
  return String(value || '').replace(/[&<>"']/g, function (character) {
    return {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character];
  });
}

function bytesToHex_(bytes) {
  return bytes.map(function (value) {
    return ('0' + ((value & 255).toString(16))).slice(-2);
  }).join('');
}

function signaturesMatch_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  var difference = 0;
  for (var index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function expectedSignature_(secret, timestamp, nonce, recipient, code) {
  var message = [timestamp, nonce, recipient, code].join('\n');
  return bytesToHex_(Utilities.computeHmacSha256Signature(
    message,
    secret,
    Utilities.Charset.UTF_8
  ));
}

function doGet() {
  return json_({ ok: true, service: 'awqaf-gmail-otp' });
}

function doPost(event) {
  try {
    var raw = event && event.postData && event.postData.contents;
    var body = JSON.parse(raw || '{}');
    var properties = PropertiesService.getScriptProperties();
    var secret = String(properties.getProperty('WEBHOOK_SECRET') || '');
    if (secret.length < 32) {
      console.error('WEBHOOK_SECRET must contain at least 32 characters.');
      return json_({ ok: false, error: 'server_not_configured' });
    }

    var recipient = String(body.to || '').trim().toLowerCase();
    var fullName = String(body.fullName || '').trim().slice(0, 120);
    var code = String(body.code || '').trim();
    var timestamp = String(body.timestamp || '');
    var nonce = String(body.nonce || '').toLowerCase();
    var signature = String(body.signature || '').toLowerCase();
    var timestampNumber = Number(timestamp);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 254 ||
        !/^\d{6}$/.test(code) || !/^\d{13}$/.test(timestamp) ||
        !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature))
      return json_({ ok: false, error: 'invalid_request' });

    if (!isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > REQUEST_MAX_AGE_MS)
      return json_({ ok: false, error: 'expired_request' });

    var expected = expectedSignature_(secret, timestamp, nonce, recipient, code);
    if (!signaturesMatch_(signature, expected))
      return json_({ ok: false, error: 'unauthorized' });

    var cache = CacheService.getScriptCache();
    var cacheKey = 'otp_nonce_' + nonce;
    if (cache.get(cacheKey)) return json_({ ok: false, error: 'replayed_request' });
    cache.put(cacheKey, '1', 10 * 60);

    var senderName = String(properties.getProperty('MAIL_FROM_NAME') || 'مديرية أوقاف دمشق');
    var greeting = fullName ? 'مرحباً ' + fullName : 'مرحباً';
    MailApp.sendEmail({
      to: recipient,
      subject: 'رمز التحقق — أوقاف دمشق',
      name: senderName,
      body: greeting + '\n\nرمز التحقق الخاص بك هو: ' + code +
        '\n\nينتهي الرمز خلال 10 دقائق ولا يجوز مشاركته مع أي شخص.' +
        '\n\nإذا لم تطلب هذا الرمز، فتجاهل الرسالة.',
      htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#112a20">' +
        '<h2 style="color:#0b6e4f">مديرية أوقاف دمشق</h2>' +
        '<p>' + escapeHtml_(greeting) + '،</p>' +
        '<p>رمز التحقق الخاص بك هو:</p>' +
        '<div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0b6e4f;margin:18px 0">' + code + '</div>' +
        '<p>ينتهي الرمز خلال 10 دقائق ولا يجوز مشاركته مع أي شخص.</p>' +
        '<p style="color:#6b7c75;font-size:13px">إذا لم تطلب هذا الرمز، فتجاهل الرسالة.</p>' +
        '</div>'
    });

    return json_({ ok: true, remainingDailyQuota: MailApp.getRemainingDailyQuota() });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: 'send_failed' });
  }
}
