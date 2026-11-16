# Hosting pengujian gratis: Azure App Service F1

Pilihan ini mempertahankan FastAPI, satu proses penulis dan checkpoint persisten.
Microsoft mendokumentasikan F1 seharga $0 dengan 60 menit CPU/hari, RAM 1 GB dan
penyimpanan 1 GB. F1 untuk pengujian/eksperimen, tanpa SLA atau jaminan selalu aktif.
Jika kuota habis atau region/subscription tidak menyediakan F1, hentikan setup.
Jangan menggantinya otomatis dengan Basic, trial kredit atau layanan berbayar.

Template hanya membuat App Service Plan **F1** dan satu web app Linux. Tidak membuat
database, Key Vault, Application Insights, registry, VM atau domain berbayar.
Nama web app dibatasi 55 karakter agar tambahan `-free` pada nama plan tetap
memenuhi batas 60 karakter Azure App Service Plan.
Gunakan HTTPS bawaan `azurewebsites.net`, bukan domain sendiri. Akun Azure dengan
subscription aktif tetap diperlukan; verifikasi akun dapat meminta metode pembayaran.
Jangan mengaktifkan upgrade berbayar tanpa keputusan pengguna.

## Konfigurasi Google

1. Buat/pilih Firebase project pada paket Spark. Aktifkan Google Sign-In. Firebase
   digunakan untuk login saja; data keuangan tetap di Google Sheets.
2. Aktifkan Google Sheets API pada project dan siapkan identitas backend. Bagikan
   hanya spreadsheet yang dipakai kepada email service account tersebut sebagai Editor.
3. Mulai dari spreadsheet pengujian. Gunakan UID akun pemilik untuk allowlist backend.
4. Untuk Android, register package `id.catatharian.app`, SHA-1/SHA-256 signing stabil,
   lalu ambil Web OAuth client ID dan `google-services.json` yang sesuai.

File database pribadi dan pengujian telah dibuat di Drive. Tautan/ID spreadsheet
disampaikan privat dalam percakapan; tidak dicantumkan di repository publik.
Tab wajib: LedgerEvents, TransactionsView, BudgetsView, PreferencesView, Metadata.
Panduan adalah tab tambahan untuk pemilik; backend mengabaikannya. Jangan menambah
data contoh ke database pribadi atau mengubah header yang dibaca backend.

## Jika login browser kedaluwarsa

Jika Microsoft menampilkan session has timed out, hentikan flow/kode lama.
Di sesi ini satu portal baru juga kembali meminta login; belum ada bukti Azure login
berhasil. Tidak menganggap timeout sebagai blok bot atau kesalahan kode aplikasi.

Alternatif resmi untuk komputer pengguna yang sudah memasang Azure CLI:

```bash
az login --use-device-code
az account show --query '{name:name,state:state}' --output json
```

Ikuti alamat dan kode yang ditampilkan oleh Azure CLI milik sendiri, kemudian
selesaikan verifikasi Microsoft di browser. Jalur ini alternatif autentikasi,
bukan jaminan memperbaiki masalah akun; subscription aktif tetap diperlukan.
Login tersebut hanya mengotorisasi CLI pada komputer yang menjalankannya, bukan
browser/cloud workspace koordinator. Deployment kemudian dapat dijalankan dari
checkout repository pada komputer tersebut dengan langkah di bawah. Jangan
menyalin token, kode login, cache autentikasi atau password ke chat/source.

Referensi: https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli-interactively

## Provisioning dan deploy setelah akun tersedia

Gunakan Azure CLI resmi dengan login akun pengguna. Parameter rahasia disimpan
dalam file lokal **di luar repository**, dalam format ARM deployment parameters.
Isi `firebaseProjectId`, `allowedFirebaseUid`, `spreadsheetId`, dan
`googleServiceAccountJson` (string JSON service account). Jangan kirim file ini ke chat,
commit, atau tampilkan nilainya di log. Pilih nama resource group dan region F1 tersedia.

```bash
az login
az group create --name catat-harian-test --location southeastasia
az deployment group what-if --resource-group catat-harian-test \
  --template-file deploy/azure/main.json --parameters @/private/catat-parameters.json
az deployment group create --resource-group catat-harian-test \
  --template-file deploy/azure/main.json --parameters @/private/catat-parameters.json
python deploy/azure/package_backend.py --output /tmp/catat-backend.zip
# APP_NAME diambil dari output deployment, jangan memakai nama tebakan.
az webapp deploy --resource-group catat-harian-test --name "$APP_NAME" \
  --src-path /tmp/catat-backend.zip --type zip
az webapp show --resource-group catat-harian-test --name "$APP_NAME" \
  --query defaultHostName --output tsv
```

Periksa hasil `what-if` dan SKU F1 sebelum create. Contoh region bukan bukti
ketersediaan. Tidak membeli domain atau fallback ke SKU lain. Azure memerlukan
dependency install dari requirements.lock melalui requirements.txt dalam ZIP.
Startup memakai Python 3.12, satu uvicorn worker, checkpoint di `/home/catat-data/`.
Credential dibuat sebagai file sementara mode 0600 dari App Settings saat startup.
Path checkpoint harus absolut dan menunjuk file di bawah direktori tersebut,
bukan direktori itu sendiri. Packager menolak menimpa file output yang sudah ada;
gunakan nama ZIP baru atau hapus hanya artifact lama yang memang ingin diganti.

Periksa health `/api/v1/health/live`, lalu uji login, tambah/edit/hapus dan reload
menggunakan Firebase serta Sheet pengujian nyata. Restart web app dan verifikasi
ledger, receipt/idempotency, serta checkpoint tetap benar. Startup gagal bila header
atau akses Google salah. Jangan menganggap paket ZIP sebagai deployment berhasil.

Deploy data pribadi baru setelah penerimaan lingkungan test. Gunakan satu backend
aktif per spreadsheet, checkpoint terpisah, dan stop proses lama sebelum pergantian
penulis. Jangan menjalankan admin bootstrap/rebuild bersamaan dengan API aktif.

## APK termurah

Repository AppFinance publik. Gunakan workflow `android-internal.yml` pada runner
standar GitHub-hosted, tanpa EAS berbayar. Profil `preview` menghasilkan APK mandiri
yang bisa digunakan tanpa Metro; profil development untuk debugging.
Secrets Firebase/signing dan URL backend nyata harus tersedia sebelum kompilasi.
Ikuti `docs/FRONTEND_SETUP.md`. File workflow_dispatch harus sudah terdaftar pada
default branch melalui review/merge, lalu pilih branch kode yang akan dibangun.

Di workspace sesi setup ini belum ada Android SDK, javac, Firebase config, signing
atau backend HTTPS. Preflight dapat dijalankan, tetapi tidak ada APK yang dinyatakan
berhasil sebelum Gradle menghasilkan file dan instalasinya terverifikasi.

## Referensi resmi (diperiksa 16 November 2026)

- https://azure.microsoft.com/en-us/pricing/details/app-service/linux/
- https://learn.microsoft.com/en-us/azure/app-service/configure-language-python
- https://learn.microsoft.com/en-us/azure/app-service/quickstart-python
- https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules
- https://firebase.google.com/pricing
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners

Status: konfigurasi disiapkan; provisioning, deployment dan APK belum dijalankan.
