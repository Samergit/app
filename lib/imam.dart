import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'api.dart';
import 'theme.dart';

/// بطاقة غرض مشتركة بين الشاشات.
class ItemCard extends StatelessWidget {
  final Item it;
  final Widget? action;
  const ItemCard(this.it, {this.action, super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Stack(children: [
          Container(
            height: 130, color: AppColors.greenLight,
            child: it.photoUrl.isNotEmpty
                ? Image.network(it.photoUrl, fit: BoxFit.cover, width: double.infinity,
                    errorBuilder: (_, __, ___) => Center(child: Text(categoryEmoji(it.category), style: const TextStyle(fontSize: 44))))
                : Center(child: Text(categoryEmoji(it.category), style: const TextStyle(fontSize: 44))),
          ),
          Positioned(top: 8, right: 8, child: StatusBadge(it.status)),
        ]),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(it.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 4),
            Text('🕌 ${it.sourceMosque}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
            Text('🏷️ ${it.category} · الكمية: ${it.quantity}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
            const SizedBox(height: 6),
            Text(it.description, style: const TextStyle(fontSize: 12.5, height: 1.4, color: Color(0xFF52635C))),
            if (action != null) ...[const SizedBox(height: 10), action!],
          ]),
        ),
      ]),
    );
  }
}

Widget _empty(String emoji, String title, String sub) => Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(emoji, style: const TextStyle(fontSize: 46)),
          const SizedBox(height: 10),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
          Text(sub, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        ]),
      ),
    );

void _snack(BuildContext c, String m) => ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(m)));

/// شاشة تصفّح أغراض المساجد الأخرى.
class BrowseScreen extends StatefulWidget {
  const BrowseScreen({super.key});
  @override
  State<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends State<BrowseScreen> {
  late Future<List<Item>> f;
  @override
  void initState() { super.initState(); f = Api.items('browse'); }
  void _reload() => setState(() => f = Api.items('browse'));

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: FutureBuilder<List<Item>>(
        future: f,
        builder: (c, s) {
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final list = s.data!;
          if (list.isEmpty) return ListView(children: [const SizedBox(height: 120), _empty('📭', 'لا توجد أغراض متاحة', 'اسحب للتحديث أو ارفع غرضاً فائضاً')]);
          return ListView(
            padding: const EdgeInsets.all(14),
            children: list.map((it) => ItemCard(it, action: ElevatedButton(
              onPressed: () async {
                try { await Api.requestItem(it.id); _snack(context, 'تم إرسال طلبك — بانتظار موافقة الوزارة'); _reload(); }
                catch (e) { _snack(context, '$e'.replaceFirst('Exception: ', '')); }
              },
              child: const Text('🤲 طلب هذا الغرض'),
            ))).toList(),
          );
        },
      ),
    );
  }
}

/// شاشة أغراض مسجدي.
class MyItemsScreen extends StatefulWidget {
  const MyItemsScreen({super.key});
  @override
  State<MyItemsScreen> createState() => _MyItemsScreenState();
}

class _MyItemsScreenState extends State<MyItemsScreen> {
  late Future<List<Item>> f;
  @override
  void initState() { super.initState(); f = Api.items('mine'); }
  void _reload() => setState(() => f = Api.items('mine'));

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: FutureBuilder<List<Item>>(
        future: f,
        builder: (c, s) {
          if (!s.hasData) return const Center(child: CircularProgressIndicator());
          final list = s.data!;
          if (list.isEmpty) return ListView(children: [const SizedBox(height: 120), _empty('📦', 'لم ترفع أي غرض بعد', 'اضغط + لتصوير غرض فائض')]);
          return ListView(
            padding: const EdgeInsets.all(14),
            children: list.map((it) => ItemCard(it, action: _ownerAction(it, _reload))).toList(),
          );
        },
      ),
    );
  }

  Widget _ownerAction(Item it, VoidCallback reload) {
    if (it.status == 'available') {
      return OutlinedButton(
        style: OutlinedButton.styleFrom(foregroundColor: AppColors.red),
        onPressed: () async { await Api.deleteItem(it.id); _snack(context, 'تم سحب الإعلان'); reload(); },
        child: const Text('سحب الإعلان'),
      );
    }
    if (it.status == 'approved') {
      return ElevatedButton(
        style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, foregroundColor: const Color(0xFF3A2E05)),
        onPressed: () async { await Api.deliver(it.id); _snack(context, 'تم تسجيل التسليم'); reload(); },
        child: const Text('✅ تأكيد التسليم'),
      );
    }
    return Text(it.status == 'pending' ? 'طلب وارد — بانتظار الوزارة' : 'تمت العملية',
        style: const TextStyle(color: AppColors.muted, fontSize: 12, fontWeight: FontWeight.w700));
  }
}

