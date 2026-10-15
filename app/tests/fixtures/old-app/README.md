# Old app snapshot (compliance-approved wording)

Byte-for-byte copies of eight old-app source files, taken at the switch-over when `mobile/` was deleted
(from `rebuild/v1` a5c96da; the same files are identical on `main` 316868d, 2026-10-13, the live app).
Re-checked 2026-10-15 against `rebuild/v1` 59b6bfa (after #295): all eight still byte for byte the same.
Name: the old path with `/` turned into `_`, plus `.txt` so nothing compiles or imports them.

They hold the money, account-deletion and Ask Forky wording compliance approved on the live app (#252:
terms `2026-10-11`, disclosure `2026-10-11.1`). `tests/plans-pricing.test.ts`, `tests/account-copy.test.ts`
and `tests/forky-request.test.ts` check that the new app's LIVE lines are still word for word in them.
A missing file fails those tests.

Do not edit these files to make a test pass. If the new wording must change, compliance approves it first;
then change the test (and say so in the PR), not the snapshot.
