# Pemeriksaan aktual

16 November 2026 (WIB), branch feat/complete-mvp-integration. Node24.22.1/npm11.9.0,
Python3.12.14 virtual environment terpisah memakai requirements.lock.

| Perintah / pemeriksaan | Hasil aktual |
|---|---|
| mobile: npm run typecheck | Lulus exit0 |
| mobile: npm run lint | Lulus exit0 |
| mobile: npm test | 68 passed, 7 HTTP skipped (mode unit) |
| backend: python -m pytest tests -q | 57 passed, 1 Google-live skipped, 1 deprecation warning |
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
