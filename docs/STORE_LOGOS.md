# Store logos

Trademarks belong to their owners; logos identify the store only; no endorsement implied. Compliance to confirm before marketing use.

- Owner decision (2026-10-16): show the chains' real logos in the Grocery tab's store circles.
- Code: `app/src/stores/storeLogos.ts` is the only place logos are wired. A chain with no entry keeps its initials badge.
- Files: `app/assets/stores/<chain-slug>.png`, square (about 192x192), transparent or white background, padded to fit a circle, readable at 56-80px. The whole set stays under about 400 KB (`app/tests/store-logos.test.ts` checks this).
- Allowed sources: Wikimedia Commons files with a clear copyright status, meaning public domain (for example `{{PD-textlogo}}`, below the threshold of originality) or a free licence. Not allowed: Google Images, brand-asset portals with restrictive terms, or anything without a clear status.
- We use each logo only to name the store next to its weekly-ad and store links (nominative use). Commons' copyright status does not cover the trademark, which stays with the chain.

## Status on 2026-10-16: 24 logos shipped

- Licence status for all 31 candidates was read from the Commons API on 2026-10-16: 30 are public domain (mostly PD-textlogo; Raley's and H-E-B are PD-shape). Sprouts is CC BY-SA 4.0, so it is skipped and keeps its initials.
- Each shipped logo was downloaded from upload.wikimedia.org (the original file), trimmed, fitted inside a 192x192 transparent canvas and saved as a PNG under 64 KB. The whole set is well under 400 KB.
- Kroger's file is the 1961-2019 logo. Replace it when a clear-status current one is found in Category:Kroger_logos.
- Aldi is skipped on purpose: the file reads "ALDI SÜD".
- Not added yet (Commons rate-limited the download, status still public domain): Save Mart, FoodMaxx, Pavilions, Grocery Outlet, Smart & Final. They keep initials until a later commit adds them.
- Cost Less Food Co. has no Commons file and keeps initials.

## Chains (the 32 with weekly-ad links, `app/src/stores/chains.ts`)

| Chain | File | Candidate source (Commons file page) | Status / licence | Date checked | Notes |
|---|---|---|---|---|---|
| Save Mart | initials | https://commons.wikimedia.org/wiki/File:SaveMart_logo.png | Public domain (checked), file not downloaded yet | 2026-10-16 | Commons rate-limited the download. Keeps initials until added |
| FoodMaxx | initials | https://commons.wikimedia.org/wiki/File:FoodMaxx_logo.svg | Public domain (checked), file not downloaded yet | 2026-10-16 | Commons rate-limited the download. Keeps initials until added |
| Cost Less Food Co. | initials | none found | n/a | 2026-10-16 | No Commons file found. Keep initials |
| Raley's | `app/assets/stores/raleys.png` | https://commons.wikimedia.org/wiki/File:Raleys_logo.svg | Public domain (Commons licence box) | 2026-10-16 | Also File:Raley_Supermarket_logo.svg |
| Safeway | `app/assets/stores/safeway.png` | https://commons.wikimedia.org/wiki/File:Safeway_Logo.svg | Public domain (Commons licence box) | 2026-10-16 | Has an "S" symbol, may not count as text-only |
| Albertsons | `app/assets/stores/albertsons.png` | https://commons.wikimedia.org/wiki/File:Albertsons_(logo).svg | Public domain (Commons licence box) | 2026-10-16 | Has a graphic mark, may not count as text-only |
| Vons | `app/assets/stores/vons.png` | https://commons.wikimedia.org/wiki/File:Vons_logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Pavilions | initials | https://commons.wikimedia.org/wiki/File:Pavilions_(supermarket)_Logo.svg | Public domain (checked), file not downloaded yet | 2026-10-16 | Commons rate-limited the download. Keeps initials until added |
| Walmart | `app/assets/stores/walmart.png` | https://commons.wikimedia.org/wiki/File:Walmart_logo_(2025).svg | Public domain (Commons licence box) | 2026-10-16 | Spark symbol is a graphic, so check the status carefully |
| Target | `app/assets/stores/target.png` | https://commons.wikimedia.org/wiki/File:Target_logo.svg | Public domain (Commons licence box) | 2026-10-16 | Bullseye is a simple geometric mark |
| WinCo | `app/assets/stores/winco.png` | https://commons.wikimedia.org/wiki/File:WinCo_Foods_Logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Grocery Outlet | initials | https://commons.wikimedia.org/wiki/File:Grocery_Outlet_logo.svg | Public domain (checked), file not downloaded yet | 2026-10-16 | Commons rate-limited the download. Keeps initials until added |
| Food 4 Less | `app/assets/stores/food-4-less.png` | https://commons.wikimedia.org/wiki/File:Food4Less_logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Kroger | `app/assets/stores/kroger.png` | https://commons.wikimedia.org/wiki/File:Kroger_logo_(1961-2019).svg | Public domain (Commons licence box) | 2026-10-16 | Old logo only, so check Category:Kroger_logos for the current one |
| Fred Meyer | `app/assets/stores/fred-meyer.png` | https://commons.wikimedia.org/wiki/File:Fred_Meyer_logo_(2021).svg | Public domain (Commons licence box) | 2026-10-16 |  |
| King Soopers | `app/assets/stores/king-soopers.png` | https://commons.wikimedia.org/wiki/File:King_Soopers_logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Ralphs | `app/assets/stores/ralphs.png` | https://commons.wikimedia.org/wiki/File:Ralphs.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Publix | `app/assets/stores/publix.png` | https://commons.wikimedia.org/wiki/File:Publix_Logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| H-E-B | `app/assets/stores/heb.png` | https://commons.wikimedia.org/wiki/File:HEB_logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Meijer | `app/assets/stores/meijer.png` | https://commons.wikimedia.org/wiki/File:Meijer_logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Wegmans | `app/assets/stores/wegmans.png` | https://commons.wikimedia.org/wiki/File:WegmansLogo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Hy-Vee | `app/assets/stores/hy-vee.png` | https://commons.wikimedia.org/wiki/File:Hy-Vee_logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Food Lion | `app/assets/stores/food-lion.png` | https://commons.wikimedia.org/wiki/File:Food_lion.png | Public domain (Commons licence box) | 2026-10-16 | Lion artwork is likely above the threshold, so probably keep initials |
| Stop & Shop | `app/assets/stores/stop-and-shop.png` | https://commons.wikimedia.org/wiki/File:Stop_&_Shop_2018_logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Whole Foods Market | `app/assets/stores/whole-foods.png` | https://commons.wikimedia.org/wiki/File:Whole_Foods_Market_logo.svg | Public domain (Commons licence box) | 2026-10-16 | Also File:Whole_Foods_Market_201x_logo.svg |
| Stater Bros. | `app/assets/stores/stater-bros.png` | https://commons.wikimedia.org/wiki/File:Stater_Bros._Markets_logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Smart & Final | initials | https://commons.wikimedia.org/wiki/File:Smart&Final_logo.svg | Public domain (checked), file not downloaded yet | 2026-10-16 | Commons rate-limited the download. Keeps initials until added |
| Costco | `app/assets/stores/costco.png` | https://commons.wikimedia.org/wiki/File:Costco_Wholesale_logo_2010-10-26.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Trader Joe's | `app/assets/stores/trader-joes.png` | https://commons.wikimedia.org/wiki/File:Trader_Joes_Logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |
| Sprouts | initials | https://commons.wikimedia.org/wiki/File:Sprouts_Farmers_Market_Logo.png | CC BY-SA 4.0 (needs attribution and share-alike) | 2026-10-16 | Skipped on purpose. Keeps initials |
| Aldi | initials | https://commons.wikimedia.org/wiki/File:Aldi_S%C3%BCd_2017_logo.svg | Public domain | 2026-10-16 | skipped: this file reads "ALDI SÜD", not the name US shoppers see. Keeps initials |
| Dollar General | `app/assets/stores/dollar-general.png` | https://commons.wikimedia.org/wiki/File:Dollar_General_logo.svg | Public domain (Commons licence box) | 2026-10-16 |  |

The other recognised chains (El Super, Sam's Club, Dollar General Market) have no weekly-ad link and were not searched. They keep their initials.
