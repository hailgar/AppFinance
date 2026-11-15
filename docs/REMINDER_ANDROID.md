# Reminder Android — implementasi dan handoff

16 November 2026 (WIB). Scope percakapan 04 — Reminder Android.

## Perilaku

- Pengaturan menyediakan cek budget pagi (saran 08:00) dan catat transaksi malam
  (saran 20:00). Keduanya nonaktif sampai dipilih pengguna. Jam diubah melalui
  pemilih waktu Android 24 jam, mengikuti jam lokal perangkat; pembukuan tetap WIB.
- Expo Notifications memakai trigger DAILY dan kanal `Pengingat harian`.
  Tidak memerlukan push token, remote push, scheduler backend atau fetch ketika
  notifikasi berbunyi. Teks generik, tanpa nominal keuangan; tetap dikirim
  walaupun sudah ada transaksi.
- Izin diminta setelah pengguna mengaktifkan pengingat atau memilih Izinkan.
  Setelah penolakan, gunakan tautan pengaturan Android; resume tidak meminta ulang.
  Kanal yang diblokir dibedakan dari izin tingkat aplikasi.
- UI membedakan preferensi aktif, izin OS, dan jadwal yang benar-benar terdaftar.
  Daftar jadwal dibaca kembali setelah scheduling. Terdaftar tidak menjamin
  notifikasi sudah diterima, bersuara, atau tepat menit.
- Tes notifikasi dijadwalkan 5 detik setelah tombol dipilih. Tes lama yang masih
  tertunda dibatalkan agar tidak menumpuk. Memilih notifikasi pagi membuka Hari Ini,
  malam membuka form transaksi, hanya untuk akun yang sama.

## Penyimpanan dan sinkronisasi

`src/reminders/controller.ts` mengatur lifecycle dengan adapter terpisah di
`native.ts`; `SettingsCard.tsx` menampilkan pengaturan. Model memvalidasi waktu dan
preferensi. Tidak ada perubahan kontrak FastAPI atau Google Sheets.

Preferensi, ID jadwal dan command pencadangan yang belum pasti disimpan dalam
SecureStore terpisah per Firebase UID, berbeda dari vault transaksi. Pembaruan
lokal harus tersimpan sebelum mengubah jadwal OS. Pengaturan dapat diubah offline;
UI menulis “Tersimpan di perangkat; belum dicadangkan”.

GET/PUT `/preferences` dan GET `/operations/{key}` memakai autentikasi yang sudah
ada. PUT menyertakan `expected_revision` serta Idempotency-Key yang dipertahankan.
Sebelum write, preferensi server dibaca. Revisi berbeda menampilkan pilihan
pengaturan perangkat atau server; tidak ada overwrite diam-diam.

Respons 202/timeout menyimpan command asli. Startup/resume/perubahan koneksi
memeriksa receipt, tanpa otomatis mengirim ulang command UNKNOWN. Tombol
“Periksa jadwal dan pencadangan” boleh mengirim ulang key/body yang sama setelah
receipt tetap UNKNOWN. Pengguna tetap bisa mematikan atau mengubah reminder saat
pencadangan belum pasti. Receipt lama memperbarui baseline revision, tanpa
menghapus perubahan lokal yang lebih baru; perubahan itu dicadangkan pada
pemeriksaan berikutnya. Preferensi dan status izin/ID perangkat tidak dicampur.

Saat startup/login/resume/koneksi pulih, scheduler mencocokkan jadwal aktual,
jenis, jam, zona waktu dan akun. Jadwal salah/ganda/akun lama dibatalkan, jadwal
hilang dibuat ulang. Pekerjaan diserialkan lintas sesi untuk menghindari race.
Logout menghentikan pekerjaan, membatalkan reminder harian/tes, dan membersihkan
notifikasi yang masih ditampilkan milik akun. Preferensi lokal tetap tersedia
saat login berikutnya. Jalur logout pada layar pemulihan transaksi juga memakai
pembersihan yang sama. Bila pembatalan native gagal, logout tidak dilaporkan sukses.

## Build dan pengaturan perangkat

Paket mengikuti bundledNativeModules SDK 55:

- `expo-notifications ~55.0.27`
- `@react-native-community/datetimepicker 8.6.0`

Keduanya terdaftar dalam config plugin. Build native baru diperlukan setelah
penambahan modul; development client lama tidak cukup. Manifest dari modul
Notifications menyertakan POST_NOTIFICATIONS dan RECEIVE_BOOT_COMPLETED.
Konfigurasi aplikasi memblokir SCHEDULE_EXACT_ALARM dan USE_EXACT_ALARM.
Pada Android modern tanpa akses exact alarm, implementasi native SDK memakai
fallback inexact; kode tidak meminta akses alarm tepat waktu.

