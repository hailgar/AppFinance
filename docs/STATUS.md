# Catat Harian — status implementasi

16 November 2026 (WIB). Koordinator: Integrasi & Pengujian.
Branch: `feat/complete-mvp-integration`. Baseline main: `be3a811`.
Draft PR: [#2](https://github.com/hailgar/AppFinance/pull/2). Tip kode dan dokumentasi awal: `8d6bd56`.
MVP kode terintegrasi dan pemeriksaan otomatis lokal lulus; penerimaan layanan Google
serta Android nyata masih terhambat konfigurasi/akses. Bukan klaim deployment/APK selesai.

| Tugas | Penanggung jawab | Dependensi | Status / bukti |
|---|---|---|---|
| Inspeksi source, aturan AGENTS, integrasi akhir, Git/PR | Koordinator | main aktual | Source repository dibandingkan; tree baseline cocok, perubahan pengguna dipertahankan |
| Budget default/override, detail/edit/hapus, filter, kategori bulanan | FE agent + audit FE | Kontrak API | Implementasi nyata ke API; revision/UNKNOWN/auth dipertahankan |
| Ledger, auth, idempotency/revision, laporan Sheets otomatis | BE agent | Google Sheets/Firebase runtime | 57 tes BE lulus;1 tes Google nyata dilewati |
| Izin, dua jadwal lokal, rekonsiliasi, offline preference, konflik, logout | Reminder agent + agent penerus | expo-notifications55.0.27 |17 tes logika reminder lulus; pengiriman native belum diuji |
| Sesi UID-bound, konfigurasi URL, onboarding opsional | Koordinator | Firebase native | Typecheck/lint dan tes sesi lulus; izin tidak diminta otomatis |
| Review kontrak/lifecycle/secret/build | Review agent + audit akhir | Semua perubahan | Temuan timeout/token/logout/import diperbaiki; syntax build/deploy lulus |
| Login → Sheets → reload/login ulang nyata | Koordinator | Firebase project/UID, credential, Sheet test | Belum dijalankan, konfigurasi tidak tersedia |
| Deploy HTTPS internal | Koordinator/BE | Host yang sudah tersedia, domain, secrets, persistent volume | Dockerfile+Compose+Caddy disiapkan; Docker/provider akses belum tersedia; tidak ada URL deployment |
| APK development dan preview | Koordinator | Firebase config, OAuth, signing, toolchain | Workflow manual + validator disiapkan; preflight aktual blocked; tidak ada APK |
| Emulator | Koordinator | Android SDK/emulator | Tidak tersedia; belum diuji |
| HP fisik | Koordinator | Perangkat pengujian terhubung | Tidak terhubung; belum diuji |

## Bukti pemeriksaan

- FE: typecheck/lint exit0;57 tes lulus,7 tes HTTP dilewati dalam mode unit.
- BE:57 passed/1 skipped pada dependency terkunci; satu warning Starlette/httpx.
- Integrasi HTTP:7 passed dengan API FastAPI aktual dan auth/storage khusus tes.
- Validator Android:8 passed; bukan kompilasi atau pengujian APK.
- Ekspor Android Hermes dan pemeriksaan kompatibilitas SDK offline: exit0.
- Syntax Python/YAML/Bash, git diff --check dan pemeriksaan pola secret: lulus.
- CI GitHub pada tip `8d6bd56`: ketiga workflow push dan ketiga workflow pull_request selesai success. Workflow APK manual belum dijalankan; ia membutuhkan secrets aktual dan file dispatch pada default branch.

## Keputusan dan konflik yang diselesaikan

Keputusan pengguna terbaru: BE harus tersedia melalui hosting; Sheet adalah database
sekaligus laporan terkini. PRD/API v0.2 menggantikan manual-only View dengan pembaruan
otomatis dari ledger tervalidasi, retry default30detik, Metadata dan storage/status.
API keuangan tetap bergantung ledger; View gagal tidak membatalkan receipt APPLIED.
Tidak ada provider/layanan berbayar baru yang dipilih atau dibuat.

Kepemilikan file dipisahkan lewat AGENTS. Koordinator menyatukan import provider,
UID-bound token, route, dependency, onboarding, status laporan dan logout dua tahap.
Tidak ada konflik pengguna yang ditimpa. Tidak ada force-push atau perubahan main langsung.

## Kebutuhan minimum pengguna agar penerimaan dapat dilanjutkan

1. Host/provider internal yang sudah tersedia dan akses deployment, domain HTTPS,
   serta penyimpanan persisten checkpoint. Jika membutuhkan resource berbayar baru,
   pengguna memilih layanan dan batas biayanya dahulu.
2. Firebase project, satu UID allowlist, identitas/kredensial BE lewat secret mekanisme
   yang aman, dan Sheet test terpisah privat yang dibagikan ke identitas BE.
3. Konfigurasi Android Firebase + Web OAuth client ID dan signing keystore stabil
   beserta SHA-1/SHA-256 terdaftar. Isi repository variables/secrets sesuai
   FRONTEND_SETUP.md; jangan mengirim private key/token/password melalui chat.
4. HP pengujian terhubung (opsional untuk kompilasi, wajib untuk bukti reminder fisik).

## Langkah berikutnya

### Persiapan biaya minimum (16 November 2026 WIB)

- Dua spreadsheet Google Sheets native (database pribadi dan pengujian) dibuat di
  Drive pengguna. Lima header backend diverifikasi via API, keduanya tanpa data
  transaksi, zona waktu Asia/Jakarta, dan warning proteksi pada LedgerEvents.
  Tautan/ID tidak dimasukkan ke repository publik. Belum ada identitas BE yang diberi
  akses dan belum ada pembacaan/penulisan aplikasi ke Sheet nyata.
- Firebase Spark dipilih untuk login Google gratis. Pengguna melewati pemasangan
  plugin. Konsol web yang diperiksa meminta login Google; project, UID, OAuth dan
  credential backend belum dibuat atau dihubungkan.
- Kandidat hosting: Azure App Service Linux F1 ($0 dalam batas paket), dengan
  checkpoint di /home/catat-data. Template, startup dan ZIP packager ada di
  deploy/azure. F1 memiliki kuota CPU dan tanpa SLA. Tidak ada akun/resource Azure
  yang dibuat, biaya yang disetujui, atau deployment yang dieksekusi.
- Render Free tidak dipakai untuk konfigurasi sekarang karena filesystem ephemeral
  tidak mempertahankan anchor checkpoint. Tidak mengendurkan pemeriksaan integritas.
- APK mandiri ditargetkan lewat profil preview GitHub Actions runner standar pada
  repository publik. Preflight sesi ini benar-benar dijalankan dan gagal pada URL
  API HTTPS yang belum tersedia. SDK Android/javac, Firebase config dan signing
  juga belum tersedia. Belum ada APK atau uji perangkat.
- Tes setup Azure: 6 unittest lulus (private credential file, safe errors, project
  mismatch, durable path, ZIP allowlist, free-only template). Paket ZIP dibuat dan
  syntax Python diperiksa; validasi ARM oleh Azure dan deploy nyata belum dilakukan.

Branch berisi commit per scope sudah dipush dan draft PR #2 dibuat; tiga CI lulus. Setelah konfigurasi aman tersedia dan workflow build masuk default branch melalui review/merge PR,
bootstrap Sheet test, deploy satu worker, uji alur Google nyata, build development lalu
preview APK, instal dan catat pengujian emulator/HP secara terpisah.

## Commit terkait

| Scope | Commit |
|---|---|
| backend | `82192da` |
| mobile | `af4def1` |
| reminders | `9e2629e` |
| delivery | `49ab343` |

Commit dokumentasi `8d6bd56` menyimpan baseline status. Pembaruan dokumentasi berikutnya merekam PR dan hasil CI tersebut; tidak mengubah kode aplikasi.

## CI pull request yang sudah diamati

- [Frontend checks](https://github.com/hailgar/AppFinance/actions/runs/43773843337): success
- [Backend checks](https://github.com/hailgar/AppFinance/actions/runs/43773843382): success
- [FE-BE HTTP integration](https://github.com/hailgar/AppFinance/actions/runs/43773843341): success
