# Catat Harian — frontend Android

Iterasi 1 + pemeriksaan integrasi, 16 November 2026. React Native / Expo development build.

Pemeriksaan terbaru: lihat `docs/INTEGRATION.md`. Parser kategori sudah mengikuti
`data.items` dari FastAPI. Klien HTTP FE telah diuji ke FastAPI aktual dengan
fixture autentikasi/penyimpanan terisolasi; ini belum membuktikan Firebase native,
Google Sheets nyata, atau APK. Dokumen PRD, kontrak, dan OpenAPI BE disertakan di `docs/`.

## Status yang sebenarnya

Kode menggunakan API nyata, tanpa adapter mock dan tanpa data keuangan contoh. Koneksi backend, login Google pada perangkat, persistensi Sheets, dan APK **belum diverifikasi**. Firebase project Spark dan aplikasi Android kini terverifikasi di konsol; Google Sign-In Enabled. Belum ada pengguna Firebase, fingerprint signing, backend HTTPS, credential runtime atau Android SDK/perangkat yang bisa dipakai untuk penerimaan. Unduhan konfigurasi Android belum berhasil melalui browser sesi ini.

PRD dan kontrak v0.1 dibaca sebelum implementasi: `01_PRD.md` dan `02_API_DAN_DATA.md` dari proyek. Dokumen sumber tidak diubah. Prompt yang diberikan disertakan dalam `docs/03_PROMPT_FE.md`.

## Hasil iterasi ini

- Empat tab: Hari Ini, Riwayat, Ringkasan, Pengaturan.
- Token desain PRD, font sistem, tombol >=48 dp, safe area, form dengan keyboard avoidance.
- Beranda melalui GET dashboard, budget null/Rp0/kelebihan, pemasukan terpisah, transaksi terbaru, pergantian hari WIB saat aktif/resume.
- Login native Google → Firebase credential → Firebase ID token untuk FastAPI. SDK mengelola sesi. HTTP 401 memicu maksimal satu refresh token; 403 tidak memicu loop login.
- Form tambah transaksi: React Hook Form/Zod, kategori dari API, validasi rupiah integer/tanggal/catatan, tombol nonaktif ketika offline atau menyimpan.
- UUID transaksi dan Idempotency-Key dibuat sebelum submit; command disimpan di SecureStore per UID sebelum pengiriman. Command sama dipakai saat retry. Timeout/202 tidak menghasilkan pesan sukses. UNKNOWN direkonsiliasi melalui endpoint operations, kemudian retry manual memakai key/body sama. Pemulihan setelah restart mendahului pencatatan baru.
- Cache keuangan hanya di memori; satu command unresolved disimpan privat untuk recovery. Tidak ada antrean transaksi offline.
- Riwayat rentang tanggal dan pagination cursor; ringkasan total bulanan; logout dengan peringatan jika operasi belum pasti.

## Status implementasi terbaru

Budget default/override, detail/edit/hapus transaksi, filter jenis/kategori, rincian
kategori bulanan, onboarding opsional dan reminder lokal kini diimplementasikan pada
branch pekerjaan. Editor memakai expected_revision/tombstone dan stable operation ID.
Logika reminder mencakup izin, dua jadwal, rekonsiliasi, preferensi offline/recovery,
konflik server dan pembatalan logout; belum ada bukti pengiriman pada perangkat nyata.

Tersisa untuk penerimaan: konfigurasi Firebase/Sheet/HTTPS/signing, Android SDK atau
runner build yang dikonfigurasi, APK aktual, dan pengujian fisik. Lihat STATUS.md serta
bagian build internal di bawah. Tidak ada mock yang dipakai untuk mengklaim Google nyata.

## Menjalankan di komputer pengembangan

Gunakan Node 22.13+ atau Node 24 LTS, npm, JDK 17, Android Studio + Android SDK, dan perangkat/emulator Android. Tidak ada perubahan konfigurasi coding agent global.

```bash
cd mobile
npm ci
cp .env.example .env
```

Isi `.env` lokal. Jangan masukkan Admin SDK/service-account JSON atau private key ke aplikasi.

| Konfigurasi | Isi |
|---|---|
| EXPO_PUBLIC_API_BASE_URL | URL backend, termasuk `/api/v1`, tanpa trailing slash |
| EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID | OAuth **Web client ID** dari Firebase/Google Cloud, bukan Android client ID |
| ANDROID_APPLICATION_ID | Default `id.catatharian.app`; harus cocok dengan aplikasi Android Firebase |
| GOOGLE_SERVICES_FILE | Path lokal konfigurasi Firebase Android; default `./google-services.json` |

