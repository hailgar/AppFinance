> Pemeriksaan FE–BE terbaru: lihat [INTEGRATION.md](INTEGRATION.md).

> Persiapan Azure App Service F1 tersedia di [panduan deployment](../deploy/azure/README.md);
> login pengguna belum menemukan subscription yang dapat diakses. Penilaian Vercel
> ada di bagian akhir dokumen ini. Belum ada deployment yang berhasil.

# Catat Harian — Backend & Google Sheets v0.1

Implementasi backend berdasarkan `docs/01_PRD.md` dan `docs/02_API_DAN_DATA.md`: FastAPI, Firebase Authentication, dan ledger append-only Google Sheets. Paket ini berisi backend, tes, OpenAPI aktual, serta alat setup/perawatan. Frontend Android dan penjadwalan notifikasi dikerjakan di bagian proyek masing-masing.

Status verifikasi: **57 tes lulus, 1 tes integrasi Google dilewati** pada Python 3.12 di Linux, menggunakan virtual environment terpisah. Integrasi nyata Firebase/Sheets belum dijalankan karena belum ada konfigurasi akun dan spreadsheet. Belum ada deployment atau perubahan pada spreadsheet pengguna.

## Yang sudah diimplementasikan

- Seluruh 18 operasi API pada kontrak: akun/kategori, transaksi, dashboard, budget, ringkasan bulanan, preferensi, dan pemeriksaan operation.
- Validasi integer rupiah ketat, batas tanggal WIB, kategori sesuai jenis, note maksimal 200 karakter, dan reminder `HH:mm`.
- Budget historis default/override; pemasukan tidak menambah budget; budget null dan nol dibedakan.
- Auth Firebase ID token melalui Admin SDK dengan pemeriksaan revocation dan satu UID allowlist. Tidak ada mode login palsu di runtime.
- `Idempotency-Key`, revision conflict, receipt stabil setelah restart, tombstone, dan respons `202 UNKNOWN` untuk write yang belum pasti.
- Validasi ledger dan checkpoint lokal untuk mendeteksi perubahan/pemotongan/penukaran urutan sumber yang sudah pernah diobservasi.
- Mutex writer, lease proses lokal, cache baca singkat, backoff pembacaan, batas ukuran request dan rate limit.
- Bootstrap tanpa reset, ekspor JSON, validasi backup, restore ke test sheet terpisah yang kosong, dan rebuild tab pemeriksaan.

## 1. Persiapan lokal

Gunakan **Python 3.12**. Ekstrak paket, lalu masuk ke direktori `AppFinance/backend`. Dependency langsung ada di `requirements.in`; seluruh versi hasil resolusi, termasuk alat tes, ada di `requirements.lock`.

macOS/Linux:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
cp .env.example .env
```

Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
Copy-Item .env.example .env
```

Di Windows, jalankan perintah `python` berikut menggunakan `.\.venv\Scripts\python.exe` bila environment belum diaktifkan. Pengujian paket ini dilakukan di Linux; pemasangan di Mac/Windows belum diverifikasi langsung.

## 2. Siapkan Firebase dan spreadsheet test

1. Pada project Firebase milikmu, aktifkan Authentication → Google. Login Android nantinya menghasilkan **Firebase ID token**, bukan Google OAuth access token.
2. Catat Firebase Project ID dan UID akun pribadi dari Firebase Authentication → Users. Masukkan satu UID itu ke `ALLOWED_FIREBASE_UID`.
3. Aktifkan Google Sheets API pada project Google Cloud yang dipakai backend.
4. Siapkan service account backend. Gunakan ADC/managed identity pada hosting yang mendukungnya, atau simpan JSON credential di luar direktori proyek. Jangan menaruh private key di APK, repo, maupun chat.
5. Buat **spreadsheet test privat terlebih dahulu**. Beri service account akses Editor hanya pada spreadsheet yang diperlukan. Salin ID dari URL `/spreadsheets/d/<ID>/edit`.
6. Service account juga memerlukan izin pemeriksaan user Firebase untuk `check_revoked=True`, misalnya role Firebase Authentication Viewer pada project Firebase terkait; gunakan hak minimum yang sesuai.
7. Isi `.env` lokal dari contoh. `GOOGLE_APPLICATION_CREDENTIALS` dapat berupa path absolut di `.env`; kode membacanya langsung, tanpa perlu mengekspor variabel global. Pada Windows gunakan path dengan garis miring `/` dalam file `.env`.

