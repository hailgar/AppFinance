# Integrasi FE–BE — Catat Harian

16 November 2026 (WIB). Source terbaru: repository hailgar/AppFinance; baseline main
be3a811. Branch implementasi: feat/complete-mvp-integration. Status lintas tugas dan
commit ada di STATUS.md. Tidak ada ZIP lama yang menimpa kode repository.

## Implementasi

- Kategori FE membaca data.items sesuai FastAPI; seluruh mutasi mengirim stable
  Idempotency-Key dan revision bila diperlukan. Timeout tidak menjadi sukses palsu.
- Klien HTTP membatasi seluruh operasi token/fetch/body. Respons terlambat tidak
  memulai POST sesudah deadline. Satu refresh token 401, tanpa loop login pada403.
- Budget default/override, detail/edit/hapus, filter jenis/kategori/rentang tanggal,
  pagination, rincian bulanan, onboarding opsional dan reminder lokal tersedia.
- Token diikat ke UID sesi sebelum/sesudah refresh. Logout memakai pembatalan reminder
  dua tahap: batalkan jadwal dahulu, bersihkan preferensi/recovery setelah sign-out
  berhasil. Jadwal dan notifikasi yang sudah tampil dibersihkan menurut marker/UID;
  startup signed-out membersihkan orphan sebelum login berikutnya. Jika sign-out
  gagal, sesi yang masih aktif dapat memulihkan reminder.
- Views Sheets dibangun otomatis dari ledger tervalidasi saat startup/perubahan;
  retry latar belakang memulihkan View gagal serta append UNKNOWN yang terlambat.
  Receipt finansial tidak dibatalkan oleh kegagalan View. GET /storage/status privat
  dan kartu status laporan memperlihatkan freshness tanpa nominal keuangan.

## Bukti yang benar-benar dijalankan

| Pemeriksaan | Hasil |
|---|---|
| TypeScript / ESLint FE | Lulus exit0 |
| Vitest FE | 68 passed, 7 tes HTTP skipped pada mode unit |
| Pytest BE dengan requirements.lock | 57 passed, 1 Google-live skipped |
| HTTP klien FE → FastAPI aktual | 7 passed, auth/storage khusus tes |
| Validator konfigurasi Android | 19 passed; fixture validator tidak dipakai build |
| Expo compatibility offline | Exit0, memakai daftar SDK; validasi online tidak diklaim |
| Ekspor bundle Android Hermes | Exit0; google-services.json belum ada; bukan APK |
| Syntax Python/YAML/Bash workflow+Compose | Lulus; bukan eksekusi Docker/Gradle |
| Preflight native aktual | Tertahan karena konfigurasi HTTPS/Firebase/signing belum tersedia |

Satu warning deprecation Starlette/httpx tetap pada tes BE. Tidak ada private key/PAT
aktual dalam source terpilih; pemeriksaan pola bukan audit keamanan menyeluruh.

Tujuh tes HTTP meliputi kategori, perhitungan sisa budget/pemasukan, idempotent create,
receipt setelah respons putus, invalid amount/auth/UID, konflik stale revision,
override DELETE/recreate dengan tombstone revision, dan edit tanggal/jenis/filter
serta delete transaksi lewat CommandRunner. Tidak ada test double yang dijadikan
bukti persistence Firebase atau Google Sheets nyata.

## Mengulang pengujian

Node24 + npm ci pada mobile/, Python3.12 + requirements.lock BE diperlukan.
Gunakan virtual environment backend, lalu dari root repository:

```bash
python scripts/test_backend_contract.py backend
```

Runner memulai server fixture loopback baru pada127.0.0.1:8765, memakai clock tetap
2026-11-16, token tiruan dan repository memori; menjalankan tujuh tes lalu menghentikan
server. Jangan mengekspos fixture atau mengarahkannya ke data pribadi. Runtime produksi
selalu memakai Google Sheets dan Firebase, tanpa mode bypass autentikasi.

Pemeriksaan rutin:

```bash
cd mobile
npm run typecheck
npm run lint
npm test
```

```bash
cd backend
python -m pytest tests -q
```

Dari root: `python -m pytest scripts/tests -q` memeriksa19 tes validator Android
dan8 tes konfigurasi Azure.
Tes Google opt-in memerlukan Sheet test terpisah, credential backend dan token aktual;
lihat BACKEND_SETUP.md. APK/deploy memakai konfigurasi pada FRONTEND_SETUP.md dan
BACKEND_SETUP.md. Tidak ada biaya/layanan hosting baru yang dibuat otomatis.

## Penerimaan yang belum dapat dibuktikan

- Login Android → API HTTPS → Google Sheets nyata → reload dan login ulang.
- Docker image, host, certificate HTTPS dan restart persistence deployment nyata.
- APK development/preview yang ditandatangani dan dipasang.
- Emulator: belum tersedia, tidak ada tes native yang dijalankan.
- HP fisik: belum terhubung; belum ada bukti izin/notifikasi background, lock screen,
  offline, reboot, timezone, logout, TalkBack atau ukuran teks pada perangkat.

Permintaan konfigurasi/akses minimum dihimpun sekali dalam STATUS.md. Jangan mengirim
private key, token atau password melalui chat maupun repository publik.
