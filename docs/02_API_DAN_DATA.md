# Kontrak bersama FE dan BE — Catat Harian

Versi 0.2. Gunakan bersama PRD. Penambahan operasional kompatibel: status proyeksi laporan dan pembaruan View otomatis. Kontrak ini spesifikasi implementasi, bukan OpenAPI yang sudah dihasilkan dari aplikasi.

## 1. Konvensi

Base `/api/v1`. Privat: `Authorization: Bearer <Firebase-ID-token>`. BE verifikasi token dan UID allowlist. Semua JSON memakai snake_case. ID UUID string. Tanggal bisnis ISO `YYYY-MM-DD`; timestamp UTC RFC3339; zona pembukuan `Asia/Jakarta`. Semua amount adalah JSON integer ketat. Batas nominal dan tanggal mengikuti PRD.

Mutasi memakai header `Idempotency-Key: <UUID>`; key per aksi logis, dipertahankan saat timeout/retry. Update/delete memakai `expected_revision` integer. Create memakai expected revision 0 secara internal. Revision efektif pertama 1, kemudian naik satu untuk setiap perubahan yang diterapkan.

Sukses biasa: `{ "data": ..., "request_id": "..." }`. Error: `{ "error": { "code": "VALIDATION_ERROR", "message": "Periksa data yang diisi.", "fields": {} }, "request_id": "..." }`. Normalisasi error validasi FastAPI ke bentuk yang sama.

Daftar: `data.items`, `data.next_cursor` (string opaque atau null). Cursor stabil berdasarkan `(transaction_date DESC, id DESC)` dan mencakup filter; default limit 20, maksimum 100. Jika data berubah selama pagination, refresh daftar; kontrak tidak menjanjikan snapshot lintas request. Jangan menjadikan nomor baris Sheet sebagai ID publik.

HTTP: 200 baca/update/delete logis atau replay; 201 create pertama; 202 hasil write belum pasti; 401 token tidak valid; 403 UID tidak diizinkan; 404 resource tidak ada; 409 revision/key conflict; 422 validasi; 429 limit aplikasi; 503 upstream tidak tersedia. Error upstream 429 boleh dipetakan 503 `STORAGE_BUSY` dengan `Retry-After` agar dibedakan dari rate limit aplikasi.

## 2. Endpoint

| Method | Path | Input utama | Output dan aturan |
|---|---|---|---|
| GET | `/health/live` | — | Publik, status proses tanpa data pribadi |
| GET | `/me` | — | UID, display_name, currency=IDR, timezone=Asia/Jakarta |
| GET | `/categories` | `type?` | Kode kategori dan label sesuai jenis |
| GET | `/dashboard` | `date` | Ringkasan tanggal, budget efektif, 5 transaksi terbaru |
| GET | `/transactions` | `from`, `to`, `type?`, `category_code?`, `cursor?`, `limit?` | Daftar transaksi aktif; range maksimal 366 hari inklusif |
| POST | `/transactions` | `id`, `type`, `amount`, `category_code`, `transaction_date`, `note?` | Resource transaksi revision 1 |
| GET | `/transactions/{id}` | — | Transaksi aktif milik UID |
| PATCH | `/transactions/{id}` | Field yang berubah + `expected_revision` | Resource terbaru; ID tidak dapat diubah |
| DELETE | `/transactions/{id}` | Query `expected_revision` | `{id, deleted:true, revision}`; body kosong |
| GET | `/budgets/effective` | `date` | amount/null, source, effective_from/null, override_active, override_revision |
| PUT | `/budgets/defaults/{effective_from}` | `amount`, `expected_revision` | Buat/ubah default tanggal tersebut; create revision=0 |
| PUT | `/budgets/daily/{date}` | `amount`, `expected_revision` | Buat/ubah override; create revision=0 |
| DELETE | `/budgets/daily/{date}` | Query `expected_revision` | Hapus logis override; kembali ke fallback |
| GET | `/budgets/defaults` | — | Daftar default aktif dan revision untuk editor, urut tanggal |
| GET | `/summary/monthly` | `month=YYYY-MM` | income_total, expense_total, net_flow, expenses_by_category |
| GET | `/preferences` | — | Dua reminder dan revision; default semua nonaktif |
| PUT | `/preferences` | Seluruh preferensi + `expected_revision` | Preferensi tersimpan; tidak membuktikan izin/jadwal HP aktif |
| GET | `/storage/status` | — | Status proyeksi laporan privat; tidak berisi nominal/catatan |
| GET | `/operations/{key}` | — | Hasil mutasi APPLIED/CONFLICT atau UNKNOWN |

