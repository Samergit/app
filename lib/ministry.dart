import 'package:flutter/material.dart';
import 'api.dart';
import 'theme.dart';

void _snack(BuildContext c, String m) => ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(m)));

/// بطاقة عملية (طلب نقل) — تُستخدم في طابور الموافقات والسجل.
class OpCard extends StatelessWidget {
  final Item it;
  final List<Widget>? actions;
  const OpCard(this.it, {this.actions, super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 11),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(color: AppColors.greenLight, borderRadius: BorderRadius.circular(11)),
              alignment: Alignment.center,
              child: Text(categoryEmoji(it.category), style: const TextStyle(fontSize: 20)),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(it.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                Text('${it.sourceMosque}  ←  ${it.requesterMosque ?? ''}',
                    style: const TextStyle(color: AppColors.muted, fontSize: 12)),
              ]),
            ),
          ]),
          const SizedBox(height: 8),
          Text('🏷️ ${it.category} · الكمية: ${it.quantity}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
          if (it.description.isNotEmpty) Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(it.description, style: const TextStyle(fontSize: 12.5, color: Color(0xFF52635C))),
          ),
          if (it.status != 'pending') Padding(padding: const EdgeInsets.only(top: 8), child: StatusBadge(it.status)),
          if (it.decisionNote.isNotEmpty) Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('📋 ${it.decisionNote}', style: const TextStyle(fontSize: 12, color: Color(0xFF52635C))),
          ),
          if (actions != null) Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(children: actions!.map((w) => Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: w))).toList()),
          ),
        ]),
      ),
    );
  }
}

/// طابور الموافقات لموظف الوزارة.
class MinistryQueueScreen extends StatefulWidget {
  const MinistryQueueScreen({super.key});
  @override
  State<MinistryQueueScreen> createState() => _MinistryQueueScreenState();
}

class _MinistryQueueScreenState extends State<MinistryQueueScreen> {
  late Future<List<Item>> f;
  @override
  void initState() { super.initState(); f = Api.requests(status: 'pending'); }
  void _reload() => setState(() => f = Api.requests(status: 'pending'));

  Future<void> _approve(Item it) async {
    try { await Api.approve(it.id, ''); _snack(context, '✅ تمت الموافقة على العملية'); _reload(); }
    catch (e) { _snack(context, '$e'.replaceFirst('Exception: ', '')); }
  }

  Future<void> _reject(Item it) async {
    final ctrl = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context, isScrollControlled: true,
      builder: (c) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom, left: 18, right: 18, top: 18),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('رفض العملية', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 4),
          const Text('سيُبلَّغ المسجد الطالب ويعود الغرض متاحاً.', style: TextStyle(color: AppColors.muted, fontSize: 12)),
          const SizedBox(height: 12),
          TextField(controller: ctrl, maxLines: 3, decoration: const InputDecoration(hintText: 'سبب الرفض (اختياري)', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء'))),
            const SizedBox(width: 8),
            Expanded(child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
              onPressed: () => Navigator.pop(c, true), child: const Text('تأكيد الرفض'))),
          ]),
          const SizedBox(height: 16),
        ]),
      ),
    );
    if (ok == true) {
      try { await Api.reject(it.id, ctrl.text.trim()); _snack(context, 'تم رفض العملية'); _reload(); }
      catch (e) { _snack(context, '$e'.replaceFirst('Exception: ', '')); }
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: FutureBuilder<List<Item>>(
        future: f,
        builder: (c, s) {
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final list = s.data!;
          return ListView(padding: const EdgeInsets.all(14), children: [
            const Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: Text('طلبات نقل بانتظار الموافقة — كل عملية تُعتمد منفردة',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
            ),
            if (list.isEmpty)
              const Padding(padding: EdgeInsets.all(40), child: Center(child: Text('✅ لا توجد طلبات معلّقة', style: TextStyle(color: AppColors.muted)))),
            ...list.map((it) => OpCard(it, actions: [
              ElevatedButton(onPressed: () => _approve(it), child: const Text('✅ موافقة')),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.redLight, foregroundColor: AppColors.red),
                onPressed: () => _reject(it), child: const Text('✕ رفض')),
            ])),
          ]);
        },
      ),
    );
  }
}

/// سجل العمليات (مشترك بين الوزارة والمدير).
class OperationsLogScreen extends StatefulWidget {
  const OperationsLogScreen({super.key});
  @override
  State<OperationsLogScreen> createState() => _OperationsLogScreenState();
}

class _OperationsLogScreenState extends State<OperationsLogScreen> {
  late Future<List<Item>> f;
  @override
  void initState() { super.initState(); f = Api.requests(); }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Item>>(
      future: f,
      builder: (c, s) {
        if (!s.hasData) return const Center(child: CircularProgressIndicator());
        final list = s.data!;
        if (list.isEmpty) return const Center(child: Text('لا توجد عمليات بعد', style: TextStyle(color: AppColors.muted)));
        return ListView(
          padding: const EdgeInsets.all(14),
          children: [
            Padding(padding: const EdgeInsets.only(bottom: 10), child: Text('سجل العمليات (${list.length})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5))),
            ...list.map((it) => OpCard(it)),
          ],
        );
      },
    );
  }
}
