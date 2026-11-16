# Pemeriksaan aktual

16 November 2026 (WIB), branch feat/complete-mvp-integration. Node24.22.1/npm11.9.0,
Python3.12.14 virtual environment terpisah memakai requirements.lock.

| Perintah / pemeriksaan | Hasil aktual |
|---|---|
| mobile: npm run typecheck | Lulus exit0 |
| mobile: npm run lint | Lulus exit0 |
| mobile: npm test | 68 passed, 7 HTTP skipped (mode unit) |
| backend: python -m pytest tests -q | 58 passed, 1 Google-live skipped, 1 deprecation warning |
| python scripts/test_backend_contract.py backend | 7 passed melalui HTTP nyata, storage/auth test adapters |
| python -m pytest scripts/tests -q | 27 passed, 7 subtests passed; Android19 + Azure8, bukan build/deploy |
| EXPO_OFFLINE=1 npm run check:expo | Dependencies up to date, exit0; offline validation warning |
| EXPO_OFFLINE=1 npm run export:android | Bundle Hermes exit0, warning config Firebase belum ada; bukan APK |
| git diff --check | Lulus |
| Python AST, workflow/Compose YAML, bash -n | Lulus syntax; Docker/Gradle belum dijalankan |
| python scripts/android_config.py | Exit1 yang diharapkan: API base HTTPS/config aktual belum tersedia |

Tes FE mencakup17 skenario controller reminder,8 adapter native dengan mock,
dan3 tes urutan logout/orphan cleanup/login ulang; mencakup juga
nominal/WIB, editor/revision, operasi UNKNOWN,401/403, deadline token/body, dan
UID sesi berubah saat refresh. Test fixture dan source Expo bukan bukti pengiriman
notifikasi di Android.

Belum diuji: Firebase login nyata, Google Sheets nyata, Docker/TLS deployment,
Gradle signed APK, emulator, HP fisik, TalkBack/layar sempit/teks besar, serta
reminder setelah reboot/force-stop/penghemat baterai. Kriteria ini tetap terbuka.

Status CI/commit/PR serta dependensi pengguna tercatat pada STATUS.md.

Pemeriksaan lanjutan konfigurasi: validator menolak port URL/SHA-1 tidak sah; health HTTPS
backend diperiksa sebelum build; signing menggunakan androidComponents.finalizeDsl.
Paket Azure menolak overwrite/symlink sumber, path checkpoint bukan file, serta nama
plan yang melampaui batas. Unit loader Python tanpa pytest sempat gagal; seluruh
27 tes kemudian dijalankan ulang dengan pytest pada virtual environment backend dan lulus.


Penilaian Vercel16November2026: enam tes checkpoint/integritas dan proyeksi dijalankan
ulang dan lulus. Simulasi instance dengan direktori terpisah memperlihatkan anchor
lokal tidak ikut terbawa dan lease file lokal tidak mengoordinasi instance lain.
Ini pemeriksaan asumsi runtime dengan fixture, bukan tes deployment Vercel. Hasil dan
syarat migrasi dicatat di BACKEND_SETUP.md; belum ada konfigurasi runtime produksi
Vercel atau resource baru yang diterapkan.

## Pratinjau visual dan kesiapan Vercel

Plugin Vercel sudah terhubung dan akun/team dapat dibaca. Akun dol-men melaporkan
Hobby active; team DOL (dol3). Filter repository AppFinance dan nama catat tidak
menemukan project yang sesuai. Create-project static catat-harian-ui-preview
ditolak403 forbidden (tidak memiliki izin membuat project). Tidak ada URL deployment.
CLI Vercel terautentikasi tidak tersedia. Tidak ada bypass izin atau resource berbayar.

Pemeriksaan yang benar-benar dijalankan untuk mobile/preview:

- npm ci exit0, npm run build:standalone exit0;432 modules, HTML inline491364bytes.
- mobile typecheck/lint exit0; npm test68 passed/7 HTTP skipped pada mode unit.
- Chrome memuat tujuh layar asli melalui React Native Web dengan fixture adapters.
  Transaksi Rp12.000 mengubah pengeluaran Rp35.000→Rp47.000 dan sisa Rp65.000→Rp53.000;
  pemasukan tetap Rp200.000. Feedback menyatakan perubahan hanya pada data contoh.
- Form tanpa kategori menonaktifkan Simpan. Nominal1.5 ditolak dengan pesan rupiah
  bulat. Override budget Rp0 tampil benar pada layar budget.
- Filter pemasukan menampilkan hanya satu contoh pemasukan. Ringkasan setelah mutasi:
  pengeluaran Rp112.000, pemasukan Rp200.000, selisih Rp88.000.
- Detail transaksi, pengaturan dan tombol tes reminder diperiksa. Tombol tes melaporkan
  Android tidak dijadwalkan, tidak menunjukkan sukses notifikasi OS.
