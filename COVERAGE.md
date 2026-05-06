# Retail Atlas — Coverage

> Auto-generated. Regenerate with `npm run build:coverage` after
> running `expand:areas` / `expand:retailers` / `probe:coverage`.
> Last regenerated: 2026-05-06T20:27:42.471Z

## Headline numbers

- **Areas with NEID resolved**: 2,318 / 3,601 (64.4%). Source: data/neid_cache/area_neids_report.json (2026-05-05T18:34:19.080Z).
- **Retailers with parent-corp NEID resolved**: 30 / 30 (100.0%).

## Area NEID resolution by country

| Country | Areas | Resolved |  Rate |
| ------- | ----: | -------: | ----: |
| CA      |   139 |      120 | 86.3% |
| UK      |   357 |      332 | 93.0% |
| US      | 3,105 |    1,866 | 60.1% |

## Per-retailer area resolution

For each retailer, the count of admin areas they operate in vs the subset of those areas with a resolved Elemental NEID. Drives the canvas halo coverage.

| Retailer           | Country | Stores | Areas (with stores) | Areas (NEID resolved) | Resolution rate |
| ------------------ | ------- | -----: | ------------------: | --------------------: | --------------: |
| Dollar General     | US      | 20,503 |               2,807 |                 1,782 |           63.5% |
| Subway             | US      | 19,995 |               2,758 |                 1,748 |           63.4% |
| Starbucks          | US      | 16,746 |               1,469 |                 1,067 |           72.6% |
| McDonald's         | US      | 13,805 |               2,410 |                 1,565 |           64.9% |
| Dunkin             | US      |  9,990 |               1,089 |                   820 |           75.3% |
| Dollar Tree        | US      |  9,063 |               1,983 |                 1,371 |           69.1% |
| CVS                | US      |  8,979 |               1,387 |                 1,030 |           74.3% |
| Walgreens          | US      |  8,040 |               1,581 |                 1,111 |           70.3% |
| Family Dollar      | US      |  7,138 |               2,006 |                 1,302 |           64.9% |
| Walmart            | US      |  4,575 |               1,873 |                 1,284 |           68.6% |
| Chipotle           | US      |  3,951 |                 794 |                   663 |           83.5% |
| Chick-fil-A        | US      |  3,399 |                 866 |                   682 |           78.8% |
| Planet Fitness     | US      |  2,730 |                 945 |                   763 |           80.7% |
| Aldi               | US      |  2,649 |                 916 |                   689 |           75.2% |
| Tesco              | UK      |  2,396 |                 350 |                   325 |           92.9% |
| The Home Depot     | US      |  2,021 |                 807 |                   653 |           80.9% |
| Target             | US      |  1,979 |                 659 |                   563 |           85.4% |
| Lowe's             | US      |  1,762 |                 940 |                   762 |           81.1% |
| Publix             | US      |  1,461 |                 198 |                   162 |           81.8% |
| Kroger             | US      |  1,225 |                 355 |                   255 |           71.8% |
| Kohl's             | US      |  1,151 |                 646 |                   540 |           83.6% |
| One Stop           | UK      |  1,136 |                 281 |                   262 |           93.2% |
| Loblaw             | CA      |    922 |                 139 |                   120 |           86.3% |
| Trader Joe's       | US      |    626 |                 226 |                   213 |           94.2% |
| Costco             | US      |    612 |                 328 |                   302 |           92.1% |
| Whole Foods Market | US      |    532 |                 210 |                   202 |           96.2% |
| lululemon          | US      |    477 |                 269 |                   252 |           93.7% |
| Albertsons         | US      |    367 |                  97 |                    72 |           74.2% |
| Hy-Vee             | US      |    300 |                 158 |                    97 |           61.4% |
| Booker             | UK      |    179 |                 143 |                   135 |           94.4% |

## Per-retailer parent-corp NEID

Used by the area-context fan-out to surface per-retailer corporate events when an active chip has a resolved NEID.

