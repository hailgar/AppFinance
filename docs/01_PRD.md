# PRD — Catat Harian

Versi 0.1 · 16 November 2026 · Status: rancangan awal untuk ditinjau sebelum implementasi.

## 1. Tujuan dan asumsi

Aplikasi Android untuk mengetahui batas pengeluaran hari ini, mencatat pemasukan/pengeluaran dengan cepat, dan menerima pengingat harian untuk mengecek budget serta mencatat transaksi.

Asumsi awal: dipakai pribadi oleh satu orang, mata uang IDR, bahasa Indonesia, satu HP aktif, dan zona waktu pembukuan Asia/Jakarta. Nama “Catat Harian” sementara. Dokumen ini belum berarti aplikasi sudah dibuat atau requirement sudah disetujui.

Keberhasilan MVP: pengguna dapat menetapkan budget, mencatat pengeluaran, melihat sisa budget yang benar setelah aplikasi dibuka ulang, serta mengatur reminder yang diuji di Android fisik.

## 2. Arsitektur yang dipilih

| Lapisan | Pilihan | Tanggung jawab |
|---|---|---|
| FE Android | React Native, Expo development build, TypeScript, Expo Router | UI, form, autentikasi, cache sementara, notifikasi lokal |
| Data fetching | TanStack Query | Cache, pembaruan setelah simpan, status request |
| Form | React Hook Form + Zod | Input dan validasi awal |
| BE | FastAPI, Pydantic, Firebase Admin SDK | Validasi final, identitas, aturan budget, API |
| Penyimpanan keuangan | Google Sheets privat melalui Sheets API | Data transaksi, budget, preferensi, riwayat perubahan |
| Login | Firebase Authentication dengan Google Sign-In | Identitas; tidak memakai Firestore/Realtime Database |
| Reminder | expo-notifications di perangkat | Jadwal harian; tidak memerlukan scheduler FastAPI |
| Rilis awal | APK internal + BE HTTPS | Dipasang sendiri; publikasi Play Store bukan scope awal |

Pemilihan React Native + Expo adalah rekomendasi untuk proyek baru, bukan keharusan dari pengguna. Gunakan versi stabil yang kompatibel saat implementasi, lalu pin melalui lockfile. Jangan memakai versi “latest” tanpa pemeriksaan kompatibilitas native modules.

HP mengakses FastAPI melalui jaringan; FastAPI mengakses Sheet. APK tidak memuat service-account key dan tidak membaca Sheet secara langsung. Backend harus dapat dijangkau HP agar pencatatan tersimpan. Laptop yang mati berarti BE lokal ikut tidak tersedia; hosting BE terpisah diperlukan untuk akses kapan saja. Reminder yang sudah terjadwal tetap dikelola perangkat.

Google Sign-In native/Firebase memerlukan development build; Expo Go bukan lingkungan penerimaan final. Belum ada hosting, akun cloud, kredensial, atau biaya layanan yang disiapkan melalui dokumen ini.

## 3. Scope MVP

| Fitur | Perilaku |
|---|---|
| Login | Akun Google; BE hanya menerima satu Firebase UID dalam allowlist konfigurasi |
| Onboarding | Atur budget default opsional, tawarkan reminder, jelaskan izin notifikasi |
| Beranda | Tanggal, budget, pengeluaran, sisa atau kelebihan budget, pemasukan, transaksi terbaru |
| Transaksi | Tambah, ubah, hapus logis; pemasukan/pengeluaran; nominal, kategori, tanggal, catatan opsional |
| Budget | Default harian yang berlaku mulai tanggal tertentu dan override per tanggal |
| Riwayat | Filter rentang tanggal, jenis, kategori; pagination |
| Ringkasan | Bulan terpilih: total masuk/keluar, selisih, pengeluaran per kategori |
| Reminder | Dua jadwal opsional: cek budget pagi dan catat transaksi malam; satu waktu per jenis |
| Pengaturan | Reminder, status izin, informasi akun, logout |

Di luar MVP: banyak pengguna, banyak perangkat tersinkronisasi untuk reminder, bank/e-wallet sync, OCR struk, utang/cicilan, saldo rekening, transfer, refund, transaksi berulang otomatis, pembagian budget kategori, aplikasi tugas umum, AI insight, dan offline transaction sync.

## 4. Aturan keuangan

