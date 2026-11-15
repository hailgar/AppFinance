# Catat Harian — frontend Android

Iterasi 1 + pemeriksaan integrasi, 16 November 2026. React Native / Expo development build.

Pemeriksaan terbaru: lihat `docs/INTEGRATION.md`. Parser kategori sudah mengikuti
`data.items` dari FastAPI. Klien HTTP FE telah diuji ke FastAPI aktual dengan
fixture autentikasi/penyimpanan terisolasi; ini belum membuktikan Firebase native,
Google Sheets nyata, atau APK. Dokumen PRD, kontrak, dan OpenAPI BE disertakan di `docs/`.

## Status yang sebenarnya

Kode menggunakan API nyata, tanpa adapter mock dan tanpa data keuangan contoh. Koneksi backend, login Google pada perangkat, persistensi Sheets, dan APK **belum diverifikasi**. Tidak ada backend, Firebase project, credential, Android SDK/perangkat, atau OpenAPI live yang disediakan pada sesi ini.

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

## Belum diimplementasikan

Iterasi berikutnya mengikuti urutan prompt setelah alur nyata diverifikasi:

1. Editor budget default/override dari kartu Beranda, termasuk revision/tombstone.
2. Detail, edit/hapus dengan konfirmasi dan pemulihan konflik revision; filter jenis/kategori riwayat; rincian ringkasan per kategori.
3. Onboarding budget/reminder.
4. Reminder lokal sudah diimplementasikan; rebuild development client/APK dan uji pengiriman nyata. Ikuti [handoff reminder](REMINDER_ANDROID.md) untuk izin, dua jadwal, offline, logout dan matriks uji perangkat.
5. Uji Android fisik: TalkBack, teks besar, layar 360–430 dp, nominal 12 digit, keyboard, background, reboot, timezone, izin ditolak, offline, logout; build APK.

Riwayat/ringkasan awal sudah membaca endpoint nyata; fitur yang belum ada tidak digantikan data palsu.

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