Variabel utama:

| Nama | Nilai yang perlu diisi |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path JSON backend; hapus bila menggunakan managed ADC |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID spreadsheet test untuk setup awal |
| `FIREBASE_PROJECT_ID` | Firebase Project ID |
| `ALLOWED_FIREBASE_UID` | Satu UID Firebase akunmu |
| `LEDGER_CHECKPOINT_PATH` | File checkpoint pada direktori yang persisten |
| `APP_ENV`, `LOG_LEVEL` | Awal: `development`, `INFO` |

Tidak ada credential contoh yang dapat dipakai untuk login. Startup gagal bila konfigurasi, akses, atau schema ledger belum benar; aplikasi tidak beralih ke penyimpanan memori.

## 3. Bootstrap dan jalankan

Semua perintah berikut dijalankan dari `backend/`.

```bash
python -m scripts.admin bootstrap
python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

Bootstrap hanya membuat tab/header yang belum ada dan menolak schema yang tidak dikenal. Tab sumber `LedgerEvents` menyimpan event. `TransactionsView`, `BudgetsView`, `PreferencesView`, dan `Metadata` merupakan turunan untuk pemeriksaan manusia.

- Swagger: `http://127.0.0.1:8000/docs`
- Health publik: `http://127.0.0.1:8000/api/v1/health/live`
- OpenAPI: `docs/openapi.json`; regenerasi dengan `python -m scripts.export_openapi`.
- Swagger → Authorize: masukkan Firebase ID token dari akun yang UID-nya diizinkan.

Untuk pengujian Android pada LAN sendiri, server dapat dijalankan dengan `--host 0.0.0.0`; FE memakai IP LAN komputer dan port 8000. `localhost` pada HP menunjuk HP itu sendiri. Kebutuhan Android untuk HTTP development mengikuti konfigurasi frontend. Akses nonlokal harus melalui HTTPS. Hosting backend belum disiapkan dalam paket ini.

## 4. Alur FE

Base: `/api/v1`. Endpoint privat memakai `Authorization: Bearer <Firebase-ID-token>`. Semua mutasi memakai `Idempotency-Key: <UUID>` yang tetap untuk satu aksi logis.

Contoh body POST `/transactions`:

```json
{
  "id": "3354c920-9734-4f29-a4fa-13fe61298f4c",
  "type": "EXPENSE",
  "amount": 35000,
  "category_code": "EXP_FOOD",
  "transaction_date": "2026-11-16",
  "note": "Makan siang"
}
```

Tanggal contoh harus diganti dengan tanggal bisnis yang valid saat mencoba. Detail endpoint dan respons ada di `docs/02_API_DAN_DATA.md` dan OpenAPI. Petunjuk integrasi ada di `docs/HANDOFF_BACKEND.md`.

- `201`: create pertama yang dikonfirmasi reducer; `200`: baca/update/delete/replay.
- `202 UNKNOWN`: pertahankan key dan body; periksa `/operations/{key}`. Jangan membuat transaksi pengganti.
- `409`: fetch resource terbaru dan minta pengguna meninjau; aksi baru menggunakan key baru.
- Setelah perubahan, refresh dashboard, daftar/detail transaksi, ringkasan bulan yang terpengaruh, atau budget/preferensi sesuai aksi.
- Receipt replay dapat berisi revision lama karena mewakili hasil aksi pertama; fetch resource terbaru untuk tampilan terkini.
- Preferensi hanya menyimpan jadwal yang diinginkan. Penjadwalan notifikasi dan izin OS tetap milik Android.

## 5. Pengujian

```bash
python -m pytest tests -q
python -m pip check
```

Tes default menggunakan test double yang hanya ada di direktori tes. Tes mencakup API, validasi, isolasi owner, auth adapter, concurrency, replay setelah restart, idempotency, timeout/late append, konflik, korupsi, quota mapping, bootstrap, backup/restore, dan kegagalan proyeksi. Test double tidak membuktikan persistensi layanan Google.