1. Semua nominal adalah integer rupiah. Nominal transaksi 1–999.999.999.999; budget 0–999.999.999.999. Jangan gunakan float untuk uang.
2. Input `25000` dapat ditampilkan sebagai `Rp25.000`. Pemisah ribuan hanya presentasi; API menerima JSON integer. Tolak desimal, nilai negatif, NaN, boolean, dan string nominal pada BE.
3. Jenis transaksi `EXPENSE` atau `INCOME`, dengan nominal selalu positif. Hanya pengeluaran yang mengurangi budget.
4. `sisa = budget efektif − total pengeluaran aktif pada tanggal itu`. Pemasukan tidak otomatis menambah budget.
5. Contoh: budget Rp100.000, pengeluaran Rp35.000, pemasukan Rp200.000 → sisa tetap Rp65.000.
6. Bila pengeluaran Rp120.000 terhadap budget Rp100.000, tampilkan “Melebihi budget Rp20.000”. Tetap izinkan pencatatan.
7. Budget belum dibuat (`null`) berbeda dari budget Rp0. Pada `null`, tampilkan “Budget belum diatur”, tanpa persen pemakaian. Pada Rp0, tidak ada pembagian nol; pengeluaran positif berarti melebihi budget.
8. Untuk tanggal D, gunakan override D bila ada. Jika tidak ada, ambil default dengan `effective_from <= D` paling baru. Bila tidak ada keduanya, budget `null`. Menghapus override mengembalikan fallback tersebut.
9. Perubahan default hanya boleh mulai hari ini atau tanggal mendatang. Default baru tidak mengubah tanggal sebelumnya. Override hanya mengubah tanggal yang dipilih. Tidak ada carry-over otomatis.
10. Budget tidak memblokir transaksi. Selisih pemasukan-pengeluaran bukan saldo rekening; label UI “Selisih periode”, bukan “Saldo”.
11. Pengguna boleh mencatat tanggal lampau, maksimal 366 hari sebelum hari ini. Transaksi masa depan ditolak. Budget override boleh dalam rentang 366 hari lalu sampai 366 hari mendatang; default hanya hari ini sampai 366 hari mendatang.
12. Tanggal bisnis disimpan sebagai `YYYY-MM-DD`, ditafsirkan dalam Asia/Jakarta. Audit timestamp disimpan UTC RFC3339. UI menghitung “hari ini” dengan zona pembukuan yang sama.
13. Mengubah tanggal/jenis/nominal transaksi harus memperbarui ringkasan semua hari dan bulan yang terpengaruh. Hapus berarti tombstone; jangan menghapus baris sumber.
14. Kategori seed: pengeluaran Makan & Minum, Transportasi, Belanja, Tagihan, Hiburan, Lainnya; pemasukan Gaji, Bonus, Lainnya. Kode kategori stabil dan berbeda antarjenis. CRUD kategori di luar MVP.

## 5. Pengalaman pengguna dan desain

Navigasi bawah: **Hari Ini**, **Riwayat**, **Ringkasan**, **Pengaturan**. Tombol utama “Catat transaksi” mudah dijangkau pada Beranda. Budget dibuka dari kartu Beranda; tidak perlu tab terpisah.

Urutan Beranda: tanggal dan sapaan pendek → kartu sisa budget → budget/pengeluaran/pemasukan → tombol catat → transaksi terbaru. Jangan menyebut pengguna boros atau memakai pesan yang menghakimi.

Form transaksi: jenis → nominal → kategori → tanggal → catatan → Simpan. Default jenis pengeluaran dan tanggal hari ini. Numeric keypad; tetap dapat diedit. Catatan maksimal 200 karakter. Setelah sukses, tampilkan hasil server dan perbarui cache terkait.

Design tokens: latar `#F7F8FA`, permukaan `#FFFFFF`, teks utama `#111827`, teks sekunder `#4B5563`, aksi `#0F766E`, peringatan `#92400E`, bahaya `#B91C1C`. Gunakan font sistem, body 16 sp, label 14 sp, nominal utama 28–32 sp, spacing 8/12/16/24, radius 12–16, garis halus dan bayangan ringan. Verifikasi kontras pasangan warna yang benar-benar dipakai.

Hindari kartu berlebihan, gradient dekoratif, ilustrasi besar, dan chart tanpa angka. Progress bar selalu disertai angka/label; clamp visual 0–100%, tetapi nominal kelebihan tetap terlihat. Ringkasan kategori dapat berupa batang horizontal sederhana plus nominal dan persentase. Sentuhan minimal 48 dp, teks bisa membesar, warna bukan satu-satunya pembeda status. Nominal besar harus tetap terbaca pada layar 360 dp.

Setiap layar memiliki loading, kosong, error dan retry. Contoh empty state: “Belum ada pengeluaran hari ini.” Contoh koneksi: “Belum bisa terhubung. Coba lagi.” Jangan menampilkan JSON, traceback, atau nama tabel di UI.

