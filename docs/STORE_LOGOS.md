# Store logos

Trademarks belong to their owners; logos identify the store only; no endorsement implied. Compliance to confirm before marketing use.

- Owner decision (2026-10-16): show the chains' real logos in the Grocery tab's store circles.
- Code: `app/src/stores/storeLogos.ts` is the only place logos are wired. A chain with no entry keeps its initials badge.
- Files: `app/assets/stores/<chain-slug>.png`, square (about 192x192), transparent or white background, padded to fit a circle, readable at 56-80px. The whole set stays under about 400 KB (`app/tests/store-logos.test.ts` checks this).
- Allowed sources: Wikimedia Commons files with a clear copyright status, meaning public domain (for example `{{PD-textlogo}}`, below the threshold of originality) or a free licence. Not allowed: Google Images, brand-asset portals with restrictive terms, or anything without a clear status.
- We use each logo only to name the store next to its weekly-ad and store links (nominative use). Commons' copyright status does not cover the trademark, which stays with the chain.

## Status on 2026-10-16: no logo shipped yet

The build machine could not reach Wikimedia. `commons.wikimedia.org` and `upload.wikimedia.org` were refused by the network proxy (HTTP 403), and the web-fetch tool could not open the Commons file pages either. So:

- The candidate files below came from a web search limited to commons.wikimedia.org. Only the titles were seen.
- No licence or status was read. Every row is **not verified**.
- No file was downloaded, so every chain still shows its initials.

Next step, on a machine that can reach Commons: open each file page, check that the "Licensing" box says public domain (for example PD-textlogo) or a free licence, then fill in the status. Download the SVG, convert it to a 192x192 PNG, add the `require` line in `storeLogos.ts`, and fill in the File and Date checked columns. Skip any row whose status is non-free, fair use, or unclear. That chain keeps its initials.

## Chains (the 32 with weekly-ad links, `app/src/stores/chains.ts`)

