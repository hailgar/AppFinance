# Pemeriksaan aktual

16 November 2026 (WIB), branch feat/complete-mvp-integration. Node24.22.1/npm11.9.0,
Python3.12.14 virtual environment terpisah memakai requirements.lock.

| Perintah / pemeriksaan | Hasil aktual |
|---|---|
| mobile: npm run typecheck | Lulus exit0 |
| mobile: npm run lint | Lulus exit0 |
| mobile: npm test | 57 passed, 7 HTTP skipped (mode unit) |
| backend: python -m pytest tests -q | 57 passed, 1 Google-live skipped, 1 deprecation warning |
| python scripts/test_backend_contract.py backend | 7 passed melalui HTTP nyata, storage/auth test adapters |
| python -m pytest scripts/tests -q | 8 passed, validator build saja |
| EXPO_OFFLINE=1 npm run check:expo | Dependencies up to date, exit0; offline validation warning |
| EXPO_OFFLINE=1 npm run export:android | Bundle Hermes exit0, warning config Firebase belum ada; bukan APK |
| git diff --check | Lulus |
| Python AST, workflow/Compose YAML, bash -n | Lulus syntax; Docker/Gradle belum dijalankan |
| python scripts/android_config.py | Exit1 yang diharapkan: API base HTTPS/config aktual belum tersedia |

Tes FE mencakup17 skenario reminder dengan device/store/API adapter terinjeksi,
nominal/WIB, editor/revision, operasi UNKNOWN,401/403, deadline token/body, dan
UID sesi berubah saat refresh. Test fixture dan source Expo bukan bukti pengiriman
notifikasi di Android.

Belum diuji: Firebase login nyata, Google Sheets nyata, Docker/TLS deployment,
Gradle signed APK, emulator, HP fisik, TalkBack/layar sempit/teks besar, serta
reminder setelah reboot/force-stop/penghemat baterai. Kriteria ini tetap terbuka.

Status CI/commit/PR serta dependensi pengguna tercatat pada STATUS.md.