Tes Google nyata memerlukan **test sheet baru yang kosong dan berbeda dari spreadsheet konfigurasi utama**, Firebase ID token valid dari UID yang diizinkan, dan konfigurasi service account. Tes meninggalkan event agar hasilnya dapat diperiksa; tidak menghapus ledger. Aktifkan hanya saat siap:

macOS/Linux:

```bash
export RUN_SHEETS_INTEGRATION=1
export TEST_GOOGLE_SHEETS_SPREADSHEET_ID='<separate_empty_test_sheet_id>'
read -r -s -p 'Firebase ID token: ' TEST_FIREBASE_ID_TOKEN
export TEST_FIREBASE_ID_TOKEN
python -m pytest tests/integration -q
unset TEST_FIREBASE_ID_TOKEN
unset RUN_SHEETS_INTEGRATION
```

Masukkan token lewat input privat atau mekanisme secret lokal. Jangan menaruh token dalam source code atau log. PowerShell dapat mengatur tiga variabel process environment yang sama melalui mekanisme secret lokal, lalu menjalankan perintah pytest yang sama. Tes real auth/Sheets dilewati pada pengujian sesi pembuatan paket.

## 6. Perawatan dan restore

**Hentikan backend sebelum menjalankan perawatan**. API dan perintah admin menggunakan lease lokal yang sama. Jangan sort, edit, atau hapus baris sumber secara manual; koreksi melalui API. Batasi editor dan aktifkan proteksi tab/range ledger pada Google Sheets secara manual.

Validasi dan bangun tab pemeriksaan:

```bash
python -m scripts.admin validate
python -m scripts.admin rebuild-views
```

Views otomatis diperbarui saat startup dan perubahan state ledger. Kegagalan proyeksi tidak mengubah transaksi APPLIED; Metadata menyimpan kegagalan bila masih dapat ditulis. Background retry (PROJECTION_RETRY_SECONDS=30, rentang 5–300) memperbaiki View tanpa transaksi baru dan menangkap append terlambat. GET /api/v1/storage/status memperlihatkan freshness pada akun terautentikasi. Rebuild manual tetap tersedia untuk perawatan saat backend dihentikan; jangan mengulang transaksi hanya karena View tertinggal.

Backup menggunakan JSON agar teks seperti `=SUM(...)` tetap literal dan urutan ledger terjaga. Siapkan direktori backup privat di luar repo, kemudian:

```bash
python -m scripts.admin export --output /absolute/private/path/ledger-backup.json
python -m scripts.admin verify-backup --input /absolute/private/path/ledger-backup.json
```

Export menolak menimpa file yang sudah ada. JSON ini memuat data pribadi; simpan bersama credential dengan akses terbatas. API dan views menulis teks dengan RAW/stringValue. Ekspor CSV tidak disediakan.

Untuk latihan restore, buat spreadsheet test baru yang berbeda dari sumber backup **dan** spreadsheet konfigurasi utama, bagikan ke service account, lalu:

```bash
python -m scripts.admin restore --input /absolute/private/path/ledger-backup.json --target-spreadsheet-id '<new_empty_test_sheet_id>' --confirm-empty-test-target
```

Restore hanya menerima ledger target kosong, mempertahankan urutan, memverifikasi hash dan replay sesudah tulis, serta tidak mengubah sumber atau checkpoint sumber. Restore otomatis dibatasi 1,5 MB per backup. Hasil timeout restore harus diperiksa di target terlebih dahulu; jangan append ulang secara buta. Setelah restore, gunakan konfigurasi/checkpoint terpisah untuk memvalidasi dan membangun views target. Pergantian sumber produksi membutuhkan keputusan terpisah.

## 7. Batas operasional

