import 'package:flutter/material.dart';

/// ألوان وهوية التطبيق — مطابقة لنسخة الويب.
class AppColors {
  static const green = Color(0xFF0B6E4F);
  static const greenDark = Color(0xFF08503A);
  static const greenLight = Color(0xFFE7F2EE);
  static const gold = Color(0xFFC9A227);
  static const goldLight = Color(0xFFF7EFD6);
  static const ink = Color(0xFF1C2B26);
  static const muted = Color(0xFF6B7C75);
  static const line = Color(0xFFE2E8E4);
  static const bg = Color(0xFFF4F7F5);
  static const red = Color(0xFFC0392B);
  static const redLight = Color(0xFFFBEBE9);
  static const amber = Color(0xFFB97A0A);
  static const amberLight = Color(0xFFFBF1DD);
  static const blue = Color(0xFF1F6FB2);
  static const blueLight = Color(0xFFE7F1F9);
}

/// ثيم التطبيق العام (عربي RTL يُضبط في main.dart عبر Directionality/locale).
ThemeData buildTheme() {
  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: AppColors.bg,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.green,
      primary: AppColors.green,
      secondary: AppColors.gold,
    ),
    fontFamily: 'Tajawal', // يُحمّل من النظام؛ يمكن تضمين الخط في assets لاحقاً
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.green,
      foregroundColor: Colors.white,
      elevation: 0,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.line),
        borderRadius: BorderRadius.circular(18),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.green,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
      ),
    ),
  );
}

/// شارة حالة الغرض/العملية بالألوان المناسبة.
class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});

  static const Map<String, List<dynamic>> _map = {
    'available': ['متاح للطلب', AppColors.greenLight, AppColors.greenDark],
    'pending': ['بانتظار موافقة الوزارة', AppColors.amberLight, AppColors.amber],
    'approved': ['موافَق — بانتظار التسليم', AppColors.blueLight, AppColors.blue],
    'rejected': ['مرفوض', AppColors.redLight, AppColors.red],
    'delivered': ['تم التسليم', Color(0xFFECECEC), Color(0xFF555555)],
  };

  @override
  Widget build(BuildContext context) {
    final m = _map[status] ?? _map['available']!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: m[1] as Color,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(m[0] as String,
          style: TextStyle(
              color: m[2] as Color, fontWeight: FontWeight.w800, fontSize: 11)),
    );
  }
}

/// إيموجي حسب فئة الغرض.
String categoryEmoji(String c) {
  const map = {
    'تكييف وتدفئة': '❄️',
    'فرش وسجاد': '🟩',
    'أثاث': '🪑',
    'صوتيات': '🔊',
    'إنارة': '💡',
    'أخرى': '📦',
  };
  return map[c] ?? '📦';
}

const categories = ['تكييف وتدفئة', 'فرش وسجاد', 'أثاث', 'صوتيات', 'إنارة', 'أخرى'];
