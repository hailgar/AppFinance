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
