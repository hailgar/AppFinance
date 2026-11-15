# Prompt FE — salin ke coding agent

Lampirkan `01_PRD.md` dan `02_API_DAN_DATA.md` bersama prompt ini. Jika dokumen tidak tersedia, minta kedua dokumen sebelum membuat asumsi kontrak sendiri.

---

Bertindak sebagai Senior React Native Engineer dan Product Designer. Bangun frontend Android aplikasi “Catat Harian” berdasarkan PRD dan kontrak API terlampir. Target: aplikasi pribadi untuk budgeting harian, catat pemasukan/pengeluaran, dan reminder harian. Bahasa UI Indonesia. Gunakan project aplikasi terpisah dari instalasi coding agent.

Baca AGENTS.md, struktur project, manifest, lockfile, dan dokumen yang relevan sebelum mengubah kode. Bila project baru, gunakan React Native + Expo development build + TypeScript + Expo Router. Gunakan TanStack Query, React Hook Form + Zod, expo-notifications, native Firebase Authentication, serta integrasi Google Sign-In yang sesuai dokumentasi resmi dan SDK stabil yang dipilih. Inspeksi kompatibilitas native module sebelum install; jangan mengasumsikan semua modul berjalan di Expo Go. Jangan mengganti backend FastAPI atau database Google Sheets.

## Hasil produk

Buat empat tab: Hari Ini, Riwayat, Ringkasan, Pengaturan. Beranda menonjolkan sisa/kelebihan budget, bukan chart dekoratif. Tombol “Catat transaksi” menjadi aksi utama. Budget dibuka dari kartu Beranda. Form berisi jenis, nominal rupiah, kategori, tanggal, catatan opsional. Sediakan detail, edit, hapus dengan konfirmasi, dan filter riwayat.

Bangun UI minimalis dengan token PRD, font sistem, angka mudah dibaca, kontras baik, target sentuh minimal 48 dp, fokus/TalkBack, dan dukungan ukuran teks Android. Gunakan spacing konsisten; jangan menambahkan ilustrasi besar, gradient mencolok, atau banyak kartu yang mengulang angka. Periksa layar sempit, keyboard, nominal panjang, dan safe area.

Pisahkan display amount `Rp25.000` dari payload integer `25000`. Budget belum diatur berbeda dari budget Rp0. Pemasukan tidak menambah budget otomatis. Budget terlampaui tetap boleh mencatat. Nilai selisih periode bukan saldo rekening. Gunakan tanggal bisnis Asia/Jakarta, bukan potongan UTC dari `toISOString()`.

## Integrasi API dan autentikasi

- Ikuti path, snake_case, bentuk response/error, batas validasi, pagination, dan revision pada kontrak. FE tidak membaca atau menulis Sheet secara langsung.
- Native Google Sign-In harus menghasilkan Firebase session; kirim Firebase ID token ke FastAPI, bukan Google access token atau token buatan. Gunakan lifecycle session SDK, refresh token melalui SDK, dan tangani 401/403 tanpa loop login.
- Pakai `EXPO_PUBLIC_API_BASE_URL`; tidak ada Admin SDK/service-account credential dalam APK. `localhost` HP bukan laptop; dokumentasikan alamat development yang dapat dijangkau atau konfigurasi jaringan yang tepat. Endpoint HTTPS diperlukan untuk pemakaian di luar development lokal.
- Buat UUID resource dan Idempotency-Key sebelum aksi create. Disable tombol selama request. Simpan command unresolved secara privat per akun, menggunakan penyimpanan aman untuk payload kecil sesuai kemampuan SDK; key/body harus sama saat retry.
- Jika 202/timeout, tampilkan “Sedang memeriksa penyimpanan”; cek `/operations/{key}`. Jangan berikan toast sukses atau membuat key baru untuk request yang belum pasti. Pada 409, fetch ulang dan biarkan pengguna meninjau sebelum submit perubahan baru.
- Gunakan mutation manual untuk submit dan retry terkontrol; jangan aktifkan retry otomatis yang membuat key baru. Setelah receipt sukses, invalidate dashboard, effective budget, riwayat, detail dan ringkasan terkait, termasuk tanggal/bulan lama bila transaksi dipindah.
- MVP tidak mempunyai antrean transaksi offline. Saat offline, jelaskan simpan membutuhkan koneksi; jangan menganggap local state sebagai data tersimpan. Cache hanya memori untuk keuangan kecuali unresolved command yang diperlukan untuk recovery; bersihkan saat logout. Reminder settings boleh tersimpan lokal.
- Jika command unresolved masih ada saat login berikutnya, rekonsiliasi sebelum menawarkan transaksi pengganti. Logout membersihkan data lokal; bila ada request unresolved, jelaskan konsekuensi dan tawarkan menunggu atau tetap logout. Saat login kembali refresh data server sebelum pengguna mengulang catatan tersebut.
- Mock adapter hanya untuk development/test, eksplisit terpisah dari API nyata. Jangan menyebut integrasi selesai ketika hanya memakai mock.

