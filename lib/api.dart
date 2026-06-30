import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// عنوان السيرفر. غيّره إلى نطاق المديرية عند النشر، مثل:
///   https://app.awqaf-damas.com
/// عند التجربة على محاكي أندرويد استخدم 10.0.2.2 بدل localhost.
/// عند التجربة على جهاز حقيقي استخدم رابط النفق العام (Tunnelmole):
const String kApiBase = 'https://fmbcmi-ip-47-65-242-67.tunnelmole.net';

/// نموذج المستخدم.
class AppUser {
  final int id;
  final String fullName;
  final String role; // imam | ministry | manager
  final int? mosqueId;
  final String? mosque;
  AppUser({required this.id, required this.fullName, required this.role, this.mosqueId, this.mosque});
  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'],
        fullName: j['fullName'] ?? '',
        role: j['role'] ?? 'imam',
        mosqueId: j['mosqueId'],
        mosque: j['mosque'],
      );
}

/// نموذج الغرض/العملية.
class Item {
  final int id;
  final String name, category, quantity, description, photo, status, decisionNote;
  final String sourceMosque;
  final String? requesterMosque;
  final int createdAt;
  Item.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        name = j['name'] ?? '',
        category = j['category'] ?? '',
        quantity = j['quantity']?.toString() ?? '1',
        description = j['description'] ?? '',
        photo = j['photo'] ?? '',
        status = j['status'] ?? 'available',
        decisionNote = j['decisionNote'] ?? '',
        sourceMosque = (j['sourceMosque']?['name']) ?? '',
        requesterMosque = j['requesterMosque']?['name'],
        createdAt = j['createdAt'] ?? 0;

  /// رابط الصورة الكامل (السيرفر يعيد مساراً نسبياً مثل /uploads/..).
  String get photoUrl => photo.isEmpty ? '' : (photo.startsWith('http') ? photo : '$kApiBase$photo');
}

/// خدمة الاتصال بالـ API + إدارة رمز الدخول.
class Api {
  static String? token;
  static AppUser? user;

  static Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  /// تحميل الجلسة المحفوظة عند بدء التطبيق.
  static Future<void> loadSession() async {
    final sp = await SharedPreferences.getInstance();
    token = sp.getString('token');
    final u = sp.getString('user');
    if (u != null) user = AppUser.fromJson(jsonDecode(u));
  }

  static Future<void> _saveSession() async {
    final sp = await SharedPreferences.getInstance();
    if (token != null) sp.setString('token', token!);
    if (user != null) {
      sp.setString('user',
          jsonEncode({'id': user!.id, 'fullName': user!.fullName, 'role': user!.role, 'mosqueId': user!.mosqueId, 'mosque': user!.mosque}));
    }
  }

  static Future<void> logout() async {
    token = null;
    user = null;
    final sp = await SharedPreferences.getInstance();
    await sp.remove('token');
    await sp.remove('user');
  }

  static Future<dynamic> _req(String method, String path, {Map? body}) async {
    final uri = Uri.parse('$kApiBase$path');
    final r = await (method == 'GET'
        ? http.get(uri, headers: _headers)
        : method == 'DELETE'
            ? http.delete(uri, headers: _headers)
            : http.post(uri, headers: _headers, body: jsonEncode(body ?? {})));
    final data = r.body.isEmpty ? {} : jsonDecode(r.body);
    if (r.statusCode >= 400) {
      throw Exception(data is Map ? (data['error'] ?? 'حدث خطأ') : 'حدث خطأ');
    }
    return data;
  }

  // ---- المصادقة ----
  /// يطلب رمز التحقق؛ يعيد الرمز التجريبي إن كان السيرفر في وضع التجربة.
  static Future<String?> requestOtp(String identifier) async {
    final d = await _req('POST', '/api/auth/request-otp', body: {'identifier': identifier});
    return d['dev_code'];
  }

  static Future<AppUser> verifyOtp(String identifier, String code) async {
    final d = await _req('POST', '/api/auth/verify-otp', body: {'identifier': identifier, 'code': code});
    token = d['token'];
    user = AppUser.fromJson(d['user']);
    await _saveSession();
    return user!;
  }

  // ---- الأغراض ----
  static Future<List<Item>> items(String scope) async {
    final d = await _req('GET', '/api/items?scope=$scope');
    return (d['data'] as List).map((e) => Item.fromJson(e)).toList();
  }

  static Future<void> addItem(Map body) => _req('POST', '/api/items', body: body);
  static Future<void> deleteItem(int id) => _req('DELETE', '/api/items/$id');
  static Future<void> requestItem(int id) => _req('POST', '/api/items/$id/request');
  static Future<void> deliver(int id) => _req('POST', '/api/items/$id/deliver');

  // ---- الموافقات ----
  static Future<List<Item>> requests({String? status}) async {
    final d = await _req('GET', '/api/requests${status != null ? '?status=$status' : ''}');
    return (d['data'] as List).map((e) => Item.fromJson(e)).toList();
  }

  static Future<void> approve(int id, String note) =>
      _req('POST', '/api/requests/$id/approve', body: {'note': note});
  static Future<void> reject(int id, String note) =>
      _req('POST', '/api/requests/$id/reject', body: {'note': note});

  // ---- الإحصاءات ----
  static Future<Map<String, dynamic>> stats() async =>
      Map<String, dynamic>.from(await _req('GET', '/api/stats/overview'));
}