- Wajib **satu worker dan satu replica**. Lease hanya melindungi proses pada host/path yang sama; tidak menyediakan koordinasi terdistribusi. Jangan menambah instance melalui autoscaling.
- Pertahankan direktori `data/` atau lokasi checkpoint khusus pada persistent volume. Jangan menggunakan satu checkpoint untuk dua spreadsheet.
- Checkpoint mendeteksi perubahan pada prefix yang telah diamati. Pada bootstrap pertama tanpa anchor, histori yang valid secara schema dipercaya; tidak ada jaminan mendeteksi susunan lama sebelum anchor pertama dibuat. Proteksi sumber dan backup tetap diperlukan.
- Cache maksimal 2 detik secara default; mutasi dan pemeriksaan operation selalu membaca ulang. Tidak ada snapshot pagination antarrequest. Refresh daftar bila data berubah.
- Seluruh ledger direplay pada refresh. Pantau `ledger_replay rows/duration_ms` dan latensi request sebelum menambah snapshot atau berpindah storage.
- Rate limit dihitung per IP untuk satu instance. Bila memakai reverse proxy, batasi port backend dan konfigurasikan trusted proxy secara eksplisit agar IP tidak dapat dipalsukan.
- Runtime log mencatat request ID, template route, status, durasi, dan jumlah baris; tidak mencatat token atau catatan transaksi. Jalankan uvicorn dengan `--no-access-log` seperti contoh.
- Tidak ada klaim exactly-once delivery Google. Baris duplikat mungkin ada; reducer menjaga satu penerapan efektif per operation.
- Tidak ada scheduler Android di backend, dukungan offline transaksi, atau penyimpanan Firestore. SDK Firebase membawa dependency Google lain; aplikasi ini hanya memakai Authentication.

## Dasar teknis