## Reminder Android

Gunakan local scheduled notifications di HP. Dua jenis opsional: cek budget 08.00 dan catat transaksi 20.00. Semua default nonaktif sampai pengguna memilih. Waktu mengikuti jam lokal perangkat; pembukuan tetap WIB dan dijelaskan di pengaturan. Reminder generik tetap muncul walaupun sudah ada transaksi; tidak perlu fetch server saat alarm berbunyi.

Buat notification channel, minta izin pada saat relevan, tangani ditolak/permanen ditolak, sediakan tautan pengaturan sistem serta tombol “Tes notifikasi” yang dipicu pengguna. Tidak perlu remote push, token FCM, cron BE, atau background polling untuk MVP.

Simpan ID jadwal per akun/jenis, batalkan jadwal lama saat jam berubah, cancel saat disable/logout, dan cocokkan daftar pending notifications saat app start/resume agar tidak ganda. Simpan last-known preferences lokal; saat pengaturan offline berubah, tampilkan status backup tertunda dan sinkronkan preferensi dengan revision saat online tanpa menimpa perubahan server diam-diam. Bedakan setting enabled, permission granted, dan schedule active.

Pilih reminder best-effort sesuai SDK; jangan menjadikan fitur ini alarmClock atau meminta izin exact alarm tanpa kebutuhan nyata. Jangan berjanji notifikasi tepat menit, berjalan setelah force-stop, saat HP mati, atau kebal pengaturan baterai vendor. Verifikasi perilaku reboot dan jadwal saat perubahan timezone pada Android fisik; jelaskan batasan yang teramati.

## Cara mengerjakan

1. Ringkas dokumen dan inspect project. Nyatakan keputusan teknis yang belum ditentukan, lalu buat rencana kecil. Jangan mengubah PRD sepihak.
2. Kerjakan per tahap: shell/token → auth → satu alur transaksi nyata → budget → riwayat/ringkasan/edit/hapus → reminder.
3. Pada setiap tahap, implementasikan loading, empty, error, retry, validasi dan success yang relevan. Jangan menghasilkan seluruh app sebagai placeholder sekaligus.
4. Koordinasi dengan BE melalui kontrak dan OpenAPI. Bila BE belum ada, interface/mock boleh membantu UI, tetapi status integrasi harus tetap “belum diverifikasi”. Jangan memperluas scope ke fitur lain.
5. Jalankan typecheck/lint dan tes bermakna untuk amount parsing, tanggal WIB, idempotency/UNKNOWN/409, budget null/0, dan lifecycle reminder. Gunakan alat yang benar-benar tersedia.
6. Uji alur API nyata setelah reload dan Android development/release build fisik. Verifikasi TalkBack dasar, teks besar, layar 360–430 dp, offline, izin ditolak, notifikasi background, reboot dan logout.
7. Berikan daftar file, hasil pemeriksaan aktual, cara menjalankan/build berdasarkan script nyata, env placeholder, dan gap. Jangan mengklaim APK, login, Sheet persistence, atau notifikasi berhasil tanpa bukti eksekusi. Jangan deploy/publish atau memasukkan kredensial tanpa scope.

Mulai dengan inspeksi dan tahap pertama yang konkret. Jangan mengedit konfigurasi global coding agent. Gunakan skill yang tersedia dan relevan; jangan mengklaim menjalankan skill/tool yang tidak ada.