Resource yang tidak dimiliki user diperlakukan 404. Rentang bulan valid dari bulan yang mencakup batas historis PRD sampai bulan berjalan. Monthly summary tidak mengembalikan saldo rekening. Budget ditampilkan lewat endpoint efektif; nilai default/override historis tidak dihitung dari setting hari ini.

Dashboard example:

```json
{
  "data": {
    "date": "2026-11-16",
    "timezone": "Asia/Jakarta",
    "budget_amount": 100000,
    "budget_source": "DEFAULT",
    "expense_total": 35000,
    "income_total": 200000,
    "remaining_amount": 65000,
    "usage_percent": 35,
    "budget_status": "WITHIN_BUDGET",
    "recent_transactions": []
  },
  "request_id": "example-request"
}
```

Status budget: `UNSET` bila null, `WITHIN_BUDGET` bila sisa >0, `AT_LIMIT` bila sisa=0, `OVER_BUDGET` bila sisa<0. Bila budget null, remaining dan usage_percent null. Bila budget=0, usage_percent null; status tetap dihitung dari sisa. Persen dapat melebihi 100; FE hanya membatasi panjang progress bar. Persen untuk display boleh dibulatkan satu desimal; tidak dipakai sebagai dasar perhitungan uang.

Budget source: `OVERRIDE`, `DEFAULT`, atau `UNSET`. Pada GET effective, `override_active` menyatakan override belum deleted. `override_revision` adalah revision terakhir override termasuk tombstone, atau 0 bila belum pernah ada. Dengan demikian FE dapat membuat ulang override yang dihapus menggunakan revision terakhir, walaupun amount efektif berasal dari default.

Transaction example:

```json
{
  "id": "3354c920-9734-4f29-a4fa-13fe61298f4c",
  "type": "EXPENSE",
  "amount": 35000,
  "category_code": "EXP_FOOD",
  "transaction_date": "2026-11-16",
  "note": "Makan siang",
  "revision": 1,
  "created_at": "2026-11-16T05:00:00Z",
  "updated_at": "2026-11-16T05:00:00Z"
}
```

Kategori: `EXP_FOOD`, `EXP_TRANSPORT`, `EXP_SHOPPING`, `EXP_BILLS`, `EXP_ENTERTAINMENT`, `EXP_OTHER`; `INC_SALARY`, `INC_BONUS`, `INC_OTHER`. Mengubah type wajib menghasilkan category_code yang cocok pada resource akhir, termasuk pada PATCH.

Preferensi:

```json
{
  "budget_reminder": {"enabled": false, "time": "08:00"},
  "record_reminder": {"enabled": false, "time": "20:00"},
  "revision": 0
}
```

PUT mengirim `expected_revision`, bukan `revision`. Waktu `HH:mm`, 24 jam, jam lokal perangkat. Locale/timezone/currency adalah konstanta MVP dan tidak dapat diubah lewat request preferensi. Status izin OS dan notification ID tidak dikirim sebagai setting lintas perangkat.

## 3. Penyimpanan dan aturan replay

Satu spreadsheet privat. Satu tab sumber `LedgerEvents`. Setiap command mutasi yang valid ditulis sebagai satu baris append; update/delete menyimpan event baru, bukan menimpa riwayat. Ini pilihan implementasi untuk penyimpanan Sheets, bukan kebutuhan agar UI menampilkan event.

