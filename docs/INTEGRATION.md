# Integrasi FE–BE — Catat Harian

16 November 2026 (WIB). Sumber: ZIP Frontend Iterasi 1 dan Backend v0.1.

## Hasil dan perbaikan

Form transaksi FE sebelumnya membaca GET /categories sebagai Category[].
BE mengirim envelope data.items; kode map/some pada form akan gagal saat respons nyata tiba.
FE sekarang mengambil data.items lewat services/resources.ts. Ada tes regresi dan tes HTTP lintas FE–BE.
Tipe monthly summary dan operation disamakan dengan OpenAPI BE, tanpa mengubah wire API.

Source digabungkan dalam repository hailgar/AppFinance: mobile/, backend/, docs/, scripts/.
Jalankan perintah dari root repository ini kecuali disebutkan lain.
Jangan mengunggah node_modules, .env, private key, keystore, data runtime, atau dist.
Workflow .github/workflows/frontend.yml dan backend.yml memeriksa FE dan BE sesudah push/PR; integration.yml menjalankan tujuh tes kontrak HTTP.
Workflow belum dijalankan di GitHub. Tidak ada deployment otomatis atau build cloud berbayar.

## Pemeriksaan aktual

| Pemeriksaan | Hasil |
|---|---|
| Backend pytest | 52 passed, 1 skipped (Firebase/Sheets nyata), 1 warning deprecation |
| FE TypeScript dan ESLint | Lulus, exit 0 |
| FE unit tests | 26 passed; 5 tes integrasi dilewati pada mode biasa |
| FE client ↔ FastAPI lewat HTTP | 5 passed dengan fixture test, lihat batasan di bawah |
| Expo compatibility | Exit 0, memakai daftar kompatibilitas offline SDK |
| Ekspor bundle Android | Lulus, exit 0; peringatan google-services.json belum tersedia |
| Pemindaian pola private key/PAT | Tidak ditemukan pada source terpilih; bukan audit keamanan lengkap |
| Firebase native / Google Sheets nyata | Belum diuji, konfigurasi/kredensial belum tersedia |
| Build APK dan Android fisik | Belum dilakukan; ekspor bundle bukan APK |
| Push GitHub | Source disiapkan untuk branch main hailgar/AppFinance; status push diverifikasi sesudah unggah |

Backend dipasang ulang ke virtual environment terpisah memakai requirements.lock tanpa perubahan versi.
52 tes BE dan lima tes HTTP kembali lulus pada dependency terkunci tersebut.

Lima tes HTTP awal mencakup:
1. Kategori pengeluaran/pemasukan dari data.items dapat dipakai sebagai array oleh FE.
2. Budget 100000, pengeluaran 35000, pemasukan 200000 menghasilkan sisa 65000;
   retry key/body sama menghasilkan satu transaksi efektif; riwayat/ringkasan sesuai.
3. Respons POST hilang sesudah commit: CommandRunner memulihkan lewat operation receipt,
   hanya satu POST dikirim dan pending command dibersihkan setelah konfirmasi.
4. Nominal string ditolak 422, token salah 401, akun lain 403.
5. PATCH dengan revision lama ditolak 409 dan nominal tidak berubah.

## Mengulang tes kontrak di komputer pengembangan

Butuh Python 3.12 dengan requirements.lock BE terpasang dan Node 24 dengan npm ci FE selesai.
Gunakan lingkungan virtual backend untuk menjalankan Python. Fixture ini hanya untuk tes:
clock WIB tetap 2026-11-16, token tiruan, repository memori. Jangan mengekspos server ke jaringan
publik atau menggunakannya dengan data pribadi. Startup BE produksi tetap memakai Google Sheets
serta verifikasi Firebase; tidak ada mode auth bypass dalam entry point produksi.

Pilihan satu perintah, dari root AppFinance:

```bash
python scripts/test_backend_contract.py backend
```

Script memulai fixture baru, menunggu health check, menjalankan lima tes, lalu menghentikan server.
Script ini diuji di Linux. Pilihan dua terminal tetap tersedia di bawah.

Terminal pertama, dari root AppFinance:

```bash
cd backend
python -m tests.serve_mobile_contract
```

Terminal kedua, dari root AppFinance:

```bash
cd mobile
CATAT_INTEGRATION_BASE_URL=http://127.0.0.1:8765/api/v1 npx vitest run src/__tests__/backend.integration.test.ts
```

PowerShell, pada terminal kedua:

```powershell
cd mobile
$env:CATAT_INTEGRATION_BASE_URL = 'http://127.0.0.1:8765/api/v1'
npx vitest run src/__tests__/backend.integration.test.ts
Remove-Item Env:CATAT_INTEGRATION_BASE_URL
```

Mulai fixture baru untuk setiap pengulangan suite agar data kosong. Hentikan dengan Ctrl+C.
Tanpa env opt-in, npm test melewati lima tes HTTP. Suite menolak URL selain fixture loopback;
suite ini tidak boleh diarahkan ke data Google Sheets nyata. Tes unit BE tetap mencakup reducer,
replay restart, concurrent requests dan late append; tes HTTP ini tidak menguji restart Google Sheets.

## Yang masih diperlukan sebelum APK penerimaan

- Konfigurasi Firebase Android, Web OAuth client ID, signing SHA-1/SHA-256,
  dan UID pengguna yang sama di allowlist FastAPI.
- Sheet test privat terpisah, credential backend, bootstrap, dan tes opt-in Google
  sesuai README backend. Credential tidak disalin ke FE atau repository.
- URL BE HTTPS yang terjangkau HP; EXPO_PUBLIC_API_BASE_URL menyertakan /api/v1.
- Implementasi FE budget editor, edit/hapus/detail, filter dan onboarding yang masih
  tercatat sebagai gap iterasi 1. Pengaturan budget pada tes lewat API bukan bukti editor FE selesai.
- Reminder lokal kini diimplementasikan; izin, penjadwalan, rekonsiliasi dan logout
  diuji pada controller/adapter, tetapi pengiriman/reboot memerlukan Android nyata.
  Lihat [handoff reminder](REMINDER_ANDROID.md).
- Build development/preview, uji login native, ukuran teks, TalkBack, koneksi putus,
  dan notifikasi pada HP fisik. Profil EAS sudah ada, belum dijalankan.

Kode diperiksa pada Linux; perintah Windows/Mac terdokumentasi tetapi belum dieksekusi di perangkat itu.

## Pembaruan reminder Android

Dua tes HTTP preferensi ditambahkan dan lulus: recovery PUT sesudah respons hilang
dan konflik revision saat pengaturan offline bertemu perubahan server. Total suite
HTTP sekarang 7 tes. Tabel awal di atas merekam pemeriksaan integrasi sebelum
iterasi reminder; hasil FE terbaru 52 unit lulus, typecheck/lint dan ekspor Android lulus.