Download `google-services.json` dari Firebase project sendiri, letakkan di `mobile/`, aktifkan Google di Firebase Authentication, dan daftarkan SHA-1/SHA-256 signing certificate development serta release yang benar. File konfigurasi Firebase Android bukan private Admin credential, tetapi tidak disertakan dalam ZIP karena harus berasal dari project kamu. UID pengguna harus masuk allowlist **backend**. File `.env` dan konfigurasi Firebase dikecualikan dari source.

```bash
npm run android
npm start
```

`android` membuat/memasang development build menggunakan Android SDK lokal. Pada terminal lain, `start` menjalankan Metro untuk development client. Setelah native module/config berubah, buat ulang development build. Expo Go bukan target penerimaan aplikasi ini.

Untuk HP fisik, `localhost` menunjuk HP itu sendiri. Gunakan backend HTTPS yang bisa dijangkau HP. Saat memakai backend lokal, pilih IP LAN komputer pada Wi-Fi yang sama dan aturan firewall yang sesuai, atau gunakan USB `adb reverse tcp:8000 tcp:8000`. HTTP lokal hanya dapat dipakai bila build development dikonfigurasi mengizinkan cleartext secara spesifik; konfigurasi bawaan proyek ini tidak melonggarkan transport jaringan Android. Akses di luar development harus HTTPS. Backend lokal berhenti tersedia jika komputer/server mati.

## Pemeriksaan

```bash
npm run typecheck
npm run lint
npm test
npm run check:native
npm run check:expo
npm run export:android
```

Export menghasilkan bundle JavaScript/assets Android, **bukan APK** dan bukan pengujian native login. Status eksekusi aktual dicatat di `docs/VERIFICATION.md`.

## Build APK nanti

`eas.json` menyediakan profil development dan preview (internal APK). Setelah konfigurasi akun Expo/Firebase dan izin build tersedia:

```bash
npx eas-cli build --platform android --profile development
# atau internal release:
npx eas-cli build --platform android --profile preview
```

Perintah EAS belum dijalankan; tidak ada upload/build/deploy/publish dilakukan pada sesi ini. API base URL dan public client ID harus diatur juga di environment build EAS. Konfigurasi Firebase yang tidak ikut Git harus disediakan sebagai file environment EAS dan `GOOGLE_SERVICES_FILE` menunjuk ke file itu. Jangan memasukkan service account backend.

## Kontrak yang sudah dicocokkan dengan BE

Implementasi mengikuti envelope `{data, request_id}`, `/api/v1`, snake_case,
pagination items/next_cursor, dan Operation status. Kategori memakai
`data.items` berisi `{code,label,type}`, sesuai route FastAPI dan `docs/openapi.json`.
Tes integrasi HTTP memakai klien FE aktual terhadap server FastAPI aktual dengan
auth/storage khusus tes. Receipt APPLIED tidak diasumsikan resource terbaru:
sesudah sukses, semua query akun diinvalidasi agar pembacaan server menjadi sumber kebenaran.

Tidak ada retry otomatis mutasi, logging token/catatan, akses langsung Google Sheets, atau penyimpanan cache finansial ke AsyncStorage.

## Peta file

- `mobile/app/`: layout, empat tab, form tambah transaksi.
- `mobile/src/components/`: komponen UI, kartu budget, daftar transaksi.
- `mobile/src/domain.ts`: uang, tanggal WIB, state budget, tipe resource.
- `mobile/src/services/`: API, autentikasi native, command recovery, secure vault.
- `mobile/src/session.tsx`: sesi, cache memori, pemulihan dan logout.
- `mobile/src/__tests__/`: tes aturan domain, 401/403, dan operasi belum pasti.

## Pembaruan MVP dan build internal

Implementasi kini mencakup editor budget default/override, detail/edit/hapus transaksi,
filter riwayat jenis/kategori, rincian kategori bulanan, pengenalan opsional, dan reminder
lokal. Lihat STATUS.md untuk bukti pemeriksaan dan gap native terbaru; catatan iterasi 1
di atas merupakan riwayat awal dan bukan status implementasi terkini.

Workflow manual `.github/workflows/android-internal.yml` menyediakan profil development
(dev client, Metro diperlukan) dan preview (APK mandiri internal). Workflow tidak
berjalan otomatis pada push dan belum dijalankan tanpa konfigurasi aktual berikut.

Repository variables:

- `EXPO_PUBLIC_API_BASE_URL`: HTTPS termasuk `/api/v1`.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`: Web OAuth client ID dari Firebase yang sama.
- `ANDROID_APPLICATION_ID`: opsional; default `id.catatharian.app`, harus cocok Firebase.

Repository secrets, masukkan lewat mekanisme secret GitHub, bukan chat/source publik:

- `GOOGLE_SERVICES_JSON_BASE64`: konfigurasi Android Firebase, bukan service account BE.
- `ANDROID_KEYSTORE_BASE64`: keystore signing internal yang stabil.
- `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