| Kolom | Tipe / makna |
|---|---|
| schema_version | integer, mulai 1 |
| operation_id | UUID dari Idempotency-Key |
| user_id | Firebase UID dari token |
| entity_type | TRANSACTION / BUDGET_DEFAULT / DAILY_BUDGET / PREFERENCES |
| entity_id | UUID transaksi; tanggal budget; `preferences` untuk preferensi |
| action | CREATE / UPSERT / UPDATE / DELETE sesuai entitas |
| expected_revision | revision yang diharapkan command |
| normalized_command_json | Request mutasi yang dinormalisasi secara deterministik, termasuk field PATCH yang benar-benar dikirim; tidak bergantung state terkini |
| payload_json | Snapshot lengkap resource calon state baru; delete payload berisi tombstone |
| semantic_hash | SHA-256 canonical JSON atas UID, target, action, expected_revision, normalized_command_json; mengecualikan timestamp audit dan snapshot hasil |
| submitted_at | UTC timestamp BE; replay command sama mempertahankan makna payload |

Tulis dengan literal/stringValue atau RAW sesuai API; jangan menginterpretasikan catatan sebagai formula. Header/schema divalidasi saat startup. Header salah, baris rusak, operation ID dengan payload berbeda, atau urutan sumber berubah harus menghasilkan error integritas yang jelas; jangan diam-diam menghasilkan angka keuangan.

Untuk PATCH, normalized_command_json membedakan field yang tidak dikirim dari field yang dikirim null. Gunakan JSON canonical dengan key terurut dan aturan normalisasi yang sama untuk hash/retry. Snapshot payload dibuat dari state revision yang diharapkan; timestamp created_at/updated_at ditetapkan server. Deduplikasi membandingkan normalized command/hash, bukan timestamp audit baru. Payload snapshot duplicate yang sah diabaikan bersama occurrence duplikat; occurrence pertama menjadi receipt. Validasi bahwa hash cocok dengan normalized command dan bahwa snapshot occurrence pertama sesuai perubahan terhadap state sebelum diterapkan.

Algoritme reducer yang wajib konsisten:

1. Baca baris sumber dalam urutan append, validasi schema dan payload.
2. Deduplikasi berdasarkan `(user_id, operation_id)`. Baris ulang dengan semantic_hash sama tidak diterapkan ulang. Hash berbeda adalah pelanggaran integritas.
3. Untuk occurrence pertama, periksa state entitas saat itu. Terapkan hanya bila `expected_revision` sama dengan revision state saat itu, serta aksi sesuai lifecycle. State belum pernah ada = revision 0.
4. Bila precondition tidak cocok, tandai operation `CONFLICT` dan abaikan perubahan state. Ini juga berlaku untuk append yang terlambat tiba setelah request timeout. Urutan row di sumber menentukan hasil, bukan timestamp perangkat.
5. Jika diterapkan, revision naik satu. DELETE meninggalkan tombstone beserta revision. ID transaksi yang pernah terhapus tidak boleh dipakai untuk create baru; gunakan UUID baru. Budget/preferensi dapat dibuat ulang dari tombstone dengan expected_revision terakhir, bukan 0.
6. Simpan receipt hasil pertama per operation saat replay agar replay request mengembalikan hasil yang sama, walaupun entitas kemudian berubah. Semua agregasi memakai state efektif terakhir yang tidak deleted, bukan seluruh event.

Prosedur command: verifikasi identitas → validasi body → cek idempotency sebelum cek revision baru → serialisasi writer → refresh state yang dibutuhkan → validasi precondition → append event → baca/replay hingga command terlihat → return receipt/resource dari reducer. Jangan memberikan 201 hanya berdasarkan jumlah baris bertambah.

