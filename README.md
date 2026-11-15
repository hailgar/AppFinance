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
Reminder lokal Android kini diimplementasikan; verifikasi pengiriman nyata pada HP masih diperlukan.

## Status yang sudah diverifikasi

- FE: typecheck, lint, 52 tes unit dan ekspor bundle Android lulus.
- Reminder: dua jadwal, izin/kanal, pengaturan offline, sinkronisasi preferensi,
  rekonsiliasi startup/resume, tap notifikasi, dan pembatalan logout sudah tersedia.
- BE: 52 tes lulus dengan `requirements.lock`; 1 tes Firebase/Sheets nyata dilewati.
- Integrasi HTTP: 7 tes klien FE terhadap FastAPI lulus dengan auth/storage khusus tes.
- Parser kategori FE diperbaiki untuk respons `data.items` dari backend.
- Workflow GitHub Actions tersedia untuk pemeriksaan FE, BE dan integrasi HTTP.
  Hasil eksekusi GitHub Actions diperiksa setelah push; pengujian lokal bukan bukti CI lulus.

**Belum diverifikasi:** login Google native, Google Sheets nyata, perangkat Android,
dan APK. Ekspor JavaScript/Hermes bukan APK. Frontend masih iterasi 1; editor budget,
detail/edit/hapus transaksi, beberapa filter dan onboarding belum lengkap. Reminder lokal memerlukan uji Android fisik.
Tidak ada deployment otomatis.

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
`npm test` biasa melewati lima tes HTTP kecuali env opt-in disediakan.

## Dokumen

- [PRD](docs/01_PRD.md)
- [Kontrak API dan data](docs/02_API_DAN_DATA.md)
- [OpenAPI](docs/openapi.json)
- [Hasil dan batas pengujian integrasi](docs/INTEGRATION.md)
- [Reminder Android dan matriks pengujian perangkat](docs/REMINDER_ANDROID.md)
- [Handoff backend](docs/HANDOFF_BACKEND.md)

Simpan `.env`, service-account key dan keystore di luar Git. Backend hanya menerima
UID Firebase yang diizinkan; tidak ada autentikasi bypass dalam runtime produksi.