## 6. Reminder

- Default saran: cek budget 08.00 dan catat transaksi 20.00; keduanya baru aktif setelah pengguna mengaktifkan dan menyetujui izin.
- MVP memakai pengulangan harian pada **jam lokal perangkat**, bukan alarm tepat waktu. Pengaturan menulis “Jam mengikuti perangkat; pembukuan memakai WIB.” Ini membedakan perilaku saat pengguna bepergian.
- Notifikasi pagi: “Cek budget hari ini sebelum mulai aktivitas.” Notifikasi malam: “Luangkan sebentar untuk mencatat pengeluaran hari ini.” Jangan memuat nominal keuangan di layar kunci.
- Reminder tetap dikirim walaupun sudah ada transaksi. Kondisi “hanya jika belum mencatat” bukan MVP; tidak bergantung pada eksekusi JavaScript harian di background.
- Notifikasi dapat dijadwalkan saat HP offline. Menutup layar aplikasi berbeda dari force-stop. Jangan menjanjikan pengiriman tepat menit, saat perangkat mati, setelah force-stop, atau di semua pengaturan hemat baterai.
- Penolakan izin tidak menghambat pencatatan. Tampilkan status izin dan akses pengaturan sistem; jangan terus meminta izin.
- Simpan ID jadwal lokal. Ubah waktu berarti batalkan jadwal lama lalu buat baru; matikan berarti batalkan. Saat login/start/resume, bandingkan jadwal sistem dengan preferensi terakhir dan rekonsiliasi agar tidak ganda.
- FE menyimpan preferensi reminder terakhir secara lokal agar restart/offline tidak menghilangkan pengaturan. Sheet menyimpan preferensi yang diinginkan; ID notifikasi dan status izin tetap milik perangkat.
- Saat preferensi offline berubah, tandai “Tersimpan di perangkat; belum dicadangkan”. Hanya preferensi yang boleh tertunda; tidak ada antrean offline transaksi. Jadwal yang benar-benar aktif harus dibaca dari API perangkat, bukan diasumsikan dari respons BE.
- Logout membatalkan semua reminder milik akun dan membersihkan cache keuangan. Perubahan zona waktu perangkat mengikuti perilaku scheduler OS; periksa dan rekonsiliasi saat aplikasi kembali aktif. Uji reboot pada perangkat nyata dan catat hasilnya.
- FastAPI tidak menjalankan cron/BackgroundTasks untuk mengirim notifikasi Android. Remote push dan scheduler server adalah pilihan fase selanjutnya jika ada kebutuhan konkret.

## 7. Google Sheets sebagai penyimpanan

Sheets dipakai untuk MVP pribadi dengan volume rendah. Backend MVP satu instance, satu worker penulis. Jangan menganggap Sheet memiliki unique constraint, transaksi database lintas request, atau kemampuan multiwriter setara PostgreSQL.

Untuk menjaga riwayat dan mencegah pengeluaran terhitung ganda akibat retry, gunakan tab sumber append-only `LedgerEvents`, kemudian bentuk state terkini di backend. Tab `TransactionsView`, `BudgetsView`, dan `PreferencesView` adalah proyeksi baca yang dapat dibangun ulang untuk memudahkan pemeriksaan di Google Sheets. API membaca sumber/cache yang tervalidasi, bukan bergantung pada proyeksi yang mungkin tertinggal. Detail kontrak pada `02_API_DAN_DATA.md`.

Spreadsheet privat; hanya pemilik dan service account BE yang diberi akses. Pengguna membaca tab View. Edit/hapus/sort baris tab sumber secara manual tidak didukung; koreksi melalui aplikasi. Gunakan proteksi range dan batasi editor. Setup tidak menghapus spreadsheet yang sudah ada. Siapkan spreadsheet pengujian terpisah.

Gunakan batch read, cache singkat yang diinvalidasi setelah mutasi, serta backoff dengan jitter untuk pembacaan/429. Retry append harus memakai operation ID yang sama. Tulis teks sebagai literal, bukan formula. Cache memori bukan penyimpanan utama. Jangan menghitung total dengan menjumlahkan semua event mentah.

Catat latency dan volume. Pertimbangkan migrasi PostgreSQL bila perlu banyak pengguna/instance, write bersamaan, audit formal, atau pembacaan mulai lambat dan kuota sering terlampaui. Batas praktis harus diukur; jangan menjanjikan jumlah pengguna tertentu.

## 8. Keamanan dan operasional

