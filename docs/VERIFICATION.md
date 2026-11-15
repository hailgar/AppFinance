# Pemeriksaan aktual — iterasi 1

16 November 2026. Runtime pemeriksaan: Linux, Node 24.22.1, npm 11.9.0.

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | Lulus, exit 0 |
| `npm run lint` | Lulus, exit 0, tanpa warning lint |
| `npm test` | 3 file, 25 tes lulus |
| `EXPO_OFFLINE=1 npm run check:expo` | Exit 0: Dependencies are up to date; memakai daftar kompatibilitas bawaan SDK. Expo memberi peringatan validasi offline; React Native Directory tidak dapat diakses. |
| `EXPO_OFFLINE=1 npm run export:android` | Exit 0, bundle Hermes Android berhasil. Peringatan konfigurasi `android.googleServicesFile` karena file Firebase belum disediakan. Bukan native build/APK. |
| Graph paket `npm ls --depth=0` | Diperiksa; paket utama tercantum di lockfile |
| Firebase/Google login pada HP | Belum diuji; konfigurasi akun/signing belum tersedia |
| FastAPI dan Google Sheets | Belum diuji; URL backend, allowlist UID, dan OpenAPI live belum tersedia |
| Build APK development/release | Belum dilakukan; Android SDK/adb/perangkat tidak tersedia |
| Layout 360–430 dp, TalkBack, teks besar | Belum diverifikasi visual/native |
| Reminder background/reboot/timezone/logout | Kode ditambahkan pada iterasi reminder; unit/HTTP lulus, perangkat fisik belum diuji. Lihat REMINDER_ANDROID.md |

Tes domain: pemisahan tampilan/payload rupiah, penolakan input invalid/desimal/negatif/nominal berlebih, budget null/Rp0/kelebihan, batas hari WIB dan validasi tanggal kalender/rentang.

Tes API: 401 melakukan satu refresh SDK dengan body/key tetap; 401 berulang berhenti; 403 tidak memicu refresh/login otomatis.

Tes command: 202/UNKNOWN/restart mempertahankan key/body, timeout diperiksa via receipt, replacement diblokir selama unresolved, 409 menunggu review, secure storage gagal tidak mengirim, lookup offline tidak mengirim POST ulang, dan 422 membolehkan perbaikan input.

Tidak ada klaim bahwa simpan telah terbukti persisten setelah reload ke server/Sheet. Tidak ada data dummy atau mock yang digunakan untuk menyatakan integrasi berhasil.

## Pembaruan pemeriksaan integrasi

Lihat `INTEGRATION.md` untuk hasil terkini. Kategori FE kini memakai `data.items` dan telah diuji lewat HTTP ke FastAPI dengan auth/storage khusus tes. Firebase/Sheets nyata, reminder, dan APK belum diverifikasi.

## Iterasi 04 — Reminder Android

Hasil terbaru khusus reminder: [REMINDER_ANDROID.md](REMINDER_ANDROID.md).
52 unit FE dan 7 tes HTTP lulus; ekspor Android bukan APK dan tidak membuktikan
notifikasi diterima di perangkat. Hasil iterasi 1 di atas dipertahankan sebagai catatan historis.
