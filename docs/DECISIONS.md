# Keputusan implementasi iterasi 1

16 November 2026

- Proyek terpisah di `catat-harian/mobile`, tanpa mengubah instalasi/config coding agent. Workspace awal kosong selain prompt yang dilampirkan.
- PRD/kontrak v0.1 menjadi acuan; tidak mengubah dokumen sumber.
- Expo 55.0.32 + React Native 0.83.10 + React 19.2.0; memakai pasangan dari bundledNativeModules Expo dan npm lockfile. SDK 55 dipilih sebagai baseline stabil terdokumentasi, bukan klaim versi paling baru.
- Firebase native app/auth 26.4.2 dan Google Sign-In 16.2.0: native development build, New Architecture pada RN 0.83. Tidak memakai Firebase web persistence maupun Expo Go. Kecocokan graph paket diperiksa; build native belum diuji.
- Default Android application ID sementara `id.catatharian.app`; dapat diatur lewat env sebelum registrasi Firebase/signing. Mengubah ID sesudah registrasi memerlukan penyesuaian aplikasi Android Firebase.
- Endpoint base env menyertakan `/api/v1`. Frontend hanya berbicara dengan FastAPI.
- Unknown command hanya satu per akun; SecureStore, ukuran payload dibatasi 1.800 byte sebelum request, backup aplikasi Android dinonaktifkan. Tidak ada financial cache persisten atau antrean offline.
- UNKNOWN/timeout diperiksa dengan aksi manual pengguna; key/body tetap. Mutasi tidak diulang otomatis. Keberhasilan hanya setelah konfirmasi HTTP yang definitif/APPLIED.
- Konflik membuat form berhenti untuk meninjau riwayat terbaru, lalu pengguna dapat memulai aksi baru.
- Seluruh query akun diinvalidasi sesudah mutasi/recovery sukses agar tanggal/bulan yang terdampak dibaca ulang. Belum ada edit/hapus.
- Tampilan kategori memakai seed label yang ditetapkan kontrak. Bentuk JSON item `/categories` masih perlu dikonfirmasi melalui OpenAPI BE; parser awal dijelaskan di README.
- Tahap ini menyediakan fondasi, auth dan kode alur tambah transaksi, plus pembacaan riwayat/ringkasan. Verifikasi end-to-end memerlukan backend/Firebase/perangkat. Editor budget dan reminder tidak dipercepat memakai placeholder.

## Referensi resmi yang diperiksa

- [Expo SDK 55](https://expo.dev/changelog/sdk-55)
- [Expo Firebase](https://docs.expo.dev/guides/using-firebase/)
- [Expo Google authentication](https://docs.expo.dev/guides/google-authentication/)
- [Firebase social authentication](https://rnfirebase.io/auth/social-auth)
- [Google Sign-In Expo setup](https://react-native-google-signin.github.io/docs/setting-up/expo)


## Pembaruan pemeriksaan integrasi

Lihat `INTEGRATION.md` untuk hasil terkini. Kategori FE kini memakai `data.items` dan telah diuji lewat HTTP ke FastAPI dengan auth/storage khusus tes. Firebase/Sheets nyata, reminder, dan APK belum diverifikasi.