Verifikasi Firebase ID token pada setiap endpoint privat, periksa UID allowlist, dan turunkan user_id dari token. Jangan menerima user_id request sebagai otoritas. Tidak ada API key bersama yang ditanam dalam APK sebagai autentikasi.

Simpan service-account credential hanya di secret/config BE. Pakai HTTPS saat di luar pengembangan lokal; jangan menonaktifkan verifikasi TLS. Public Firebase config berbeda dari private Admin credential. CORS dibatasi bila menyediakan web client; CORS bukan mekanisme pengamanan native app.

Jangan log token atau isi catatan pribadi. Gunakan error code, request_id, dan durasi operasi. Sediakan backup manual ekspor spreadsheet sebelum perawatan, serta prosedur restore ke spreadsheet baru dan replay validasi. Backup otomatis dan deployment layanan berbayar memerlukan scope terpisah.

Jika offline, form transaksi tetap dapat mempertahankan input selama layar aktif, tetapi tombol simpan harus menjelaskan koneksi dibutuhkan. Jangan tampilkan “Tersimpan” sebelum BE mengonfirmasi. Jika hasil request belum pasti, tampilkan status pengecekan dengan operation ID yang sama.

## 9. Kriteria penerimaan

1. Pengeluaran Rp35.000 pada budget Rp100.000 menghasilkan sisa Rp65.000 setelah reload dan login ulang.
2. Pemasukan Rp200.000 tidak mengubah sisa budget tersebut.
3. Pengeluaran melampaui budget tetap tersimpan, dengan label kelebihan yang benar.
4. Budget null, Rp0, dan pengeluaran nol tidak menimbulkan persentase palsu atau pembagian nol.
5. Default baru mulai besok tidak mengubah hari ini; override hari ini hanya memengaruhi hari ini.
6. Edit tanggal/jenis dan hapus transaksi memperbarui total yang tepat; event lama tidak ikut dijumlahkan.
7. Klik ganda/retry dengan operation ID sama tidak menghasilkan dua transaksi efektif, termasuk setelah restart BE.
8. Revisi lama pada update ditolak dengan konflik yang bisa dipulihkan FE.
9. Token salah/kedaluwarsa ditolak; UID selain allowlist ditolak; nominal negatif/desimal dan kategori salah ditolak.
10. Izin notifikasi ditolak tidak memblokir form; ubah jam/disable/logout tidak meninggalkan reminder ganda.
11. Reminder diuji pada Android fisik dengan aplikasi di background, offline, layar terkunci, restart HP, dan perubahan jam. Force-stop dan hemat baterai ekstrem dicatat sebagai kondisi terbatas.
12. FE tidak menyimpan service key. Simpan sukses benar-benar dapat dibaca lagi dari BE/Sheet.
13. Error kuota/koneksi tidak menghasilkan keberhasilan palsu; hasil tak pasti dapat diperiksa/retry aman.
14. UI nyaman pada lebar 360–430 dp, teks diperbesar, nominal 12 digit, keyboard terbuka, dan TalkBack dasar.

## 10. Tahapan implementasi

1. Konfirmasi asumsi dan kontrak; siapkan project terpisah dari instalasi coding agent.
2. Fondasi: FE shell, autentikasi development build, BE verifikasi token, Sheet test.
3. Satu alur lengkap: tambah pengeluaran → tersimpan → dashboard benar setelah reload.
4. Budget default/override, edit/hapus, riwayat dan ringkasan.
5. Reminder lokal, izin, rekonsiliasi, logout.
6. Uji penerimaan, dokumentasi setup, build APK dan panduan BE. Publikasi/hosting hanya jika diminta.

## 11. Dasar teknis resmi

Dokumentasi ditinjau 16 November 2026; periksa lagi saat memilih versi SDK.

- Expo notifications: https://docs.expo.dev/versions/latest/sdk/notifications/
- Expo Google authentication: https://docs.expo.dev/guides/google-authentication/
- Expo Firebase: https://docs.expo.dev/guides/using-firebase/
- Android alarm scheduling: https://developer.android.com/develop/background-work/services/alarms
- Google Sheets API limits: https://developers.google.com/workspace/sheets/api/limits
- Sheets error handling: https://developers.google.com/workspace/sheets/api/troubleshoot-api-errors
- Firebase ID token verification: https://firebase.google.com/docs/auth/admin/verify-id-tokens

Alasan arsitektur adalah keputusan rancangan. Dukungan notifikasi, persyaratan native build, verifikasi token, dan kuota mengikuti dokumentasi resmi di atas. Atomisitas satu request Sheets tidak sama dengan transaksi database beberapa request.
