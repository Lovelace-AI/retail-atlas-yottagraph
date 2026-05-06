# Retail Atlas — DATA

Source-by-source catalog of every dataset Atlas reads. Every entry is committed in this repo unless explicitly noted; nothing is fetched at runtime from third-party APIs (the only network calls at runtime go to the Lovelace gateway / MCP).

For per-retailer NEID resolution rates, area coverage percentages, and the Phase-0 store-NEID probe results, see [`COVERAGE.md`](COVERAGE.md) (regenerated from the report JSONs by `npm run build:coverage`).

## Tier 1 — Source CSVs (committed)

Path: [`data/retail_locations/{slug}_stores.csv`](data/retail_locations/) — one CSV per retailer, ~148k rows total. Three schema flavors handled by [`scripts/lib/normalize.ts`](scripts/lib/normalize.ts):

| Flavor    | Geo columns                                                                                                                          | Used by                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `us-fips` | `state_fips`, `county_fips`, `tract_fips`, `block_fips`, `cbsa_fips`, `csa_fips` (+ optional `county_name`, `cbsa_name`, `csa_name`) | 26 US retailers                               |
| `uk-lad`  | `country_uk`, `itl1_code/name`, `lad_code/name`, `msoa_code/name`, `lsoa_code/name` (+ Overture `overture_id`, `confidence`)         | 3 UK retailers (`tesco`, `booker`, `onestop`) |
| `ca-cma`  | `province_code/name`, `cma_code/name`, `cma_type`, `fsa` (+ OSM `osm_id`, `osm_type`)                                                | 1 CA retailer (`loblaw`)                      |

The full registry — slug, display name, country, schema flavor, brand-adjacent color, sector, source CSV filename — lives in [`scripts/lib/retailer-registry.ts`](scripts/lib/retailer-registry.ts). Adding a new retailer:

