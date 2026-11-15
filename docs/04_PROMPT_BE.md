# Prompt BE — salin ke coding agent

Lampirkan `01_PRD.md` dan `02_API_DAN_DATA.md` bersama prompt ini. Jika dokumen tidak tersedia, minta dokumen sebelum mengimplementasikan kontrak sendiri.

---

Bertindak sebagai Senior Python Backend Engineer. Bangun backend FastAPI aplikasi Android pribadi “Catat Harian” untuk pencatatan keuangan dan budgeting harian, dengan Google Sheets sebagai penyimpanan utama. Ikuti PRD dan kontrak terlampir. Jangan mengganti penyimpanan ke PostgreSQL/Firestore tanpa keputusan pengguna. Firebase hanya dipakai untuk Authentication.

Baca AGENTS.md, project, manifest/lockfile, konfigurasi, dan tes yang ada. Jika project baru, gunakan Python stabil yang didukung dependency, FastAPI, Pydantic, Firebase Admin SDK, Google Sheets API official client/google-auth, pytest, dan konfigurasi environment. Pin dependencies. Pisahkan routes/schemas/domain/repository; hindari microservices, Redis, Celery dan ORM yang tidak dibutuhkan.

## Aturan domain

Implementasikan seluruh aturan nominal, tanggal, kategori, budget default efektif, override per tanggal, null versus nol, edit, hapus logis, ringkasan, dan reminder preferences dalam PRD. Gunakan integer rupiah ketat; jangan menerima float/string/boolean. Jadikan `datetime.now(ZoneInfo('Asia/Jakarta')).date()` atau clock terinjeksi sebagai sumber hari bisnis; audit timestamp UTC.

Budget efektif D = override aktif D atau default aktif dengan effective_from paling akhir yang <= D atau null. Pengeluaran aktif mengurangi budget; pemasukan tidak. Over budget adalah status informasi, bukan kegagalan write. Jangan menyebut net flow sebagai saldo rekening.

Bangun endpoint persis kontrak; normalisasi error HTTP/validasi. Dokumentasikan OpenAPI aktual. Date filters, batas range, cursor, expected_revision dan Idempotency-Key harus tervalidasi. Turunkan UID dari Firebase ID token yang diverifikasi, periksa ALLOWED_FIREBASE_UID, dan lakukan ownership check setiap resource/operation. Tidak boleh trust user_id body/query.

## Repository Google Sheets

Gunakan `LedgerEvents` append-only sebagai sumber kebenaran dan reducer deterministik sesuai `02_API_DAN_DATA.md`. Ini penting untuk retry, revision conflict dan riwayat perubahan. Semua agregasi berasal dari state terkini hasil reducer; jangan menjumlahkan event mentah atau mempercayai formula Sheet.

Satu command = satu baris literal yang menyimpan operation_id, identitas, entity target, expected_revision, full payload, semantic_hash, schema_version, dan audit time. Deduplikasi operation yang sama; hash berbeda pada key yang sama harus ditolak. Revisi ditentukan saat reducer menerapkan event pertama yang valid berdasarkan urutan append. Event stale tetap dicatat sebagai CONFLICT dan tidak mengubah state.

Idempotency diperiksa sebelum menolak revision lama pada retry. Receipt operation harus tetap merepresentasikan hasil pertama, meskipun entitas sudah berubah lagi. Tombstone mempertahankan revision. Create transaksi tidak boleh memakai ulang ID transaksi terhapus. Pastikan semantic hash stabil untuk request yang sama; timestamp baru tidak boleh mengubah hash. Simpan normalized_command_json terpisah dari payload_json sesuai schema kontrak: hash berasal dari request ternormalisasi, sedangkan payload_json adalah snapshot hasil. Untuk PATCH, jangan membangun hash retry dari state yang sudah berubah dan bedakan field tidak dikirim dari null eksplisit. Validasi snapshot occurrence pertama terhadap command dan state; duplicate yang sama tidak diterapkan lagi.

Pada append timeout, jangan menyimpulkan tidak tersimpan. Beri 202 UNKNOWN dan sediakan pemeriksaan `/operations/{key}`. Retry append memakai operation ID dan command yang sama, sehingga baris fisik duplikat tidak menggandakan efek. Rekonstruksi receipt/dedup setelah restart dari Sheet, bukan hanya memory dictionary. Bila data sumber rusak atau payload berbeda memakai operation ID sama, fail closed dan jangan menampilkan total palsu.