- Lebar360/390/430 pada frame browser: scrollWidth sama clientWidth. Screenshot
  beranda/ringkasan diperiksa; ini bukan bukti emulator, HP atau aksesibilitas native.
- Reload mengembalikan sisa Rp65.000 dan menghapus perubahan contoh. Reset kembali ke
  beranda. HTML standalone dilayani melalui preview lokal yang sama dan dimuat dengan
  benar; validasi desimal serta reset juga dicoba pada file standalone tersebut.
  Pembukaan file melalui file:// oleh pengguna belum diuji dalam browser sesi ini.
- Log console yang tersedia tidak memuat error aplikasi; error extension browser
  dikecualikan. Tidak menganggap hasil ini sebagai pemeriksaan jaringan menyeluruh.
- Android preflight dengan --check-backend exit1: API URL HTTPS /api/v1 belum tersedia.

Preview memakai fixtures untuk sesi, command, storage, laporan dan reminder. Belum
ada login Google, penulisan Sheets nyata, pengiriman native atau APK dalam fase ini.
CI frontend kini membangun preview standalone setelah pemeriksaan aplikasi utama.

## Penguatan native dan startup produksi

- Fresh mobile npm ci berhasil. Ketidakcocokan expo-font58.0.12 pada SDK55 ditemukan
  lewat Android autolinking; manifest kini ~55.0.8 dan resolve hanya satu versi55.0.8.
- check:native resolve/search Android exit0;4 tes guard native passed, mencakup peer58,
  duplikasi versi sama dan output tidak lengkap. Guard menjadi langkah CI dan build APK.
- Typecheck/lint exit0;68 FE passed/7 HTTP skipped. Expo offline compatibility exit0;
  config --type prebuild exit0 (bukan native generation lengkap); Hermes1395modul exit0
  dengan warning google-services.json tidak tersedia.
-58 BE passed/1 Google-live skipped; pip check exit0. Regresi factory membuktikan
  receipt setelah restart, lease menolak writer kedua, truncation fail-closed, lease
  dilepas setelah startup gagal. Adapter upstream terkontrol, bukan Google nyata.
- Live test diperbaiki memakai create_app(config) produksi, tidak lagi menyuntikkan
  repository/verifier sehingga checkpoint dan lease dilewati. Tetap belum dieksekusi
  dengan Google. Sheet target harus baru/kosong dan berbeda dari source konfigurasi.
- HTTP7 passed dijalankan ulang; scripts/tests27 passed/7 subtests; build standalone
  exit0 dan bytes tetap sama dengan preview yang sebelumnya ditinjau di browser.
- Runtime Android preflight exit1 (API URL belum diisi). Firebase download timeout15s;
  IAM Site Unavailable; Vercel browser login wall. Tidak ada Gradle/deploy/HP proof.

Verifikasi eksternal lanjutan: login Vercel melalui form aman berhasil, browser menampilkan
hailgar / hailgars-projects / Hobby. Unggah satu index.html491364bytes melalui Drop to
Deploy dan submit project catat-harian-ui-preview dilakukan. Vercel meminta verifikasi
email; kode via form aman ditolak invalid or expired. Tidak ada status READY/URL yang
terverifikasi; proses publikasi belum selesai. Tidak ada resend otomatis atau kode yang
disimpan. Akun ini berbeda dari koneksi API DOL; error403 koneksi lama tetap berlaku.
CI cfecc92: frontend43818053902, backend43818053909, HTTP43818053873 semuanya success.

## Emulator API35 di runner publik

Implementasi75ff0f2 benar-benar dijalankan di GitHub Actions. Android emulator environment
run43821500154/job133145378757 success; KVM dan boot action success. Log helper menyatakan
emulator_booted=true, api_level=35, abi=x86_64, google_play_services=true, passed=true,
app_tested=false. Run push43821490514 juga success. Tidak ada app/APK terpasang pada
preflight ini. Uji HP fisik tetap belum dilakukan. Tidak ada VM/larger runner berbayar.

8 tes helper smoke baru passed/3 subtests; scripts/tests35 passed/10 subtests. Helper
menolak target fisik, versi/image salah, APK tanpa bundle, launcher salah, UI login tidak
muncul dan proses yang keluar. Skenario helper lokal memakai controlled adapters, bukan
APK. Job emulator-smoke untuk APK standalone sudah disambungkan setelah job build preview,
namun belum dieksekusi karena konfigurasi nyata/APK belum tersedia. Tidak menyimpan data
login, screenshot/rekaman finansial atau logcat sebagai artifact.

CI75ff0f2: FE43821500170, BE43821500111, HTTP43821500339 semuanya success. Verifikasi kode
Vercel baru kembali ditolak invalid or expired. Tidak ada URL backend/static READY, APK,
Google live acceptance atau instalasi HP yang dinyatakan berhasil pada fase ini.
