# Handoff Backend — Catat Harian v0.1

Tanggal: 16 November 2026 (WIB). Scope sesi: backend FastAPI dan integrasi Google Sheets.

## Implementasi

Backend berada di `backend/app/`. Entry point factory: `app.main:create_app`. Seluruh 18 operasi dalam kontrak tersedia. Domain/reducer terpisah dari repository Sheets. Penyimpanan runtime selalu Google Sheets; repository memori dan token tiruan hanya berada dalam tes.

`docs/openapi.json` diekspor dari FastAPI aktual. Kontrak v0.1 sumber tetap disertakan tanpa mengubah isinya. Resource budget menyertakan audit timestamp; respons preferensi hanya dua reminder dan revision.

Detail wire yang perlu dipakai FE:

| Operasi / kondisi | Bentuk data |
|---|---|
| GET categories/defaults/transactions | `{items:[...], next_cursor:null atau string}` |
| Monthly expenses_by_category | `[{category_code,category_label,amount}]`, kategori bernilai nol dihilangkan |
| GET effective dengan override aktif | `source=OVERRIDE`, `effective_from=null`, `override_revision=revision aktif` |
| GET effective sesudah override dihapus | fallback default/null, `override_active=false`, revision tombstone tetap dikirim |
| DELETE | query `expected_revision`, body kosong, header idempotency wajib |
| GET operation APPLIED | `operation_id,status,http_status,data` di dalam envelope `data` |
| GET operation CONFLICT | `operation_id,status,http_status,error` di dalam envelope `data` |
| GET operation UNKNOWN | HTTP 202, `{operation_id,status:"UNKNOWN"}` di dalam envelope `data` |

Normalisasi request mempertahankan presence PATCH: `note` absen berbeda dari `note:null`. Create menormalisasi note absen menjadi null. Header UUID dan ID transaksi dinormalisasi menjadi bentuk UUID standar huruf kecil. Semua nominal dan revision JSON wajib integer ketat. Key digunakan ulang hanya dengan target, aksi, dan body yang sama.

Contoh berurutan untuk integrasi FE:

1. Login Google lewat Firebase SDK Android, ambil Firebase ID token, GET `/me`.
2. PUT `/budgets/defaults/<hari_ini>` dengan amount 100000, expected_revision 0, key baru.
3. POST `/transactions` dengan UUID baru, EXPENSE 35000 EXP_FOOD tanggal hari ini, key baru.
4. GET `/dashboard?date=<hari_ini>` → remaining_amount 65000.
5. Jika POST timeout/202, GET `/operations/<key>`; retry key/body yang sama dengan backoff. Receipt bukan saldo/resource terbaru.
6. PATCH/DELETE memakai revision terakhir. Konflik 409 meminta review pengguna. Sesudah sukses, invalidasi cache hari/bulan lama dan baru bila tanggal/jenis berubah.

Reminder: API hanya menyimpan preferensi. FE tetap menangani notification permissions, jadwal sistem, rekonsiliasi, ID lokal, dan logout.

## Verifikasi yang diamati

- Python 3.12.14, virtual environment Linux terpisah dengan dependency dipin.
- `python -m pytest tests -q`: **52 passed, 1 skipped**. Tes integrasi Firebase/Sheets dilewati secara default. Ada satu warning deprecation dari test client httpx; tes tetap lulus.
- Skenario tercakup: perhitungan budget null/nol/over, pemasukan tidak menambah budget, budget historis, edit tanggal/jenis, delete, strict amount, batas WIB, owner/auth guard, paging, prefs, concurrency, timeout, physical duplicate, stale late append, replay restart, korupsi, prefix reorder, 429 mapping, bootstrap tanpa reset, backup/restore logic, dan projection failure.
- Mock adapter Firebase memverifikasi pemanggilan Admin SDK dengan `check_revoked=True`; tes ini bukan bukti login Firebase nyata.
- Tes opt-in nyata ada di `backend/tests/integration/test_google_live.py`. Wajib test sheet terpisah kosong, credential backend, dan Firebase ID token aktual.

## Yang belum dilakukan

- Belum ada credential, Firebase Project ID/UID, atau spreadsheet nyata yang dihubungkan di sesi ini.
- Belum ada write/read/restart terhadap Google Sheets nyata, restore nyata, atau pengujian login Firebase nyata.
- Belum ada hosting HTTPS, integrasi frontend, pengujian Android, atau build APK.
- Instruksi setup Mac/Windows tersedia, tetapi eksekusi tes sesi ini hanya di Linux.

Langkah penerusan: isi konfigurasi lokal dan siapkan spreadsheet test → bootstrap → jalankan tes opt-in Google → jalankan backend HTTPS/LAN development → integrasikan FE memakai OpenAPI → lanjut pengujian Android.

## Pemeriksaan lintas FE–BE

Lima tes klien FE lewat HTTP ke FastAPI lulus dengan fixture test terisolasi. Lihat `INTEGRATION.md`. Ini tidak menggantikan tes Google Sheets/Firebase nyata.

## Pembaruan implementasi v0.2

Lihat STATUS.md dan INTEGRATION.md untuk hasil terbaru:57 tes BE,7 tes HTTP, proyeksi Sheets otomatis dengan retry, status privat dan konfigurasi Docker. Catatan v0.1 di atas adalah baseline historis. Google nyata/Docker/TLS belum diverifikasi.