- [Sheets values append](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)
- [Sheets RAW value input](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption)
- [Sheets API limits](https://developers.google.com/workspace/sheets/api/limits)
- [google-auth AuthorizedSession](https://google-auth.readthedocs.io/en/latest/reference/google.auth.transport.requests.html)
- [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebase session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions)

## Hosting internal yang sudah tersedia

Konfigurasi provider netral tersedia di `backend/Dockerfile`, `deploy/compose.yaml`,
dan `deploy/Caddyfile`. Tidak ada provider/VM/layanan berbayar yang dibuat oleh sesi ini.
Image belum dibangun karena Docker tidak tersedia dalam lingkungan pemeriksaan.

Prasyarat: host Linux yang sudah tersedia dengan Docker Compose, domain DNS ke host,
port 80/443 dapat diakses, serta Firebase project/UID dan spreadsheet test privat yang benar.
Gunakan satu instance dan satu worker. Named volume `ledger-data` menyimpan checkpoint
melintasi restart; jangan menjalankan replica kedua atau membuang volume untuk reset.

Pada host tersebut, dari root repository:

```bash
cp deploy/.env.example deploy/.env
# Isi konfigurasi lokal, simpan credential JSON di luar repository.
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml build backend
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps backend python -m scripts.admin bootstrap
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d
```

Credential dimount sebagai `/run/secrets/google-credentials.json` hanya-baca. Container
berjalan sebagai UID/GID 10001; file-backed Compose secrets dapat mempertahankan izin host.
Pastikan file dapat dibaca oleh UID 10001 tanpa membuka akses umum, sesuai kebijakan host.
Jangan menaruh private key di image atau `.env` publik. Hanya proxy mengekspos port host.
Caddy mengurus HTTPS untuk hostname yang benar; TLS/ACME baru dapat diverifikasi pada host.

Verifikasi health HTTPS, token tidak valid (401), UID lain (403), satu transaksi dengan
akun yang diizinkan, View+Metadata, restart, dan baca ulang; gunakan Sheet test terpisah.
Belum ada URL deployment atau bukti pemeriksaan ini dalam sesi sekarang.

Referensi resmi: https://caddyserver.com/docs/quick-starts/reverse-proxy


## Penilaian Vercel — 16 November 2026 WIB

Pengguna meminta pemeriksaan Vercel karena sudah menggunakan provider tersebut.
Dokumentasi resmi mendukung FastAPI/Python sebagai Vercel Function. Dukungan framework
belum berarti backend ini memenuhi model eksekusinya. Belum ada deployment Vercel,
resource storage, upgrade plan atau secret baru yang dibuat pada pemeriksaan ini.

| Bagian | Source sekarang | Dampak pada Vercel / tindak lanjut |
|---|---|---|
| Entrypoint | app/main.py mengekspor factory create_app, belum instance app ASGI | Siapkan entrypoint setelah runtime aman; jangan deploy factory sebagai instance |
| Checkpoint | repositories/checkpoint.py memakai file atomik/fsync/replace | Filesystem Function read-only selain /tmp; file sementara tidak menggantikan anchor durable lintas instance/deployment |
| Writer | ProcessLease berbasis flock/msvcrt lokal dan LedgerService RLock | Satu Function dapat memiliki banyak instance. Perlu koordinasi penulisan lintas instance yang terbukti aman, atau deployment penulis tunggal terpisah |
| Laporan | Lifespan task retry default30detik dan state manager dalam memori | Tidak boleh menganggap loop akan hidup ketika tidak ada invocation. Perlu pekerjaan durable/terjadwal dengan perilaku retry yang setara |
| Google credential | Path certificate atau ADC; file di luar repo | Perlu mekanisme secret runtime dan identitas Google berizin minimum; jangan menaruh JSON key di source/build output |
| Rate limit | Window per IP di memori proses | Bukan limiter global saat ada beberapa instance; tinjau batas platform/koordinasi |

Blob privat tersedia pada Hobby dengan kuota penggunaan; conditional write ifMatch
memungkinkan pemeriksaan ETag. Ini kandidat penyimpanan checkpoint, bukan bukti bahwa
lease, fencing, append UNKNOWN, monotonisitas anchor dan urutan proyeksi sudah aman.
Hobby Blob berhenti dapat diakses saat kuota terlampaui; quota failure harus menjadi
error terkontrol, bukan sukses finansial palsu. Jangan menghapus lease/checkpoint atau
mengandalkan /tmp agar health terlihat lulus. Google Sheets tetap sumber ledger;
penambahan penyimpanan pendukung perlu rancangan dan pengujian yang jelas.

Daemons saat diperiksa tidak menyediakan filesystem persisten atau inbound HTTP;
bukan pengganti langsung API satu worker ini. Drives ditujukan untuk Sandbox, sehingga
bukan disk persisten yang otomatis terpasang ke Function aplikasi.

Bukti lokal khusus penilaian (test adapters, bukan runtime Vercel/Google):

- pytest tests/test_ledger.py::test_snapshot_corruption_and_reordered_source
  tests/test_projections.py -q: 6 passed, 1 warning Starlette/httpx.
- Simulasi dua direktori instance: anchor lama mendeteksi truncation; direktori baru
  belum mempunyai anchor; kedua lease lokal dapat diperoleh bersamaan. Ini menunjukkan
  mengapa memindahkan path ke /tmp tidak memenuhi jaminan durable/single writer.
- Tidak ada tes Firebase/Sheets nyata, kompilasi APK atau deployment yang dijalankan.

Akses akun terbaru: plugin sudah terhubung; akun dol-men (Hobby active), team DOL
(dol3) terbaca. Tidak ada project sesuai hasil filter repository AppFinance/nama catat.
Percobaan create-project static catat-harian-ui-preview ditolak403 forbidden:
"You don't have permission to create the project." Project/deployment tidak dibuat;
CLI Vercel terautentikasi juga tidak tersedia. Izin tulis/project perlu diselesaikan
sebelum URL preview dapat disediakan. Billing/kuota team tidak dianggap terverifikasi.
Koneksi berhasil dibaca tidak berarti izin membuat project tersedia. Preview browser
mandiri di mobile/preview hanya memakai fixtures, tidak menjalankan backend di Vercel.

Referensi resmi:

- https://vercel.com/docs/frameworks/backend/fastapi
- https://vercel.com/docs/functions/runtimes
- https://vercel.com/docs/vercel-blob
- https://vercel.com/docs/vercel-blob/usage-and-pricing
- https://vercel.com/docs/vercel-blob/private-storage
- https://vercel.com/daemons
- https://vercel.com/blog/introducing-vercel-drives-persistent-storage-for-agents