Serialisasikan mutasi dengan mutex proses; jalankan satu worker dan satu replica MVP. Tulis pembatasan ini di dokumentasi deploy. Jangan mengklaim atomic read-modify-write lintas beberapa request atau exactly-once delivery. Atomisitas append bukan pengganti reducer revision.

Implementasikan batch reads, cache singkat dengan invalidasi write, bounded backoff+jitter, timeout dan mapping error upstream. Jangan memblokir event loop FastAPI dengan client Google sinkron; gunakan route sinkron/threadpool atau adapter yang sesuai. Hindari polling Sheet agresif. Jika memakai range dinamis, gunakan sheet ID/range yang terkonfigurasi dan header yang tervalidasi, bukan row index sebagai ID bisnis.

Tambahkan bootstrap non-destruktif untuk tab/header, `rebuild_views` untuk tab baca TransactionsView/BudgetsView/PreferencesView/Metadata, dan validator replay/restore. View adalah turunan yang boleh dibangun ulang. Jika view gagal diperbarui, event yang sudah diterapkan tetap sukses; jangan menandai write utama gagal atau melakukan rollback palsu. API tidak bergantung pada view. Jangan edit spreadsheet asli pengguna sebagai data testing.

Catatan pengguna yang diawali `=`, `+`, `-`, atau `@` harus diperlakukan sebagai teks literal saat ditulis atau diekspor. Bootstrap tidak boleh clear/delete existing tabs. Credential service account tidak masuk repo, log, mobile app, atau respons API.

## Auth, pengaturan, dan reminder

Firebase Admin memverifikasi Firebase ID token dari client, bukan sekadar decode JWT dan bukan memverifikasi Google OAuth token dengan audience yang salah. Periksa signature, expiry, issuer/audience melalui SDK. Siapkan env GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_SHEETS_SPREADSHEET_ID, FIREBASE_PROJECT_ID, ALLOWED_FIREBASE_UID, APP_ENV, LOG_LEVEL. Gunakan placeholder dalam .env.example.

Preferensi reminder disimpan di Sheet sebagai pengaturan yang diinginkan. Notification ID, permission Android dan status schedule tidak disimpan sebagai kebenaran server. FastAPI tidak menjalankan scheduler notifikasi lokal, cron, APScheduler, FCM atau BackgroundTasks untuk mengirim reminder MVP. FE yang menjadwalkan di HP.

HTTPS untuk akses nonlokal, log request_id/status/latency tanpa token dan catatan pribadi, dan error tanpa traceback internal. Rate limit sederhana yang sesuai single-instance dan payload size limit; CORS hanya bila diperlukan untuk web client dan bukan pengganti autentikasi native.

## Tahapan dan verifikasi

1. Inspect project; catat dependency, env yang belum ada, dan rencana kecil. Untuk Sheet kosong, siapkan bootstrap dan contoh konfigurasi tanpa mengisi kredensial sungguhan.
2. Buat schema/domain/reducer beserta tes bermakna, auth guard, repository interface, dan adapter Sheet.
3. Selesaikan satu alur nyata POST pengeluaran → GET detail/dashboard → restart BE → tetap benar. Lalu budget, edit/delete, list/summary dan preferensi.
4. Uji unit reducer dan API: benar/salah auth, UID lain, nominal negatif/desimal/bool/string, kategori salah, batas tanggal WIB, budget null/0/over, default efektif, perpindahan tanggal/jenis, tombstone, duplicate operation, key reuse beda payload, retry PATCH setelah state berubah, stale revision dan pagination.
5. Uji timeout dengan append yang ternyata sukses, append duplikat, late stale append, 429 upstream, rusaknya baris, projection failure dan replay setelah restart. Aksi konflik tidak boleh diam-diam menimpa state.
6. Integration test harus opt-in terhadap spreadsheet test terpisah. Mock tidak membuktikan persistensi Google nyata. Jangan menulis ke Sheet asli sebagai percobaan tanpa scope.
7. Hasilkan OpenAPI, setup/run/test berdasarkan tooling aktual, batas single worker/replica, langkah credential sharing Sheet, env placeholder, backup/rebuild/restore dan handoff FE. Jika akses credential atau jaringan tidak ada, tetap selesaikan kode dan tes yang dapat dijalankan, lalu tandai integrasi nyata belum diuji.

Kerjakan per fitur terhubung; jangan menghasilkan seluruh kode sebagai placeholder. Laporkan hanya pemeriksaan yang benar-benar dijalankan dan hasil yang diamati. Jangan deploy, publish, mereset data, atau mengubah konfigurasi global coding agent di luar scope.
