import 'package:flutter/material.dart';
import 'api.dart';
import 'theme.dart';
import 'imam.dart';
import 'ministry.dart';
import 'manager.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Api.loadSession();
  runApp(const AwqafApp());
}

class AwqafApp extends StatelessWidget {
  const AwqafApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'أوقاف دمشق',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      // فرض الاتجاه من اليمين لليسار لكامل التطبيق.
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child!,
      ),
      home: Api.token != null && Api.user != null ? const HomeShell() : const LoginScreen(),
    );
  }
}

/// ============ شاشة الدخول (رقم جوال + رمز OTP) ============
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final phone = TextEditingController();
  final code = TextEditingController();
  bool otpSent = false, busy = false;

  void snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _requestOtp() async {
    if (phone.text.trim().isEmpty) return snack('أدخل البريد الإلكتروني أو رقم الجوال');
    setState(() => busy = true);
    try {
      final dev = await Api.requestOtp(phone.text.trim());
      setState(() => otpSent = true);
      if (dev != null) {
        code.text = dev;
        snack('رمز التحقق (تجريبي): $dev');
      }
    } catch (e) {
      snack('$e'.replaceFirst('Exception: ', ''));
    } finally {
      setState(() => busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() => busy = true);
    try {
      await Api.verifyOtp(phone.text.trim(), code.text.trim());
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const HomeShell()));
    } catch (e) {
      snack('$e'.replaceFirst('Exception: ', ''));
    } finally {
      setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [AppColors.greenDark, AppColors.green],
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 80, height: 80,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: Colors.white54),
                ),
                child: Padding(padding: const EdgeInsets.all(10), child: Image.asset('assets/logo.png')),
              ),
              const SizedBox(height: 14),
              const Text('مديرية أوقاف دمشق',
                  style: TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w800)),
              const Text('تبادل مستلزمات المساجد الفائضة',
                  style: TextStyle(color: Colors.white70, fontSize: 13)),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(otpSent ? 'رمز التحقق' : 'تسجيل الدخول',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text(otpSent ? 'أدخل الرمز المُرسَل إلى ${phone.text}' : 'أدخل بريدك الإلكتروني أو رقم جوالك المسجّل لدى المديرية',
                      style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                  const SizedBox(height: 14),
                  if (!otpSent)
                    TextField(
                      controller: phone, keyboardType: TextInputType.emailAddress,
                      decoration: _dec('البريد الإلكتروني أو رقم الجوال'),
                    )
                  else
                    TextField(
                      controller: code, keyboardType: TextInputType.number,
                      decoration: _dec('رمز مكوّن من 6 أرقام'),
                    ),
                  const SizedBox(height: 14),
                  ElevatedButton(
                    onPressed: busy ? null : (otpSent ? _verify : _requestOtp),
                    child: Text(busy ? '...' : (otpSent ? 'دخول' : 'إرسال رمز التحقق')),
                  ),
                  if (otpSent)
                    TextButton(onPressed: () => setState(() => otpSent = false), child: const Text('تغيير الرقم')),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: AppColors.goldLight, borderRadius: BorderRadius.circular(12)),
                    child: const Text(
                      'حسابات تجريبية (بريد أو هاتف):\nقيّم مسجد: ahmad@awqaf-damas.gov.sy — 0911000001\nموظف الوزارة: ministry@awqaf-damas.gov.sy — 0922000000\nمدير عام: manager@awqaf-damas.gov.sy — 0933000000',
                      style: TextStyle(fontSize: 11, color: Color(0xFF6A5410), height: 1.7),
                    ),
                  ),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint, filled: true, fillColor: AppColors.bg,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      );
}

/// ============ الهيكل الرئيسي مع شريط التنقل حسب الدور ============
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int idx = 0;

  @override
  Widget build(BuildContext context) {
    final role = Api.user!.role;
    late List<Widget> pages;
    late List<BottomNavigationBarItem> tabs;

    if (role == 'imam') {
      pages = [const BrowseScreen(), const MyItemsScreen(), const MyRequestsScreen()];
      tabs = const [
        BottomNavigationBarItem(icon: Icon(Icons.home_outlined), label: 'تصفّح'),
        BottomNavigationBarItem(icon: Icon(Icons.grid_view), label: 'أغراضي'),
        BottomNavigationBarItem(icon: Icon(Icons.verified_outlined), label: 'طلباتي'),
      ];
    } else if (role == 'ministry') {
      pages = [const MinistryQueueScreen(), const OperationsLogScreen()];
      tabs = const [
        BottomNavigationBarItem(icon: Icon(Icons.fact_check_outlined), label: 'الموافقات'),
        BottomNavigationBarItem(icon: Icon(Icons.receipt_long), label: 'السجل'),
      ];
    } else {
      pages = [const ManagerDashboard(), const OperationsLogScreen(), const MosquesScreen()];
      tabs = const [
        BottomNavigationBarItem(icon: Icon(Icons.dashboard_outlined), label: 'اللوحة'),
        BottomNavigationBarItem(icon: Icon(Icons.receipt_long), label: 'العمليات'),
        BottomNavigationBarItem(icon: Icon(Icons.mosque_outlined), label: 'المساجد'),
      ];
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('أوقاف دمشق', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await Api.logout();
              if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
            },
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(34),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.only(right: 16, bottom: 8),
            child: Text('${Api.user!.fullName}${Api.user!.mosque != null ? ' · ${Api.user!.mosque}' : ''}',
                style: const TextStyle(color: Colors.white70, fontSize: 12)),
          ),
        ),
      ),
      floatingActionButton: role == 'imam' && idx == 1
          ? FloatingActionButton(
              backgroundColor: AppColors.gold,
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AddItemScreen())),
              child: const Icon(Icons.add, color: Color(0xFF3A2E05)),
            )
          : null,
      body: pages[idx],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: idx,
        onTap: (i) => setState(() => idx = i),
        selectedItemColor: AppColors.green,
        unselectedItemColor: AppColors.muted,
        type: BottomNavigationBarType.fixed,
        items: tabs,
      ),
    );
  }
}
