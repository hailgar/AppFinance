# Catat Harian — AppFinance

Aplikasi Android pribadi untuk mencatat pemasukan/pengeluaran, mengatur budget
harian, dan reminder pencatatan. UI berbahasa Indonesia; pembukuan memakai WIB.

## Struktur dan stack

| Direktori | Isi |
|---|---|
| `mobile/` | React Native, Expo development build, TypeScript, Firebase Google Sign-In |
| `backend/` | FastAPI, Firebase token verification, Google Sheets append-only ledger |
| `docs/` | PRD, kontrak API, OpenAPI, setup dan hasil pengujian |
| `scripts/` | Runner tes integrasi FE–BE |

FE mengakses FastAPI; hanya backend yang mengakses Google Sheets.
Reminder dijadwalkan lokal di Android; konfirmasi pengiriman pada HP fisik masih diperlukan.

## Status yang sudah diverifikasi

- FE: typecheck, lint,68 tes unit,4 tes guard native dan ekspor bundle Android lulus.
- BE:58 tes lulus dengan `requirements.lock`;1 tes Firebase/Sheets nyata dilewati.
- Integrasi HTTP: 7 tes klien FE terhadap FastAPI lulus dengan auth/storage khusus tes.
- Parser kategori FE diperbaiki untuk respons `data.items` dari backend.
- Workflow GitHub Actions tersedia untuk pemeriksaan FE, BE dan integrasi HTTP.
  Hasil eksekusi GitHub Actions diperiksa setelah push; pengujian lokal bukan bukti CI lulus.

**Status terbaru:** lihat [docs/STATUS.md](docs/STATUS.md). Budget default/override,
detail/edit/hapus transaksi, filter, rincian kategori, pengenalan dan reminder lokal sudah
diimplementasikan pada branch pekerjaan. Views Sheets kini diperbarui otomatis dengan retry.
Login Google native, Google Sheets nyata, deployment HTTPS, perangkat Android dan APK
masih membutuhkan konfigurasi/akses yang disebutkan pada status. Ekspor JavaScript/Hermes bukan APK.
Tidak ada deployment atau resource berbayar baru yang dibuat otomatis.

## Menjalankan dan menguji

Backend memerlukan Python 3.12. Dari root repository:

```bash
cd backend
python -m venv .venv
# Aktifkan virtual environment sesuai OS, lalu:
python -m pip install -r requirements.lock
python -m pytest tests -q
```

Untuk backend nyata, isi `.env` dari `.env.example`, siapkan Firebase/Sheet privat,
bootstrap ledger, lalu jalankan satu worker. Ikuti [setup backend](docs/BACKEND_SETUP.md).

Frontend memerlukan Node 24, npm, dan konfigurasi native Firebase untuk dijalankan di Android:

```bash
cd mobile
npm ci
npm run check:native
npm run typecheck
npm run lint
npm test
```

Ikuti [setup frontend](docs/FRONTEND_SETUP.md) untuk Google Sign-In, env, Android SDK,
dan profil build APK. Base URL FE harus menyertakan `/api/v1`.

Dari root repository, gunakan Python environment backend untuk menjalankan suite HTTP terisolasi:

```bash
python scripts/test_backend_contract.py backend
```

Runner memulai fixture loopback baru, menjalankan tujuh tes, lalu menghentikannya.
Fixture memakai token tiruan dan storage memori; tidak mengakses data Google nyata.
`npm test` biasa melewati tujuh tes HTTP kecuali env opt-in disediakan.

## Dokumen

- [PRD](docs/01_PRD.md)
- [Kontrak API dan data](docs/02_API_DAN_DATA.md)
- [OpenAPI](docs/openapi.json)
- [Hasil dan batas pengujian integrasi](docs/INTEGRATION.md)
- [Handoff backend](docs/HANDOFF_BACKEND.md)
- [Status dan pembagian pekerjaan](docs/STATUS.md)
- [Aturan kerja](AGENTS.md)

Simpan `.env`, service-account key dan keystore di luar Git. Backend hanya menerima
UID Firebase yang diizinkan; tidak ada autentikasi bypass dalam runtime produksi.

## Melihat tampilan

`mobile/preview` merender tujuh layar asli melalui React Native Web. Data contoh
ditandai permanen; login, Sheets, backend dan notifikasi Android tidak terhubung.
Jalankan `npm ci --prefix mobile/preview`, lalu
`npm run build:standalone --prefix mobile/preview` setelah dependency mobile dipasang.
File `mobile/preview/dist/catat-harian-preview.html` dapat diunduh dari artifact
Frontend checks. Instruksi dan setting hosting static di
[README preview](mobile/preview/README.md). Ini bukan APK atau bukti integrasi Google.

### Desain refined

Desain yang disetujui pada 16 November 2026 diterapkan pada source Android:
angka budget lebih tegas, baris transaksi berikon, pilihan jenis/kategori yang ringkas,
dan navigasi dengan penanda aktif. Preview memakai komponen layar yang sama dan
font ikon lokal; banner data contoh tetap terlihat. Status push/CI mengikuti PR desain,
sementara penerimaan Google/Android nyata tetap dicatat terpisah di docs/STATUS.md.
