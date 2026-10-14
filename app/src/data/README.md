# Data layer

The server (Supabase) is the only source of truth. This folder is the only place that talks to it.

## Rules

1. **No second copy.** Screens read through TanStack Query hooks (`usePantryItems()`, `useProfile()`).
   The query cache is the screen's view of the server, not a store to merge. No context, no
   local list, no "sync" step.
2. **Change data through small mutations.** Each one updates the screen at once (optimistic),
   rolls back if the server refuses, then refetches. Use `listMutation()` from `optimistic.ts`
   with a change from `listOps.ts` (`updateItem`, `removeItem`, `addItem`).
3. **The server's answer wins.** Writes use `.select().single()` and the returned row replaces
   the one on screen. The only client-made id is a temporary placeholder (`tempId()`), replaced
   by the server row on success.
4. **Rollback is targeted.** If nothing else changed the list, the snapshot comes back exactly.
   If another change happened meanwhile, only this change's rows are undone, so two quick
   changes never clobber each other. A refetch waits until the last running change of the same
   kind has settled.
5. **Online-first.** Last loaded data stays readable offline (queries pause). Changes are refused
   offline with "You're offline. Changes need a connection." `useIsOnline()` drives the banner.
6. **Plain errors.** Everything throws `DataError`: `message` is words a person can read, `kind`
   is for code (`not-configured`, `signed-out`, `offline`, `not-found`, `forbidden`, `network`,
   `invalid`, `server`). Permanent kinds are not retried.
7. **Always filter by the owner.** Row level security protects the data, but admins can read
   every row, so own-data queries add `.eq('user_id', id)` (or `.eq('id', id)` for profiles).

## Files

| File | What |
| --- | --- |
| `keys.ts` | Query and mutation keys. Every personal key includes the user id. |
| `rows.ts` | Row types matching the live baseline columns; snake_case to camelCase mapping, both ways. |
| `listOps.ts` | Pure list changes and `rollback` (tested in `tests/listOps.test.ts`). |
| `optimistic.ts` | `listMutation()`: snapshot, apply, rollback, replace with server row, refetch. |
| `errors.ts` | `DataError`, plain messages, `run()` for supabase-js calls. |
| `session.ts` | Client and signed-in user id (`useSessionUserId`). |
| `profile.ts`, `pantry.ts` | First real queries and the quantity mutation. |
| `online.ts` | `useIsOnline()` from TanStack Query's onlineManager. |
| `pantryScanSave.ts` | Saves the rows kept on the scan review list: one insert, server rows back, pantry queries refetched. |
| `recipeRows.ts` | Recipe rows (`recipes`, `library_recipes`) mapped to one `AppRecipe`; the recipe id scheme `r_<uuid>` / `l_<uuid>` (`recipeHref`, `parseRecipeRouteId`); the add-missing answer. Pure. |
| `recipes.ts` | `useRecipes()` (master + own + published library) and `useRecipe(id)`. Read-only. |
| `recipeMutations.ts` | `useAddMissingToGrocery()`: one call to `add_missing_to_grocery`; the server's grocery rows go into the grocery query. |
| `scanUsage.ts` | This month's photo scans used (own `photo_scan_usage` row) and `useScanAllowance()` for the Scan button. |

Adding a table: add its Row type, app type, both mappers and column list to `rows.ts` (or a
new `rows-<feature>.ts` once it nears 400 lines), add keys, then a `<feature>.ts` with hooks.
