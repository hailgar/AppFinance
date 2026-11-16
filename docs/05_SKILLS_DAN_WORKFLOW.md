# Skill dan workflow yang diperlukan

Dokumen ini daftar kemampuan yang disarankan untuk coding agent di project Catat Harian. Ini bukan laporan bahwa skill tersebut sudah terpasang, bukan file skill installable, dan tidak mengubah instalasi Codex/Claude/Odysseus.

## 1. Skill inti yang diprioritaskan

Nama selain `build-fullstack-web` di bawah adalah nama kemampuan usulan; cocokkan dengan skill yang benar-benar tersedia di agent. Tidak perlu memasang banyak skill yang saling mengulang.

| Kemampuan / nama usulan | Kapan digunakan | Isi yang perlu ada |
|---|---|---|
| `build-fullstack-web` — tersedia pada sesi ini | Perencanaan BE dan integrasi | Inspect project, scope, kontrak, auth, persistensi, verifikasi; tidak menggantikan skill React Native |
| `android-react-native-expo` | FE dan build Android | Expo Router, native builds, lifecycle, safe area, keyboard, device testing, SDK compatibility |
| `mobile-ui-accessibility` | Desain dan review FE | Hierarki angka, form rupiah, empty/error/loading, 48 dp, ukuran teks, TalkBack, kontras |
| `fastapi-api-security` | BE | Pydantic strict validation, Firebase token verification, UID authorization, error contract, blocking I/O |
| `google-sheets-repository` | Penyimpanan BE | Private service account, literal writes, append ledger, reducer, revision, idempotency, quotas, replay/restore |
| `android-local-reminders` | Reminder FE | Channels, izin, jadwal lokal, cancel/reschedule, restart, logout, timezone, batas force-stop/battery |
| `systematic-debugging` + verifikasi hasil | Saat error dan sebelum handoff | Reproduksi, bukti, akar masalah, perbaikan fokus, pemeriksaan aktual |

Minimum praktis: satu kemampuan FE Android, satu BE FastAPI, dan satu integrasi Sheets; tambahkan panduan reminder dan verifikasi sebagai referensi bila agent mendukungnya. Kemampuan UI dapat digabung dalam skill FE. Skill tidak memberikan akses filesystem, shell, HP, browser, credential, atau API yang belum tersedia.

## 2. Kalau ingin dibuat menjadi custom skill nanti

Usulan tiga skill terpisah agar instruksinya tidak terlalu besar:

1. `build-android-finance-expo`: FE native, UI minimalis, amount/date handling, reminder lifecycle, device QA. Referensi untuk design tokens dan acceptance checklist.
2. `build-fastapi-sheets`: FastAPI, Firebase auth, Google Sheets ledger/reducer, idempotency, quota/error recovery, setup dan restore.
3. `verify-finance-mobile`: skenario angka budget, retry, revision, Android notification, bukti persistence dan pelaporan gap.

Skill reusable menjelaskan prosedur dan batasan. Nama aplikasi, endpoint rinci, aturan budget, UID, spreadsheet ID dan keputusan khusus project tetap di PRD/kontrak/config, bukan di-hardcode dalam skill global. Jangan menyimpan service-account JSON di skill.

Sebelum membuat/install: cocokkan dengan skill yang sudah tersedia agar tidak menduplikasi, tentukan target agent (Codex, Claude atau Odysseus), format instalasi dan kemampuan alat aktual. Belum ada permintaan instalasi otomatis dalam paket ini.

## 3. File project, bukan skill

Simpan kelima dokumen di `docs/` project. Jadikan `01_PRD.md` dan `02_API_DAN_DATA.md` sumber bersama. Prompt FE dan BE digunakan bersama kedua sumber tersebut, sehingga agent tidak menciptakan field atau aturan sendiri.

Usulan instruksi ringkas `AGENTS.md` untuk project saat implementasi:

```markdown
# Catat Harian

Read docs/01_PRD.md and docs/02_API_DAN_DATA.md before changing behavior.
Use React Native + Expo for mobile and FastAPI + private Google Sheets for BE.
Inspect existing manifests, lockfiles and checks; preserve user changes.
Implement one complete feature at a time. Keep contracts synchronized.
Store IDR as strict integer. Use Asia/Jakarta business dates and UTC audit time.
Verify Firebase identity and UID authorization on every private endpoint.
Never put server credentials in mobile code, examples, logs or commits.
Do not replace real persistence with mock/local state without saying so.
All writes require stable operation IDs; retries must not duplicate effective state.
Notifications are scheduled locally on Android; verify on a real device.
Use an isolated test Sheet. Never clear/reset existing user Sheets.
Report actual checks and remaining gaps; do not claim unobserved success.
Do not publish/deploy or install global agent skills as part of routine feature work.
```

Teks ini usulan untuk repo aplikasi baru, bukan perubahan pada AGENTS.md sesi sekarang. Jika ada instruksi project lain, rekonsiliasi dulu dan jangan menimpa aturan pengguna.

## 4. Urutan penggunaan prompt

1. Tinjau asumsi PRD: pemakaian pribadi, APK, login Google, budget default/override, reminder waktu lokal dan pembukuan WIB.
2. Letakkan PRD dan kontrak dalam repo, mulai BE lewat `04_PROMPT_BE.md` hingga auth dan satu transaksi benar-benar tersimpan.
3. Jalankan `03_PROMPT_FE.md` untuk FE. Jika terpisah sesi, keduanya tetap membaca versi kontrak yang sama. FE boleh menyiapkan UI/mock eksplisit selama BE disiapkan.
4. Sambungkan satu alur utuh sebelum menambah modul lain. Perubahan kontrak harus diperbarui di kedua sisi.
5. Selesaikan budget dan riwayat, kemudian reminder di HP fisik. Review kriteria penerimaan PRD.
6. Build APK dan siapkan BE yang dapat dijangkau; tentukan hosting/biaya tersendiri sebelum deployment.

Pekerjaan tidak harus memakai beberapa agent paralel. Dua sesi FE/BE bisa digunakan berurutan untuk menjaga konteks, dengan satu pemilik kontrak. Jangan menjalankan dua writer pada file yang sama tanpa koordinasi.

## 5. Hal yang belum diputuskan

- Nama/ikon aplikasi final.
- Target minimum versi Android setelah SDK ditentukan.
- Akun Google, Firebase project, spreadsheet, UID allowlist, dan kredensial yang akan dipakai.
- Backend dijalankan di laptop atau hosting, domain/HTTPS, dan budget operasional.
- Distribusi APK pribadi atau rencana Play Store di fase berikutnya.

Hal tersebut tidak menghalangi penyusunan PRD/prompt, tetapi harus tersedia sebelum login, penyimpanan nyata, dan build distribusi dapat diverifikasi.