/// شاشة طلباتي.
class MyRequestsScreen extends StatefulWidget {
  const MyRequestsScreen({super.key});
  @override
  State<MyRequestsScreen> createState() => _MyRequestsScreenState();
}

class _MyRequestsScreenState extends State<MyRequestsScreen> {
  late Future<List<Item>> f;
  @override
  void initState() { super.initState(); f = Api.items('myrequests'); }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Item>>(
      future: f,
      builder: (c, s) {
        if (!s.hasData) return const Center(child: CircularProgressIndicator());
        final list = s.data!;
        if (list.isEmpty) return _empty('📝', 'لا توجد طلبات', 'تصفّح الأغراض وقدّم طلباً');
        return ListView(
          padding: const EdgeInsets.all(14),
          children: list.map((it) => Card(
            margin: const EdgeInsets.only(bottom: 11),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(it.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                Text('${it.sourceMosque} ← مسجدي', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                const SizedBox(height: 8),
                StatusBadge(it.status),
                if (it.decisionNote.isNotEmpty) Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('📋 ${it.decisionNote}', style: const TextStyle(fontSize: 12, color: Color(0xFF52635C))),
                ),
              ]),
            ),
          )).toList(),
        );
      },
    );
  }
}

/// شاشة رفع غرض فائض (مع التقاط صورة).
class AddItemScreen extends StatefulWidget {
  const AddItemScreen({super.key});
  @override
  State<AddItemScreen> createState() => _AddItemScreenState();
}

class _AddItemScreenState extends State<AddItemScreen> {
  final name = TextEditingController(), qty = TextEditingController(), desc = TextEditingController();
  String? cat, photoB64;
  bool busy = false;

  Future<void> _pick() async {
    final x = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1280, imageQuality: 80);
    if (x == null) return;
    final bytes = await x.readAsBytes();
    setState(() => photoB64 = 'data:image/jpeg;base64,${base64Encode(bytes)}');
  }

  Future<void> _save() async {
    if (photoB64 == null) return _snack(context, 'يرجى التقاط صورة');
    if (name.text.trim().isEmpty) return _snack(context, 'أدخل اسم الغرض');
    if (cat == null) return _snack(context, 'اختر الفئة');
    setState(() => busy = true);
    try {
      await Api.addItem({
        'name': name.text.trim(), 'category': cat,
        'quantity': qty.text.trim().isEmpty ? '1' : qty.text.trim(),
        'description': desc.text.trim(), 'photo': photoB64,
      });
      if (mounted) { Navigator.pop(context); _snack(context, 'تم رفع الغرض بنجاح ✓'); }
    } catch (e) {
      _snack(context, '$e'.replaceFirst('Exception: ', ''));
    } finally {
      setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('رفع غرض فائض')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        GestureDetector(
          onTap: _pick,
          child: Container(
            height: 150,
            decoration: BoxDecoration(
              color: AppColors.greenLight,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.green, width: 2),
              image: photoB64 != null
                  ? DecorationImage(image: MemoryImage(base64Decode(photoB64!.split(',')[1])), fit: BoxFit.cover)
                  : null,
            ),
            child: photoB64 == null
                ? const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.photo_camera, size: 36, color: AppColors.greenDark),
                    SizedBox(height: 6),
                    Text('اضغط لالتقاط صورة الغرض', style: TextStyle(color: AppColors.greenDark, fontWeight: FontWeight.w700)),
                  ]))
                : null,
          ),
        ),
        const SizedBox(height: 14),
        TextField(controller: name, decoration: _dec('اسم الغرض')),
        const SizedBox(height: 12),
        Wrap(spacing: 7, children: categories.map((c) => ChoiceChip(
          label: Text('${categoryEmoji(c)} $c'),
          selected: cat == c,
          onSelected: (_) => setState(() => cat = c),
        )).toList()),
        const SizedBox(height: 12),
        TextField(controller: qty, decoration: _dec('الكمية — مثال 1 ، 25')),
        const SizedBox(height: 12),
        TextField(controller: desc, maxLines: 3, decoration: _dec('وصف الحالة وسبب الاستغناء')),
        const SizedBox(height: 16),
        ElevatedButton(onPressed: busy ? null : _save, child: Text(busy ? '...' : 'رفع الغرض')),
      ]),
    );
  }

  InputDecoration _dec(String h) => InputDecoration(
        labelText: h, filled: true, fillColor: AppColors.bg,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      );
}
