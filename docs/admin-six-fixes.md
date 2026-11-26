# Six admin corrections

No existing prices, orders, payments, grants or video source bindings are rewritten by deployment.

## Migration and recovery

0023_video_archives.sql adds an empty visibility table and protective triggers. Archive retains the published video state, all program lessons, purchased playback, orders and grants. Restore removes only the archive flag. Archived recordings cannot enter new site checkout, including direct links. Existing paid callbacks still settle their original orders.

Before Production migration: download a full D1 export with restricted filesystem permissions, verify SHA-256 and restore it into isolated SQLite. Check baseline migration list and Production commit. Apply only 0023, recording it in d1_migrations. Compare financial/access tables before and after.

Rollback: revert the application commit and retain additive schema; never restore a full historical database over live orders. The previous application ignores archives, so a forward correction is preferable after actual archiving. Dropping protective triggers or restoring data requires separate review. No Bunny object deletion is part of testing or deployment.

## Behaviour

- Video forms load actual speaker, sales and access terms. Omitted edit fields retain their stored values; legacy translations and non-day policies survive metadata edits.
- Direct upload finalization uses the selected lesson state. Ready drafts are reused after a lost response.
- Both deletion APIs reject any linked order, grant or lesson. SQL triggers also prevent concurrent deletion/link races. Archive is reversible and audited.
- Stream prices are individual; calendar-school terms are explicit, never inferred from a stream kind. Existing prices and policies remain unchanged.
- Program checkout offers days only. Existing non-day policies have a preserve option; an explicit change is required to replace them. Existing historical order snapshots remain untouched.
- Payment search, provider and status remain selected through refreshes.

All API/Bunny/payment regression fixtures are isolated and mocked. No real payments, refunds or Bunny deletes are performed.