Register SHA-1 dan SHA-256 sertifikat keystore pada aplikasi Android Firebase, aktifkan
Google Sign-In, dan unduh ulang google-services.json. Workflow mengekspor fingerprint
sertifikat tanpa password ke ringkasan build dan memeriksa SHA-1/package/Web client ID
terhadap config serta health HTTPS backend sebelum kompilasi. Keystore yang sama dipakai untuk debug maupun preview
agar identitas signing stabil. Jangan memakai private Admin credential untuk build mobile.

Validator lokal (membaca process environment, tidak otomatis membaca file `.env`):

```bash
python scripts/android_config.py --check-backend
```

Setelah konfigurasi aktual tersedia dan workflow ini sudah masuk default branch lewat review/merge PR, buka Actions → Android internal APK → Run workflow. Pilih development terlebih dahulu untuk pengujian native, lalu preview. GitHub memerlukan file workflow_dispatch pada default branch; setelah terdaftar, branch build dapat dipilih. Artifact hanya tersedia jika Gradle
benar-benar menghasilkan APK; tidak ada APK contoh atau pengganti berupa bundle JavaScript.
Workflow memakai runner GitHub dengan JDK/Android SDK dan tidak memerlukan akun EAS.
EAS profiles lama tetap tersedia sebagai alternatif bila akun/build quota sudah ada;
resource berbayar baru tidak dibuat otomatis.

Uji pemasangan pada perangkat sendiri setelah artifact APK tersedia:

```bash
adb devices
adb install -r path/to/app.apk
```

Development client memerlukan Metro (`cd mobile && npm start`). Preview berisi bundle
mandiri. Uji login, catat pengeluaran, reload/login ulang, budget, edit/hapus/filter,
error koneksi dan logout. Untuk reminder fisik: izin ditolak, ubah jam, disable,
background, layar terkunci, offline, reboot, timezone dan logout. Catat model/versi Android
dan perilaku force-stop/baterai yang diamati. Tes emulator bukan pengganti tes HP fisik.

## Guard versi native Expo

Pemeriksaan autolinking menemukan expo-font58.0.12 sebagai peer transitive pada SDK55,
meskipun expo install --check melaporkan up-to-date. Manifest kini secara eksplisit
memakai expo-font~55.0.8 dan lockfile hanya memiliki satu instalasi55.0.8.
`npm run check:native` memeriksa hasil resolve/search Android terhadap rentang SDK
terpasang dan menolak mismatch/duplikasi. CI frontend dan workflow APK menjalankan guard
ini. Empat tes regresi dijalankan dengan
`node --test scripts/tests/check_expo_native_versions.test.cjs` dari root repository.
Guard/autolinking tidak menggantikan kompilasi Gradle atau uji perangkat.

Referensi resmi: https://docs.expo.dev/build-reference/apk/ dan
https://docs.expo.dev/versions/v55.0.0/sdk/notifications/

Aturan dispatch GitHub: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow

## Emulator gratis di GitHub Actions

Repository publik ini memakai runner standar ubuntu-latest (bukan larger runner).
Workflow Android emulator environment berjalan pada perubahan workflow/helper dan
manual setelah file terdaftar di main. Ia memeriksa KVM, boot Android API35 google_apis
x86_64 serta ADB/Play services. Run43821500154 benar-benar success; ini bukti lingkungan
emulator, belum bukti aplikasi terpasang. Tidak perlu akun layanan emulator berbayar.

Setelah backend HTTPS, Firebase/OAuth dan signing tersedia, jalankan workflow Android
internal APK dengan profil preview. Sesudah APK asli berhasil dibangun/upload, job
emulator-smoke yang terpisah mengunduhnya, memasang, membuka activity, memeriksa layar
Masuk dengan Google dari React Native serta proses tetap hidup20detik. Profil development
membutuhkan Metro dan sengaja tidak diuji sebagai APK mandiri. Pemeriksaan ini tidak
melakukan login/keuangan nyata atau menggantikan pengujian reminder pada HP fisik.

Perintah helper pada emulator baru yang sesuai:

```bash
python scripts/android_emulator_smoke.py
python scripts/android_emulator_smoke.py --apk /path/to/real-preview.apk --package id.catatharian.app
```

Mode pertama hanya preflight dan melaporkan app_tested=false. Helper membatasi ADB pada
serial emulator; tidak clear data HP fisik. CI emulator tidak menerima secret signing,
menyimpan logcat, XML layar atau screenshot akun sebagai artifact.

Referensi: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
serta https://developer.android.com/studio/run/emulator-acceleration.
