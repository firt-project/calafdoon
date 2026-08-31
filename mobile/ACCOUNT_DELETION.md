# Account deletion behavior — engineering notes

## User flow

1. Settings → Delete account…
2. Explains consequences
3. Requires password + typing `DELETE`
4. Client calls `POST /auth/delete-account` `{ password, confirm: true }`
5. Only after success: clear secure tokens, Query cache, disconnect sockets, navigate to Welcome

## Server

`DeletionService.executeSelf` removes the member account and related rows (see service implementation). Staff cannot self-delete via this path.

## Immediate vs retained

| Item | Typical behavior |
|------|------------------|
| Profile, likes, matches, sessions | Deleted with account (verify migration/service) |
| Messages | Removed or anonymized per service rules — confirm before Privacy Policy promises |
| Media objects in S3 | May remain until lifecycle/job purge — **do not claim instant media wipe** until verified |
| Payment records | Often retained for legal/accounting |
| Audit / abuse reports | May be retained |

Update Privacy Policy after counsel review of the exact Prisma delete graph.
