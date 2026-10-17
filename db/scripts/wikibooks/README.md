# Wikibooks Cookbook loader

Bulk-loads 3,813 Wikibooks Cookbook recipes into `public.library_recipes` as **drafts**. Nothing is
published by this.

| File | What it is |
|---|---|
| `parse_wikibooks.py` | Turns the owner-supplied scrape (`recipes_parsed.mini.json`, about 10 MB, **not committed**) into `db/data/wikibooks-recipes.json`. Run: `python3 -I db/scripts/wikibooks/parse_wikibooks.py <source.json>` |
| `test_parse.py` | `python3 -m unittest` (run from this folder): fractions, ranges, units, parentheticals, tag cleanup, captions |
| `../../data/wikibooks-recipes.json` | The parser's output (about 5.3 MB). This is what gets loaded. |
| `load.mjs` | The loader (Node 22, no dependencies). Dry run by default. |
| `load.test.mjs` | `node --test db/scripts/wikibooks/load.test.mjs`: SQL builder (quoting, dollar tag, batch size), retries. No network. |
| `../../../.github/workflows/load-wikibooks-recipes.yml` | The manual workflow that runs the loader. |

## What a loaded row looks like

`status = 'draft'`, `source_name = 'Wikibooks Cookbook'`, `license = 'CC BY-SA 4.0'`, `source_url` = the
Wikibooks page, `dish_name = title`, `servings` = the page's number or **4 when missing** (about two
thirds of pages have none), `tags` = one cleaned category (or empty), `cuisine` empty, and
`review_notes` saying it was imported mechanically. Rows go in batches of 100 through the Supabase
Management API (`/database/query`), retrying on 429 and 5xx.

**Safety.** An existing slug is only updated when that row is itself a draft from "Wikibooks
Cookbook" (`ON CONFLICT (slug) DO UPDATE ... WHERE status='draft' AND source_name='Wikibooks Cookbook'`).
A published row, or a row from any other source, with the same slug is left alone and counted as
"skipped". The loader never deletes. Slugs all start with `wb-`.

The `source_name`, `source_url` and `license` columns come from PR #341, which is already applied on
live; the loader fails with a clear SQL error if they were missing.

## How the owner runs it

1. Merge this PR.
2. GitHub: **Actions > Load Wikibooks recipes > Run workflow**, `apply` **off**. This is a dry run:
   it prints counts and one sample row and makes no database call.
3. Run it again with `apply` **on**. The log shows each batch (inserted / updated / skipped), then
   counts from a read-only `select status, source_name, count(*)`.
4. Re-running with `apply` on is safe: drafts from this source are refreshed in place, nothing is duplicated.

The workflow only runs from `main` and uses the `SUPABASE_ACCESS_TOKEN` repository secret (the same
one as "Deploy Supabase function"). The token is never printed.

## Publishing is a separate, later step

Not part of this PR. Drafts are invisible to the app (only `published` rows are readable). Before any
are published: someone has to review them (ingredient lines are mechanical), and compliance has to
confirm CC BY-SA share-alike for a paid app (still open on PR #341).

## Licence and credit

Wikibooks Cookbook text is **CC BY-SA 4.0**. Each row carries its `source_url` and `license`; PR #341
makes the app show "Source: Wikibooks Cookbook, CC BY-SA 4.0" linked to the original page. The text is
used as written (no rewriting); only the ingredient lines are split into quantity, unit and name.

## Parser results and anomalies still in the data

From 3,895 pages: 3,813 rows; skipped 77 with no ingredient list and 5 with no steps.

- Ingredient lines: 33,524. 24,428 have a quantity (18,715 of them also a unit); 9,096 stay raw
  (quantity 0, the whole line as the name): "Salt to taste", "Onions, chopped", and about 67 odd lines such
  as "1-inch piece of ginger" or a bare "3 cloves".
- A parenthetical amount such as "(240 ml)" goes into `note`; the quantity is not read from it.
  For "1 cup (240 ml) milk" the cup is the quantity and "(240 ml)" is in `note`.
- A range "2-3 cups" keeps the lower number and says "original amount: 2-3" in `note`.
- "3 cloves red onion" (a source typo) has no unit; the word "cloves" moves to `note`.
- Units not recognised (cm, inch, each) stay in the name.
- Servings missing on 2,573 rows (default 4 on load); a servings range "6-8" keeps 6. No category on 117 rows.
- 57 image captions and photo labels were dropped from steps ("Dough rolled into a ball", "5. meat,
  mustard, salt, and pepper"). Some slip through: a few step lists still contain odd fragments.
- A few source lines have unbalanced parentheses; they are kept as written.
- Steps come from the sections Procedure, Preparation, Directions, Method, Instructions and Process;
  Notes, tips and variations are not loaded.
