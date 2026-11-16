# Catat Harian — pratinjau UI browser

Harness pengujian visual terpisah untuk melihat layar React Native yang sudah ada.
Ini bukan APK dan bukan penerimaan integrasi. Banner selalu menandai data contoh;
Google login, backend FastAPI, Google Sheets, dan notifikasi Android tidak terhubung.

## Menjalankan

Dari root repository, gunakan Node24 dan install dependency aplikasi dahulu:

```bash
npm ci --prefix mobile
npm ci --prefix mobile/preview
npm run build --prefix mobile/preview
npm run dev --prefix mobile/preview
```

Vite melayani http://localhost:4173. Jika lingkungan membatasi deteksi network
interface Vite, jalankan server static untuk build yang sama:

```bash
python -m http.server 4173 --bind 0.0.0.0 --directory mobile/preview/dist
```

Arahkan hosting static ke isi `dist/`, bukan ke source repository atau backend.
Preview dibangun menjadi satu HTML, satu CSS, dan satu bundle JavaScript; tidak
menyertakan private config, token, Firebase Admin SDK, atau source map.

Untuk satu file yang bisa diunduh lalu dibuka di Chrome/Edge:

```bash
npm run build:standalone --prefix mobile/preview
```

Hasil `dist/catat-harian-preview.html` menyertakan bundle dan stylesheet yang sama
secara inline. File ini tetap hanya memakai data contoh dan tidak melakukan login.

## Source yang digunakan

- `../app/(tabs)/index.tsx`: Hari Ini.
- `../app/(tabs)/history.tsx`: Riwayat dan filter.
- `../app/(tabs)/summary.tsx`: Ringkasan bulanan.
- `../app/(tabs)/settings.tsx`: Pengaturan dan pengingat.
- `../app/transaction.tsx`, `transaction-detail.tsx`, `budget.tsx`: form dan detail.
- Komponen asli pada `../src/components/`, domain dan theme asli tetap digunakan.

Alias Vite hanya berlaku pada build preview ini. Session, router, jaringan,
command mutation, reminder, crypto dan feedback disesuaikan untuk browser.
Dependencies native serta konfigurasi build produksi tidak diubah. React dan
React DOM di-alias ke versi aplikasi induk agar tidak terjadi duplicate hooks.

## Batas data dan perilaku

- Data contoh dibuat di memori: budget Rp100.000, pengeluaran hari ini Rp35.000,
  pemasukan hari ini Rp200.000, serta transportasi kemarin Rp65.000.
- Navigasi, filter, input dan validasi form memakai layar/komponen asli.
- Mutasi hanya mengubah fixtures selama halaman terbuka. Reload atau Reset
  mengembalikan data contoh; tidak ada fetch jaringan ke API/Google.
- Fixture bukan implementasi kontrak BE lengkap. Revision, idempotency, UNKNOWN,
  tombstone dan aturan historis budget tetap diuji oleh suite aplikasi asli.
- Feedback penyimpanan diganti agar tidak menyatakan keberhasilan server nyata.
- Pengaturan pengingat hanya mengubah contoh preferensi. Izin tetap belum diberikan,
  schedule tidak aktif, tombol tes tidak menjadwalkan notifikasi OS.
- Logout dan pengaturan OS menampilkan penjelasan pratinjau; tidak mengubah sesi asli.
- Kontrol lebar360/390/430 hanya menguji rendering browser, bukan emulator Android,
  keyboard native, TalkBack, background/reboot atau uji HP fisik.

## Bukti pemeriksaan

Dependency terpisah dipasang dari npm dan `npm run build` berhasil. Bundle tidak
mengandung Firebase native/Google Sign-In. Peringatan bundler `use client` berasal
dari dependency; preview adalah client-only React dan bukan React Server Components.
Browser/interaction QA dan deployment dicatat koordinator di `docs/STATUS.md`.