1. Drop the enriched CSV into `data/retail_locations/`.
2. Append a `RetailerMeta` entry to the registry.
3. `npm run build:data` (run automatically on `prebuild`).
4. `npm run expand:retailers` (resolves the new retailer's parent-corp NEID).
5. Commit `data/neid_cache/retailer_neids.json` (and the regenerated outputs are gitignored, so just the source + cache).

### Audit JSONs

Path: [`data/retail_locations/_audit/{slug}_audit.json`](data/retail_locations/_audit/) — per-retailer geocode outlier reports (one per retailer where the geocode pipeline flagged > N stores with > 5 km Census-vs-CEO disagreement). Useful when chasing a "why is this dot in Mexico" bug. Schema example: `walgreens_audit.json` lists 25 outliers each with `store_id`, `address`, `ceo_lat/lng`, `census_lat/lng`, `delta_m`, `tiebreaker` (which source won).

### Raw upstream pull

Path: [`data/retail_locations/_source/walmart_ceo.csv`](data/retail_locations/_source/walmart_ceo.csv) — kept as provenance for the geocoding stage. Other retailers' raw pulls were not preserved; this one is the canonical reference for the `coord_source: "ceo"` rows that survived audit.

## Tier 2 — Boundary topojson (committed)

Path: [`public/data/topojson/`](public/data/topojson/). Fetched once by [`scripts/fetch-topojson.ts`](scripts/fetch-topojson.ts), then committed; runtime never re-fetches.

| File                        | Source                                                                                                                                                  | Layer keyed at                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `us/counties-10m.json`      | [topojson/us-atlas](https://github.com/topojson/us-atlas) (Census Bureau cartographic boundaries 2017)                                                  | `objects.counties.geometries[].id = 5-digit FIPS`             |
| `us/states-10m.json`        | same                                                                                                                                                    | `objects.states.geometries[].id = 2-digit FIPS`               |
| `us/nation-10m.json`        | same                                                                                                                                                    | `objects.nation` (single feature)                             |
| `uk/lads.topojson.json`     | [ONS Open Geography Portal](https://geoportal.statistics.gov.uk/) — Local Authority Districts December 2024 BSC, fetched live via paginated ArcGIS REST | `objects.lads.geometries[].id = LAD24CD`                      |
| `ca/cmas.topojson.json`     | [Statistics Canada](https://www150.statcan.gc.ca/) — Census Metropolitan Areas 2021 cartographic boundaries, paginated ArcGIS REST                      | `objects.cmas.geometries[].id = CMAUID (3-digit)`             |
| `world/countries-50m.json`  | [topojson/world-atlas](https://github.com/topojson/world-atlas) (Natural Earth)                                                                         | unused at runtime today; reserved for a future global basemap |
| `world/countries-110m.json` | same                                                                                                                                                    | unused at runtime today                                       |

### Re-fetching

```bash
npm run build:topojson   # one shot — overwrites the committed files
git diff public/data/topojson/  # review byte changes before committing
```

ArcGIS endpoints are simplified server-side via `maxAllowableOffset` (UK = 0.001°, CA = 0.01°). Full vintage URLs documented in the script's source.

## Tier 3 — Generated runtime JSON (gitignored)

Path: [`public/data/retail_atlas/`](public/data/retail_atlas/). Built by [`scripts/build-retail-data.ts`](scripts/build-retail-data.ts) on every `npm run build` (via `prebuild`) — never committed, deterministic from Tier 1 + Tier 2 + Tier 4. ~70 MB total.

| File                 | What                                                                                                                                                | Consumer                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `manifest.json`      | `{ generated_at, source_dir, retailer_count, store_count, area_count, retailers[].csv_sha256 }`                                                     | provenance / cache busting   |
| `retailers.json`     | `RetailerSummary[]` — full registry + `store_count`, `area_count`, `format_distribution`, `org_neid` (from Tier 4 cache)                            | `useAtlasData.loadRetailers` |
| `areas.json`         | `AreaRecord[]` — every admin area any retailer operates in, with `store_counts_by_retailer`, `centroid`, `total_stores`, `neid` (from Tier 4 cache) | `useAtlasData.loadAreas`     |
| `stores/{slug}.json` | `StoreRecord[]` — normalized stores per retailer                                                                                                    | `useAtlasData.loadStores`    |

Type definitions for all three live in [`types/retail.ts`](types/retail.ts).

## Tier 4 — NEID resolution cache (committed)

Path: [`data/neid_cache/`](data/neid_cache/). Output of the `expand:*` scripts; merged into Tier 3 runtime JSON by `build-retail-data.ts`.

| File                         | Producer                   | Format                                                                                         |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `area_neids.json`            | `npm run expand:areas`     | `{ "{country}:{type}:{code}": { neid, name, score, flavor, matched_candidate, resolved_at } }` |
| `area_neids_report.json`     | same                       | Aggregate stats for `COVERAGE.md`                                                              |
| `retailer_neids.json`        | `npm run expand:retailers` | `{ "{slug}": { neid, name, score, matched_query, resolved_at } }`                              |
| `retailer_neids_report.json` | same                       | Aggregate stats for `COVERAGE.md`                                                              |

Both expansion scripts are idempotent — re-running only resolves entries missing from the cache. Use `RESET=1 npm run expand:areas` to force a full re-resolution (e.g. after the upstream graph schema changes).

## Tier 5 — Probe artifacts (committed)

Path: [`data/probes/`](data/probes/). Read-only outputs from one-off coverage/taxonomy probes; committed as provenance for the decisions we made.

| File pattern                      | Producer                                        | Decision driven                                                                                                                                            |
| --------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store-coverage-{ts}.{json,md}`   | `npm run probe:coverage` (PRD R5.1)             | Phase-0 go/no-go for store-NEID resolution. Result: RED (< 10% strict).                                                                                    |
| `event-categories-{ts}.{json,md}` | `npm run probe:event-categories` (R7.2 step 3a) | Source for `OPEN_CATEGORIES` / `CLOSE_CATEGORIES` lists in [`server/api/atlas/recipe/opens-closes.post.ts`](server/api/atlas/recipe/opens-closes.post.ts). |

## Lovelace knowledge graph (runtime — not committed)

The Atlas runtime queries the Lovelace Elemental MCP server for events, articles, economic concepts, and per-retailer corporate events. **No graph data is cached on disk** — the graph is the live source of truth.

- Transport: Streamable-HTTP via the gateway, wrapped by [`server/utils/elementalMcp.ts`](server/utils/elementalMcp.ts).
- Auth: gateway proxies the tenant API key; no per-user token at runtime.
- Cache: per-request KV cache (1 h area-context + event-density, 6 h opens-closes) in [`server/utils/atlasKv.ts`](server/utils/atlasKv.ts). Degrades gracefully when KV is unconfigured.

The MCP tool schemas are documented inline in the elemental skill ([`.agents/skills/elemental-api/mcp.md`](.agents/skills/elemental-api/mcp.md)) and probed at one-off in this repo (see Tier 5).

## What we don't have on disk

- **Article URLs / publication dates** — the Lovelace article schema doesn't carry a URL property; `published_at` is rarely populated. See R-008 in [`ROADMAP.md`](ROADMAP.md).
- **Store-level NEIDs** — Phase 0 (R5.1) ran RED; per-store NEID resolution was cancelled. Per-store entities are surfaced opportunistically when an MCP `get_entity` happens to resolve.
- **Province / sub-CMA boundaries for Canada** — Loblaw's non-CMA stores fall back to a `province` area_type but we don't have a topojson for them. Tracked in `useAtlasData` and rendered as dots without polygon halos.
- **Foot-traffic / panel / imagery** — Phase 4 (R8) territory; blocked on commercial partner contract.
