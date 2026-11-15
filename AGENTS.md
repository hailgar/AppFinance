# Catat Harian — implementation rules

- Repository: hailgar/AppFinance. Keep React Native/Expo development build/TypeScript,
  FastAPI, private Google Sheets, Firebase Authentication and local Android reminders.
- Read README.md, docs/01_PRD.md and docs/02_API_DAN_DATA.md before changing behavior.
  Follow the current API/OpenAPI; document any justified contract adjustment.
- Use integer IDR, business dates in Asia/Jakarta, UTC audit timestamps, revision checks,
  and stable operation IDs across retries. No offline transaction queue. Never show
  success for an unresolved write. The append-only ledger remains the source of truth.
- Preserve user changes. Work on a feature branch and open a PR. No force-push,
  destructive resets, public secrets, paid new resources, or Play Store publication.
  User authorizes routine edits/checks/commits/push/PR and existing internal deploy/build.
- Verify with real commands. Separate unit/test adapters from real Firebase/Sheets,
  native builds, emulator tests and physical-device evidence. Never claim unrun checks.
- Shared progress: docs/STATUS.md, written by the coordinator. Existing docs are updated,
  not duplicated. Deployment/build blockers must name only missing configuration/access,
  never print credential values. Use only separate disposable Google Sheets for live tests.

## Parallel file ownership for the active implementation

| Owner | Files |
|---|---|
| Coordinator | AGENTS.md, README.md, docs/*, mobile/src/session.tsx, mobile/app/_layout.tsx, mobile/app/(tabs)/_layout.tsx, mobile/app.config.ts, mobile/package*.json, mobile/eas.json, .github/*, scripts/*, deploy/* |
| FE agent | mobile/app/* except settings.tsx and layouts; mobile/src/components/*; mobile/src/domain.ts; mobile/src/services/api.ts, commands.ts, resources.ts; associated FE tests excluding reminder tests |
| BE agent | backend/*, including backend tests/config/deploy container files |
| Reminder agent | mobile/src/reminders/*, mobile/app/(tabs)/settings.tsx, reminder tests |
| Review agent | Read-only review; no source changes unless coordinator explicitly reassigns |

Request ownership changes through the coordinator before modifying shared files.
Agents share a worktree: do not commit, push, reset, or edit another owner's files.
Run focused checks in your area and report exact results and remaining blockers.

## Checks

- FE: cd mobile && npm run typecheck && npm run lint && npm test
- Expo: cd mobile && EXPO_OFFLINE=1 npm run check:expo && EXPO_OFFLINE=1 npm run export:android
- BE: cd backend && python -m pytest tests -q (Python 3.12, requirements.lock)
- HTTP contract from root with backend Python environment:
  python scripts/test_backend_contract.py backend
- Live Google/Android tests require actual credentials/device; never substitute mocks as acceptance.