Jika append timeout, return 202 `{operation_id,status:"UNKNOWN"}`. Status UNKNOWN berarti belum ditemukan/belum dapat dipastikan, bukan pasti gagal. FE memeriksa operation lalu retry **key dan body sama** dengan backoff; tidak membuat transaksi pengganti. Mutasi append dengan ID sama dapat meninggalkan baris fisik duplikat, tetapi reducer menerapkannya satu kali. API tidak menjanjikan exactly-once delivery ke Google; yang dijaga adalah satu penerapan efektif per operation. Jika konflik, FE fetch resource baru dan meminta pengguna meninjau sebelum aksi baru dengan key baru.

GET operation: 200 untuk APPLIED atau CONFLICT beserta receipt; 202 untuk UNKNOWN. Receipt hanya dapat diakses UID pemilik. Error request sebelum append tidak wajib memiliki event; FE menerima error HTTP definitif dan memperbaiki input.

Gunakan mutex aplikasi, satu worker, satu replica untuk MVP; tidak mengklaim dukungan distributed writer. Reducer revision tetap diperlukan walaupun writer diserialkan. Optimalkan batch/cache setelah correctness. Sheet ledger bertumbuh linear; ukur replay/latency sebelum menambahkan snapshot atau storage lain.

## 4. Tab pemeriksaan manusia

- `TransactionsView`: id, date, type, amount, category_label, note, revision, updated_at untuk state aktif.
- `BudgetsView`: entity_type, date/effective_from, amount, revision, updated_at.
- `PreferencesView`: jenis reminder, enabled, time, revision.
- `Metadata`: schema_version, projection_built_at, source_rows_processed, projection_status.

View diperbarui otomatis saat startup dan sesudah state ledger tervalidasi berubah, serta dapat dibangun ulang lewat perintah admin untuk perawatan. View tidak boleh menjadi write path FE. Retry latar belakang default setiap 30 detik memulihkan proyeksi gagal dan menangkap append UNKNOWN yang tiba terlambat. Bila view refresh gagal setelah event commit, respons transaksi tetap mengikuti receipt sumber. Tampilkan status proyeksi di Metadata, catat retry otomatis, dan sediakan status privat lewat GET `/storage/status`. Jangan rollback event hanya karena view gagal. Data API tidak boleh bergantung pada formula atau view ini.

Bootstrap hanya membuat tab/header yang belum ada; tolak schema tak dikenal; tidak clear/reset spreadsheet. Export/restore harus mempertahankan urutan ledger dan memverifikasi reducer. Uji restore pada spreadsheet test baru.

## 5. Struktur project usulan

```text
catat-harian/
  docs/                     # salinan lima dokumen rencana ini
  mobile/
    app/                    # routes Expo Router
    src/components/
    src/features/
    src/services/           # api, auth, notifications
    src/theme/
    src/types/
  backend/
    app/api/
    app/core/               # config, auth, errors
    app/schemas/
    app/services/           # domain, reducer, aggregations
    app/repositories/       # interface + Sheets implementation
    scripts/                # bootstrap, rebuild views, restore validation
    tests/
```

Nama env FE: `EXPO_PUBLIC_API_BASE_URL`. Firebase native config dan OAuth Android configuration mengikuti library yang dipilih; nama public config tambahan harus dicatat oleh implementasi. Nama env BE: `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `FIREBASE_PROJECT_ID`, `ALLOWED_FIREBASE_UID`, `APP_ENV`, `LOG_LEVEL`. Hindari mengisi secret di contoh. Dokumentasikan Android application ID, fingerprint development/release, serta asal credential tanpa menyalin private key ke repo.

## Status proyeksi laporan

GET `/api/v1/storage/status` memakai Firebase ID token/allowlist seperti endpoint privat lain.
Envelope `data` berisi `status` (OK/FAILED_RETRY_REQUIRED/PENDING),
`source_rows_processed`, `projected_rows_processed`, `projection_built_at`,
`last_error_code` dan `retry_after_seconds`. API keuangan tetap membaca ledger tervalidasi.
Kegagalan View tidak membatalkan receipt APPLIED. Freshness ini bukan jaminan Google
selalu tersedia; status tertinggal dapat diamati dan dipulihkan melalui retry.