Tombol pengaturan notifikasi membuka pengaturan aplikasi; tombol baterai membuka
menu optimisasi baterai, dengan fallback detail aplikasi. Ini tidak mengubah
kebijakan baterai secara otomatis. Pengguna memilih sendiri pengaturan yang cocok.
Tidak ada jaminan tepat menit, pengiriman saat HP mati, setelah force-stop, atau
pada semua kebijakan baterai vendor. Jadwal diperiksa ulang ketika aplikasi dibuka.
Reboot dan perubahan zona waktu ketika aplikasi tertutup tetap perlu diuji di HP.

Ikuti `FRONTEND_SETUP.md` untuk Firebase/config Android, backend HTTPS dan build.
Tidak ada konfigurasi cloud/kredensial/signing yang dibuat oleh perubahan ini.

## Pemeriksaan aktual

| Pemeriksaan | Hasil |
|---|---|
| Controller lifecycle/backup | 21 tes lulus |
| Adapter Expo dan respons tap | 5 tes lulus dengan mock native, bukan HP |
| Seluruh unit FE | 52 tes lulus; 7 tes HTTP dilewati pada mode biasa |
| Kontrak HTTP klien FE → FastAPI | 7 tes lulus pada fixture terisolasi |
| TypeScript, ESLint | Lulus |
| Kompatibilitas SDK | `EXPO_OFFLINE=1 npm run check:expo` lulus memakai metadata SDK lokal |
| Ekspor Android | Lulus, dengan peringatan google-services.json belum tersedia |
| APK, notifikasi nyata, reboot, battery vendor | Belum diuji; perlu konfigurasi Firebase dan Android fisik |

Dua tes HTTP baru memeriksa receipt PUT preferensi setelah respons hilang/restart
controller serta konflik antara pengaturan offline dan revision server yang baru.
Fixture memakai auth/storage tes, tidak menyentuh Firebase/Sheet nyata.

Ulangi pemeriksaan dari root repository:

```bash
cd mobile
npm ci
npm run typecheck
npm run lint
npm test
EXPO_OFFLINE=1 npm run check:expo
EXPO_OFFLINE=1 npm run export:android
```

Runner HTTP dari root, dengan environment backend yang terpasang:

```bash
backend/.venv/bin/python scripts/test_backend_contract.py backend
```

Pada Windows, jalankan `python scripts/test_backend_contract.py backend` dari
terminal yang sudah mengaktifkan virtual environment backend.

## Penerimaan di Android fisik — belum dieksekusi

Catat merek/model, Android API, build development/release, zona waktu, jam dijadwalkan,
jam diterima dan pengaturan baterai setiap pengujian. Isi hasil aktual, bukan asumsi.

| Skenario | Hasil yang diharapkan | Hasil aktual |
|---|---|---|
| Instalasi baru | Kedua toggle nonaktif; belum meminta izin | Belum diuji |
| Aktifkan dan izinkan | Prompt relevan; satu jadwal per jenis; tes notifikasi diterima | Belum diuji |
| Tolak / blokir kanal | Status jelas; form keuangan tetap dapat digunakan; resume tidak meminta ulang | Belum diuji |
| Background + layar terkunci | Notifikasi generik muncul sesuai batas OS | Belum diuji |
| Offline | Jadwal lokal tetap tersedia; preferensi bertanda belum dicadangkan | Belum diuji |
| Ubah jam berulang / disable | Jadwal lama dibatalkan, tidak ada notifikasi ganda | Belum diuji |
| Restart HP, app belum dibuka | Catat perilaku restore SDK/OS yang benar-benar teramati | Belum diuji |
| Restart lalu buka app | Jadwal hilang dipulihkan melalui rekonsiliasi | Belum diuji |
| Ubah zona waktu | Jam reminder mengikuti perangkat; data pembukuan tetap WIB | Belum diuji |
| Force-stop / baterai ketat / DND | Catat batasan; pemulihan dicek setelah app dibuka | Belum diuji |
| Tap pagi/malam, cold start | Hari Ini / Catat transaksi, tanpa duplikasi navigasi | Belum diuji |
| Logout biasa / dari pemulihan transaksi | Semua reminder akun dibatalkan, cache dibersihkan | Belum diuji |
| Akun lain / login kembali | Reminder tidak membuka data akun sebelumnya | Belum diuji |
| Teks besar, 360 dp dan TalkBack | Label, toggle, waktu dan tombol dapat digunakan | Belum diuji |

## Referensi

Ditinjau terhadap dokumentasi dan source dependency terpasang pada 16 November 2026:

- https://docs.expo.dev/versions/v55.0.0/sdk/notifications/
- https://developer.android.com/develop/ui/compose/notifications/notification-permission
- Source lokal dependency: `expo-notifications/android/src/main/AndroidManifest.xml`
  dan `ExpoSchedulingDelegate.kt` (pemilihan exact/inexact).
