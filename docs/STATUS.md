# Catat Harian — status implementasi

16 November 2026 (WIB). Koordinator: Integrasi & Pengujian.
Branch `feat/complete-mvp-integration`; baseline main `be3a811`.
Draft PR [#2](https://github.com/hailgar/AppFinance/pull/2). Baseline fase ini `010bd68`.
Kode MVP terintegrasi; penerimaan Google dan Android nyata belum selesai.
Belum ada URL backend yang berhasil di-deploy atau APK yang berhasil dibangun.

## Koordinasi dan hasil

| Tugas | Penanggung jawab | Dependensi | Hasil / langkah berikutnya |
|---|---|---|---|
| UI keuangan, API, recovery, sesi | FE agent + koordinator | Firebase native/API HTTPS | Budget default/override, tambah/edit/hapus, riwayat/filter, ringkasan dan error/revision/UNKNOWN diimplementasikan; uji perangkat menunggu build |
| Ledger, auth, aturan keuangan, laporan Sheets | BE agent | Credential Google, Sheet test, UID allowlist | 57 tes BE lulus; 1 Google-live skip. Views otomatis dan retry30detik; kegagalan View tidak membatalkan receipt |
| Reminder dan logout | Reminder agent + integration_reconcile + koordinator | Native Android | 17 tes controller,8 adapter native,3 serialisasi sesi; cleanup marker/UID, notifikasi tampil dan last response; uji fisik belum berjalan |
| Build Android | android_finish | Backend HTTPS, Firebase config/OAuth, signing stabil | 19 tes validator lulus; health backend diperiksa sebelum kompilasi; hook signing finalizeDsl; preflight aktual masih blocked |
| Paket hosting gratis | deploy_finish | Akun/subscription Azure aktif, Google secrets | 8 tes Azure lulus; F1-only, checkpoint file persisten, ZIP aman, batas nama plan diperbaiki; ARM/deploy nyata belum berjalan |
| Review PR alternatif | integration_reconcile | PR #1 / PR #2 | PR #1 arsitektur alternatif; hanya cleanup native dan tes relevan diport ke PR #2, tidak digabung seluruhnya |
| Pratinjau visual browser | Koordinator (source awal ui_preview) | Dependency preview terisolasi | Tujuh layar asli, data contoh di memori; build standalone dan browser QA berhasil; tidak membuktikan Google/native |
| Integrasi akhir, Google/provider, Git/PR/status | Koordinator | Akses eksternal | Firebase diperiksa langsung; hasil dan hambatan di bawah; push/CI fase ini dicatat pada PR |

Kepemilikan fase ini: android_finish hanya workflow/signing/validator Android;
deploy_finish hanya deploy/azure dan tes Azure; integration_reconcile hanya
reminders/native.ts dan reminder-native.test.ts. Koordinator menangani session,
provider, helper serialisasi sesi, dokumen dan Git. Tidak ada perubahan pengguna
atau arsitektur PR lain yang ditimpa. Tidak ada force-push atau perubahan main langsung.

## Bukti pemeriksaan

- FE: typecheck dan lint exit0; 68 tes unit passed,7 HTTP skipped pada mode unit (HTTP dijalankan terpisah).
- BE:57 passed/1 Google-live skipped, satu warning deprecation Starlette/httpx.
- Integrasi HTTP:7 passed dengan klien FE/FastAPI aktual, auth/storage khusus tes.
- Konfigurasi:27 passed +7 subtests (19 Android,8 Azure), bukan kompilasi/deploy.
- Expo compatibility offline dan ekspor bundle Android Hermes: exit0;
  warning google-services.json belum tersedia. Bundle bukan APK.
- Syntax Python/YAML/Bash agent: lulus; git diff --check lulus.
- CI baseline `010bd68`: Frontend checks, Backend checks dan FE-BE HTTP integration
  success. CI fase kode/dokumen `3960f29` juga success: Frontend43789331739,
  Backend43789331800, HTTP43789331713. APK manual belum dijalankan.

## Kondisi Google, hosting dan perangkat yang diamati

- Dua Google Sheets native terpisah sudah dibuat: database pribadi dan pengujian;
  lima tab backend, header-only saat diperiksa, timezone Asia/Jakarta. ID/tautan privat
  tidak disalin ke repository publik. Belum ada akses identitas backend yang terbukti.
  Jangan menulis data contoh ke database pribadi.
- Firebase project `catat-harian-4660f` benar-benar ada pada Spark ($0/bulan).
  Aplikasi Android `id.catatharian.app` terdaftar; Google Sign-In **Enabled**.
  Tabel Users belum berisi pengguna dan tabel SHA certificates masih kosong.
  Ini menggantikan catatan lama yang menyatakan project/provider belum tersedia.
- Firebase CLI15.36.0 terpasang via npx; login:list melaporkan tidak ada akun CLI
  terotorisasi. Sesi konsol browser sudah login, tetapi tidak memberi kredensial CLI.
  Unduh konfigurasi dari dua kontrol resmi konsol tidak menghasilkan completed
  download; tidak ada google-services.json yang dianggap berhasil diperoleh.
- Firebase menunjukkan service account Admin SDK bawaan. Private key baru tidak
  dibuat; identitas backend khusus dengan izin minimum belum dikonfigurasi.
  Google Cloud IAM menampilkan Site Unavailable pada browser sesi ini.
- Azure Portal meminta login Microsoft; metode GitHub dipilih melalui formulir aman.
  Pengguna mengizinkan consent Microsoft-Corporation. Halaman sudah melewati
  otorisasi GitHub; kode email Microsoft diterima melalui formulir aman. Pengguna
  juga mengizinkan Next pada pembaruan ketentuan. Halaman berikutnya menolak kode,
  kemudian menampilkan Your session has timed out. Portal baru diperiksa sekali
  dan kembali meminta login; tidak ada sesi Azure terautentikasi yang terverifikasi.
  Percobaan pada flow lama dihentikan. Persetujuan ketentuan tidak diasumsikan
  berhasil hanya dari izin pengguna. Tidak ada kode/token login dicatat di source.
  Belum ada subscription, region F1,
  ARM what-if, resource atau deployment yang terverifikasi. Template F1 disiapkan
  sebagai hosting pengujian gratis; tanpa SLA/Always On dan memiliki kuota.
  Tidak ada akun baru, trial kredit, upgrade Spark atau resource berbayar dibuat.
- Lokal: java/keytool ada; javac/SDK/adb/emulator/Gradle/az/Docker/gcloud tidak ada.
  Google runtime credentials, Expo token dan Azure deployment credentials tidak ada.
- Emulator: tidak tersedia, belum diuji. HP fisik: tidak terhubung, belum diuji.
  Reminder background/lock-screen/offline/reboot/force-stop/baterai tetap terbuka.

## Penilaian Vercel

Pengguna meminta pemeriksaan Vercel pada 16 November 2026 WIB. FastAPI didukung
provider, tetapi backend saat ini belum dapat langsung dinyatakan aman pada Functions:
checkpoint file, lease lokal/satu writer, serta retry lifespan30detik masih bergantung
pada model host persisten. Blob privat + conditional writes hanya kandidat bagian
solusi, bukan implementasi koordinasi writer yang sudah diuji. Entrypoint factory dan
mekanisme credential runtime juga perlu disesuaikan. Detail di BACKEND_SETUP.md.

Enam tes integritas/proyeksi lulus; simulasi filesystem instance terpisah menunjukkan
anchor/kunci lokal tidak dibagi. Pemeriksaan ini menggunakan fixtures, bukan cloud.
Pembaruan koneksi: plugin Vercel sudah terhubung. Akun `dol-men` dapat dibaca,
plan akun Hobby active, team DOL (`dol3`). Query project dengan repository AppFinance
serta pencarian nama catat tidak menemukan project yang sesuai. Detail team billing
atau kuota penggunaan tidak terverifikasi dari respons yang tersedia.

Pembuatan project static `catat-harian-ui-preview` pada team DOL ditolak API dengan
403 forbidden: "You don't have permission to create the project." Tidak ada project
atau deployment yang berhasil dibuat. CLI Vercel tidak tersedia sebagai fallback
terautentikasi. Tidak mengulang request yang sama, mengganti team, menaikkan plan,
atau memakai create-deployment untuk melewati penolakan izin.

Pratinjau UI mandiri dibuat di `mobile/preview`, memakai tujuh layar/komponen produksi
melalui alias khusus browser. Login, command/storage, laporan dan reminder berupa
fixtures; banner permanen menandainya. Tidak ada data keuangan asli/secret di bundle.
Source awal ui_preview selesai tersedia; agent berhenti karena batas penggunaan,
koordinator menyelesaikan build, browser QA, dokumentasi dan Git. Dependency/build
preview terpisah dari native, CI menambahkan build standalone.

Bukti aktual fase ini:

- `npm ci` pada preview exit0; `npm run build:standalone` exit0 (432 modules).
  Output HTML inline sekitar491KB, tidak membutuhkan file JS/CSS terpisah.
- Root mobile typecheck/lint exit0;68 unit passed/7 HTTP skipped pada mode unit.
- Browser Chrome: tujuh layar dimuat, input/category/form save bekerja pada fixtures;
  tambah Rp12.000 mengubah sisa Rp65.000 menjadi Rp53.000; pemasukan tetap Rp200.000.
  Budget override Rp0, filter pemasukan, ringkasan dan pengaturan diperiksa.
- Tes notifikasi browser menampilkan pesan tidak dijadwalkan, bukan sukses native.
- Lebar phone360/430 diperiksa (scrollWidth sama clientWidth);390 tampak pada capture.
  Tidak berarti responsive/native QA lengkap. Screenshot tersimpan sebagai bukti sesi.
- Reload/reset mengembalikan fixtures; HTML standalone berhasil dimuat dan validasi
  desimal dicoba di Chrome. Detail bukti di VERIFICATION.md.
- Android preflight `python scripts/android_config.py --check-backend` benar-benar
  dijalankan dan exit1: EXPO_PUBLIC_API_BASE_URL wajib HTTPS berakhiran /api/v1.
  Tidak ada APK atau hasil instalasi yang dianggap berhasil.

Tidak ada resource berbayar, deployment backend atau penerimaan Google nyata baru.

Laporan CLI pengguna menunjukkan autentikasi Microsoft lolos tetapi No subscriptions
found; belum ada subscription Azure yang dapat diakses. Mengulang login bukan solusi
provisioning. Aktivasi billing/resource berbayar baru tetap memerlukan keputusan pengguna.

## Langkah berikutnya dan hambatan minimum

1. Untuk URL pratinjau Vercel, sediakan project static pada team DOL dan akses tulis
   koneksi yang sesuai; request create-project saat ini403. Tidak perlu mengulang
   koneksi yang sudah terhubung tanpa mengetahui perubahan izin yang diperlukan.
   Untuk backend, tentukan host satu worker dengan disk persisten atau rancangan
   koordinasi durable yang diuji sebelum memakai Functions. Azure belum memiliki
   subscription; jangan membuat resource berbayar otomatis.
2. Selesaikan akses Google Cloud IAM: identitas backend khusus, Sheets API, izin
   verifikasi revocation Firebase dan Editor hanya pada spreadsheet yang dipakai.
   Credential disimpan lewat mekanisme secret, bukan chat/source publik. Mulai dari
   Sheet test; private database baru dipakai setelah penerimaan test.
3. Ambil konfigurasi Android/Web OAuth aktual, siapkan signing stabil dan daftarkan
   SHA-1/SHA-256; lakukan Google login nyata agar UID owner diketahui/di-allowlist.
4. Deploy satu worker HTTPS dengan checkpoint persisten; buktikan API→Sheet test,
   retry/revision/reload/restart. Konfigurasi variables/secrets build dan daftarkan
   workflow manual pada default branch melalui review/merge, lalu build development
   dan preview APK. APK harus benar-benar dihasilkan sebelum diberikan ke pengguna.
5. Instal/uji jika perangkat tersedia, catat emulator dan HP fisik secara terpisah.

Instruksi teknis: FRONTEND_SETUP.md, BACKEND_SETUP.md dan deploy/azure/README.md.
Tidak ada mock yang dijadikan bukti penerimaan Google/Android nyata.

## Commit terkait

| Scope | Commit |
|---|---|
| Backend/laporan otomatis | `82192da` |
| UI keuangan | `af4def1` |
| Reminder utama | `9e2629e` |
| Delivery awal | `49ab343` |
| Dokumentasi awal | `8d6bd56`, `c7704ac` |
| Persiapan gratis/Sheets | `010bd68` |
| Cleanup native/urutan sesi | `9d5731a` |
| Build/deployment hardening | `c4a3f8f` |

Commit fase penuntasan merujuk baseline di atas; SHA dan hasil CI aktual tersedia
pada riwayat PR #2. Status ini tidak mengklaim deployment/APK/native acceptance selesai.