| Chain | File | Candidate source (Commons file page) | Status / licence | Date checked | Notes |
|---|---|---|---|---|---|
| Save Mart | initials | https://commons.wikimedia.org/wiki/File:SaveMart_logo.png | not verified | 2026-10-16 (search only) | PNG only, no SVG found |
| FoodMaxx | initials | https://commons.wikimedia.org/wiki/File:FoodMaxx_logo.svg | not verified | 2026-10-16 (search only) | |
| Cost Less Food Co. | initials | none found | n/a | 2026-10-16 | No Commons file found. Keep initials |
| Raley's | initials | https://commons.wikimedia.org/wiki/File:Raleys_logo.svg | not verified | 2026-10-16 (search only) | Also File:Raley_Supermarket_logo.svg |
| Safeway | initials | https://commons.wikimedia.org/wiki/File:Safeway_Logo.svg | not verified | 2026-10-16 (search only) | Has an "S" symbol, may not count as text-only |
| Albertsons | initials | https://commons.wikimedia.org/wiki/File:Albertsons_(logo).svg | not verified | 2026-10-16 (search only) | Has a graphic mark, may not count as text-only |
| Vons | initials | https://commons.wikimedia.org/wiki/File:Vons_logo.svg | not verified | 2026-10-16 (search only) | |
| Pavilions | initials | https://commons.wikimedia.org/wiki/File:Pavilions_(supermarket)_Logo.svg | not verified | 2026-10-16 (search only) | |
| Walmart | initials | https://commons.wikimedia.org/wiki/File:Walmart_logo_(2025).svg | not verified | 2026-10-16 (search only) | Spark symbol is a graphic, so check the status carefully |
| Target | initials | https://commons.wikimedia.org/wiki/File:Target_logo.svg | not verified | 2026-10-16 (search only) | Bullseye is a simple geometric mark |
| WinCo | initials | https://commons.wikimedia.org/wiki/File:WinCo_Foods_Logo.svg | not verified | 2026-10-16 (search only) | |
| Grocery Outlet | initials | https://commons.wikimedia.org/wiki/File:Grocery_Outlet_logo.svg | not verified | 2026-10-16 (search only) | A newer PNG also exists (File:Grocery_Outlet_new_logo.png) |
| Food 4 Less | initials | https://commons.wikimedia.org/wiki/File:Food4Less_logo.svg | not verified | 2026-10-16 (search only) | |
| Kroger | initials | https://commons.wikimedia.org/wiki/File:Kroger_logo_(1961-2019).svg | not verified | 2026-10-16 (search only) | Old logo only, so check Category:Kroger_logos for the current one |
| Fred Meyer | initials | https://commons.wikimedia.org/wiki/File:Fred_Meyer_logo_(2021).svg | not verified | 2026-10-16 (search only) | |
| King Soopers | initials | https://commons.wikimedia.org/wiki/File:King_Soopers_logo.svg | not verified | 2026-10-16 (search only) | |
| Ralphs | initials | https://commons.wikimedia.org/wiki/File:Ralphs.svg | not verified | 2026-10-16 (search only) | |
| Publix | initials | https://commons.wikimedia.org/wiki/File:Publix_Logo.svg | not verified | 2026-10-16 (search only) | |
| H-E-B | initials | https://commons.wikimedia.org/wiki/File:HEB_logo.svg | not verified | 2026-10-16 (search only) | |
| Meijer | initials | https://commons.wikimedia.org/wiki/File:Meijer_logo.svg | not verified | 2026-10-16 (search only) | |
| Wegmans | initials | https://commons.wikimedia.org/wiki/File:WegmansLogo.svg | not verified | 2026-10-16 (search only) | |
| Hy-Vee | initials | https://commons.wikimedia.org/wiki/File:Hy-Vee_logo.svg | not verified | 2026-10-16 (search only) | |
| Food Lion | initials | https://commons.wikimedia.org/wiki/File:Food_lion.png | not verified | 2026-10-16 (search only) | Lion artwork is likely above the threshold, so probably keep initials |
| Stop & Shop | initials | https://commons.wikimedia.org/wiki/File:Stop_&_Shop_2018_logo.svg | not verified | 2026-10-16 (search only) | |
| Whole Foods Market | initials | https://commons.wikimedia.org/wiki/File:Whole_Foods_Market_logo.svg | not verified | 2026-10-16 (search only) | Also File:Whole_Foods_Market_201x_logo.svg |
| Stater Bros. | initials | https://commons.wikimedia.org/wiki/File:Stater_Bros._Markets_logo.svg | not verified | 2026-10-16 (search only) | |
| Smart & Final | initials | https://commons.wikimedia.org/wiki/File:Smart&Final_logo.svg | not verified | 2026-10-16 (search only) | |
| Costco | initials | https://commons.wikimedia.org/wiki/File:Costco_Wholesale_logo_2010-10-26.svg | not verified | 2026-10-16 (search only) | |
| Trader Joe's | initials | https://commons.wikimedia.org/wiki/File:Trader_Joes_Logo.svg | not verified | 2026-10-16 (search only) | |
| Sprouts | initials | https://commons.wikimedia.org/wiki/File:Sprouts_Farmers_Market_Logo.png | not verified | 2026-10-16 (search only) | PNG only, and the leaf mark may be above the threshold |
| Aldi | initials | https://commons.wikimedia.org/wiki/File:Aldi_S%C3%BCd_2017_logo.svg | not verified | 2026-10-16 (search only) | Aldi US uses the Aldi Süd logo. The artwork is likely above the threshold |
| Dollar General | initials | https://commons.wikimedia.org/wiki/File:Dollar_General_logo.svg | not verified | 2026-10-16 (search only) | |

The other recognised chains (El Super, Sam's Club, Dollar General Market) have no weekly-ad link and were not searched. They keep their initials.
