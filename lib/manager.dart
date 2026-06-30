import 'package:flutter/material.dart';
import 'api.dart';
import 'theme.dart';

/// لوحة الإشراف للمدير العام.
class ManagerDashboard extends StatefulWidget {
  const ManagerDashboard({super.key});
  @override
  State<ManagerDashboard> createState() => _ManagerDashboardState();
}

class _ManagerDashboardState extends State<ManagerDashboard> {
  late Future<Map<String, dynamic>> f;
  @override
  void initState() { super.initState(); f = Api.stats(); }

  Widget _stat(String n, String l, Color c) => Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(15), border: Border.all(color: AppColors.line)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(n, style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800, color: c)),
          Text(l, style: const TextStyle(fontSize: 11.5, color: AppColors.muted)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => setState(() => f = Api.stats()),
      child: FutureBuilder<Map<String, dynamic>>(
        future: f,
        builder: (c, s) {
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final d = s.data!;
          final cats = Map<String, dynamic>.from(d['categories'] ?? {});
          final maxCat = cats.values.isEmpty ? 1 : cats.values.map((e) => e as int).reduce((a, b) => a > b ? a : b);
          return ListView(padding: const EdgeInsets.all(14), children: [
            const Text('لوحة الإشراف', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 2.1,
              children: [
                _stat('${d['total']}', 'إجمالي الأغراض', AppColors.greenDark),
                _stat('${d['available']}', 'متاحة للتبادل', AppColors.gold),
                _stat('${d['pending']}', 'بانتظار الوزارة', AppColors.amber),
                _stat('${d['approved']}', 'قيد التسليم', AppColors.blue),
                _stat('${d['delivered']}', 'عمليات مكتملة', AppColors.greenDark),
                _stat('${d['mosques']}', 'مساجد مشاركة', AppColors.greenDark),
              ],
            ),
            const SizedBox(height: 16),
            const Text('الفئات تداولاً', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            const SizedBox(height: 10),
            ...cats.entries.map((e) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text('${categoryEmoji(e.key)} ${e.key}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                  Text('${e.value}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                ]),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(9),
                  child: LinearProgressIndicator(
                    value: (e.value as int) / maxCat, minHeight: 9,
                    backgroundColor: AppColors.greenLight, color: AppColors.green,
                  ),
                ),
              ]),
            )),
          ]);
        },
      ),
    );
  }
}

/// شاشة المساجد المشاركة.
class MosquesScreen extends StatefulWidget {
  const MosquesScreen({super.key});
  @override
  State<MosquesScreen> createState() => _MosquesScreenState();
}

class _MosquesScreenState extends State<MosquesScreen> {
  late Future<Map<String, dynamic>> f;
  @override
  void initState() { super.initState(); f = Api.stats(); }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: f,
      builder: (c, s) {
        if (!s.hasData) return const Center(child: CircularProgressIndicator());
        final list = List<Map<String, dynamic>>.from(s.data!['perMosque'] ?? []);
        return ListView(
          padding: const EdgeInsets.all(14),
          children: [
            Padding(padding: const EdgeInsets.only(bottom: 10), child: Text('المساجد المشاركة (${list.length})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5))),
            ...list.map((m) => Card(
              margin: const EdgeInsets.only(bottom: 11),
              child: ListTile(
                leading: const Text('🕌', style: TextStyle(fontSize: 24)),
                title: Text(m['name'], style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                subtitle: Text('رفع ${m['given']} غرض · طلب ${m['received']}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
              ),
            )),
          ],
        );
      },
    );
  }
}