| Retailer           | Country | Resolved name                  | Score | Matched query                    |
| ------------------ | ------- | ------------------------------ | ----: | -------------------------------- |
| Loblaw             | CA      | Loblaw Companies Limited       | 1.000 | `Loblaw Companies Limited`       |
| Booker             | UK      | Booker                         | 1.000 | `Booker`                         |
| One Stop           | UK      | One Stop                       | 1.000 | `One Stop`                       |
| Tesco              | UK      | Tesco PLC                      | 1.000 | `Tesco PLC`                      |
| Albertsons         | US      | Albertsons Companies, Inc.     | 1.000 | `Albertsons Companies, Inc.`     |
| Aldi               | US      | Aldi Group                     | 1.000 | `ALDI`                           |
| Chick-fil-A        | US      | Chick-fil-A, Inc.              | 1.000 | `Chick-fil-A, Inc.`              |
| Chipotle           | US      | Chipotle Mexican Grill, Inc.   | 1.000 | `Chipotle Mexican Grill, Inc.`   |
| Costco             | US      | Costco Wholesale Corporation   | 1.000 | `Costco Wholesale Corporation`   |
| CVS                | US      | CVS Health Corporation         | 1.000 | `CVS Health Corporation`         |
| Dollar Tree        | US      | Dollar Tree, Inc.              | 1.000 | `Dollar Tree, Inc.`              |
| Dollar General     | US      | Dollar General Corporation     | 1.000 | `Dollar General Corporation`     |
| Dunkin             | US      | Dunkin' Brands Group, Inc.     | 1.000 | `Dunkin' Brands`                 |
| Family Dollar      | US      | Family Dollar Stores, Inc.     | 1.000 | `Family Dollar Stores, Inc.`     |
| The Home Depot     | US      | The Home Depot, Inc.           | 1.000 | `The Home Depot, Inc.`           |
| Hy-Vee             | US      | Hy-Vee, Inc.                   | 1.000 | `Hy-Vee, Inc.`                   |
| Kohl's             | US      | Kohl's Corporation             | 1.000 | `Kohl's Corporation`             |
| Kroger             | US      | The Kroger Co.                 | 1.000 | `The Kroger Co.`                 |
| Lowe's             | US      | Lowe's Companies, Inc.         | 1.000 | `Lowe's Companies, Inc.`         |
| lululemon          | US      | Lululemon Athletica Inc.       | 1.000 | `lululemon athletica inc.`       |
| McDonald's         | US      | McDonald's Corporation         | 1.000 | `McDonald's Corporation`         |
| Planet Fitness     | US      | Planet Fitness, Inc.           | 1.000 | `Planet Fitness, Inc.`           |
| Publix             | US      | Publix Super Markets, Inc.     | 1.000 | `Publix Super Markets, Inc.`     |
| Starbucks          | US      | Starbucks Corporation          | 1.000 | `Starbucks Corporation`          |
| Subway             | US      | Subway IP LLC                  | 1.000 | `Subway IP LLC`                  |
| Target             | US      | Target Corporation             | 1.000 | `Target Corporation`             |
| Trader Joe's       | US      | Trader Joe's Co.               | 1.000 | `Trader Joe's`                   |
| Walgreens          | US      | Walgreens Boots Alliance, Inc. | 1.000 | `Walgreens Boots Alliance, Inc.` |
| Walmart            | US      | Walmart Inc.                   | 1.000 | `Walmart Inc.`                   |
| Whole Foods Market | US      | Whole Foods Market Inc.        | 1.000 | `Whole Foods Market`             |

## Phase-0 store-NEID probe (PRD R5.1)

Latest run: 2026-05-05T17:35:37.411Z; sample = 15 stores per retailer.

**Overall**: 1 strict / 105 (1.0%); 7 loose (6.7%).

**Decision**: RED — Phase 2 store-NEID resolution cancelled per PRD R5.1.

| Retailer   | Sample | Strict | Loose | Strict % | Loose % |
| ---------- | -----: | -----: | ----: | -------: | ------: |
| Walmart    |     15 |      1 |     2 |     6.7% |   13.3% |
| Target     |     15 |      0 |     1 |     0.0% |    6.7% |
| Costco     |     15 |      0 |     0 |     0.0% |    0.0% |
| McDonald's |     15 |      0 |     0 |     0.0% |    0.0% |
| Starbucks  |     15 |      0 |     0 |     0.0% |    0.0% |
| Tesco      |     15 |      0 |     2 |     0.0% |   13.3% |
| Loblaw     |     15 |      0 |     2 |     0.0% |   13.3% |

## Known gaps

- **US area-NEID coverage at ~60%** — many small / rural counties don't resolve. The 1,239 unresolved US areas are mostly low-population counties; the populous CBSAs all resolve at score ≥ 0.99.
- **CA province fallback** — 19 of the 139 Canadian areas are `province` flavor (not CMA), used for non-CMA Loblaw stores. None of the boundary topojson covers province polygons today, so those areas render as dots only.
- **Article URL / publication date** — the Lovelace article schema does not carry a URL property and `published_at` is rarely populated. Tracked as R-008 in [`ROADMAP.md`](ROADMAP.md).
- **R7.2 attribution** — most retailer-level events don't carry county-granularity participants, so the opens-vs-closes recipe is sparse but trustworthy. Description-text NER is gated on R-006.

_Cache files: data/neid_cache/area_neids.json (3601 entries) · data/neid_cache/retailer_neids.json (30 entries)._
