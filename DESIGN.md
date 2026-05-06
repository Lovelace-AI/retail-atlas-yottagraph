# Retail Atlas

## Vision

Retail Atlas — a productized vertical application built on Elemental that
lets retail CI / corp-dev / real-estate / merchandising teams overlay
multiple retailers' store footprints on the same map, click any polygon or
store dot to get live Elemental context, and compose cross-retailer
analyses no comparable product (Placer, Advan, SafeGraph, Similarweb)
delivers today.

## Stack note (realized vs PRD)

The PRD below was scoped to **Vite + React + Tailwind + shadcn/ui +
Supabase + Deno edge functions**. The realized app uses the **Aether
template**: Nuxt 3 (SPA) + Vue 3 + Vuetify 3 + TypeScript, Vercel +
Nitro server routes, Auth0, Upstash Redis (KV), and optional Neon
Postgres. Treat any reference to React / Tailwind / shadcn / Supabase as
"the equivalent in our stack" — the architecture (data substrate, NEID
resolution, layered map canvas, context panels, recipes) carries over
unchanged; only the framework and component library differ. The
`@lovelace/retail-map-core` npm package described in R2 is also
aspirational at this phase: while we are a single tenant app, the
shared logic lives in this repo (`scripts/`, `types/`, `composables/`).
We will graduate it to a package once a second tenant or app needs the
same surface.

# Retail Atlas — PRD

## Context

Another app we built demonstrated that a five-layer composite (basemap silhouette → area polygons → choropleth fill → Elemental NEID halo → store dots) + a live MCP fan-out on click produces an interactive surface that none of the comparable products (Placer, Advan, SafeGraph, Similarweb, the panel vendors) deliver today. The reason is that the halo is keyed on a real entity graph — every tracked county / LAD / CMA is a NEID that resolves to events, articles, and economic concepts via Elemental. That substrate is what makes the map feel different from "another choropleth."

What this PRD proposes building as a distinct product:

1. Layer multiple retailers' store footprints on the same map as interchangeable overlays (not one-retailer-at-a-time).
2. Resolve **per-store entities** (not just per-county), so the dots themselves are clickable context targets — store-level incidents, permits, openings, closures, local press.
3. Compose **cross-retailer aggregates** — "show me every US county where Target opened a store and Dollar General closed one in the last 12 months," "rank CBSAs by event density per $ of retail square footage," "find counties where all big-box retailers have plateaued."
4. Package the whole thing as a self-service canvas a retail analyst, real-estate investor, or CI buyer can open daily — not as a demo surface gated behind a nowcast chain.

Retail Atlas is a _productized vertical application_ built on Elemental: it sells to retail CI / corp-dev / real-estate / merchandising teams directly, with a bounded feature set and a real subscription shape.

## Goals

1. Ship a standalone app at a dedicated domain whose home surface is a composable retail-store map: choose retailers, choose overlays, click any polygon or store dot to get live Elemental context.
2. Extend the NEID resolution pattern to (a) every county a tracked retailer operates in (full coverage, not top-N) and (b) every **store** Elemental has coverage for.
3. Make the canvas compositional — multiple retailer layers, multiple analysis overlays, multiple time windows — without requiring a "chain run" or any server-side orchestration for basic map interactions. Heavy-lift analysis fans out on demand.
4. Deliver at least three named analysis recipes that aren't currently possible in any competing product: store-level incident feed, footprint-delta-between-retailers (opened vs closed per county in a window), and event-density-per-store-density choropleth.

`d3-geo` + TopoJSON and MapLibre / deck.gl can be used.

## Locked-in decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Separate Git repo, separate Vercel / host project, separate Supabase project.** Shared code is distributed via an internal npm package (`@lovelace/retail-map-core`). Shared data (CSVs, NEID caches, topojson) lives in an internal data repo the map-core package reads from at build time.                                                                                                                                                                                                                                                                                 |
| 2   | **Aether template**: Nuxt 3 (SPA) + Vue 3 + Vuetify 3 + TypeScript; Vercel + Nitro server routes; Auth0; Upstash Redis (KV) for prefs/state; optional Neon Postgres for app-specific relational data. Elemental MCP via the platform's standard `useElementalClient()` / server-side helpers.                                                                                                                                                                                                                                                                                   |
| 3   | Atomic map unit is the **Store Record**: `{ store_id, retailer, retailer_slug, banner, format, status, country, lat, lng, address, city, region, postal_code, area_code, area_type, area_name, neid }` plus country-specific FIPS/LAD/CMA hierarchy fields. `neid` is populated when Elemental has a resolvable entity for that store; absence is fine (the store still renders as a dot). Canonical type lives in [`types/retail.ts`](types/retail.ts).                                                                                                                        |
| 4   | Choropleth unit is the **Area Record**: `{ area_key, area_code, area_type, country, area_name, region, centroid, store_counts_by_retailer, total_stores, neid }`. `area_key = "{country}:{area_type}:{area_code}"` is the primary key and stable across countries (US county FIPS, UK LAD, CA CMA). NEID is required for an area to be interactive; without one, the polygon is rendered in the base palette but not clickable.                                                                                                                                                 |
| 5   | **No DB-backed entity cache in MVP.** NEID lookups come from bundled JSON files (`area_neids.json`, `store_neids.json`) . If the hit-rate gate in R5 passes, the caches graduate to a DB table in Phase 3.                                                                                                                                                                                                                                                                                                                                                                      |
| 6   | MVP ships **30 retailers** sourced from `data/retail_locations/` (~148k stores total): 26 US (big-box, grocery, dollar, drug, QSR, coffee, specialty, home-improvement), 3 UK (Tesco, Booker, One Stop), and 1 CA (Loblaw). The full list lives in [`scripts/lib/retailer-registry.ts`](scripts/lib/retailer-registry.ts). Additional retailers are unlocked by dropping a new CSV into `data/retail_locations/` and appending an entry to the registry; no other code changes. The map's default-on chips are scoped to a smaller curated subset (initially Target + Walmart). |
| 7   | The app is called **Retail Atlas**. Route structure: `/` (landing) → `/atlas` (map canvas, the product) → `/atlas/store/:store_id`, `/atlas/area/:area_code`, `/atlas/retailer/:slug` (detail panes). No nested sub-routes deeper than two levels.                                                                                                                                                                                                                                                                                                                              |
| 8   | Feature flag `VITE_ATLAS_BETA=true` gates the MVP build. Default off for any deploy that isn't the beta domain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Phasing

| Phase       | Scope                                                                                                                                                                                       | Effort            | Trigger                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| **Phase 0** | Elemental store-level coverage probe (R5.1) — run before committing to the rest of the PRD. If per-store hit-rate is under 30%, this phasing collapses and the product pivots to area-only. | ~2 days           | Immediate, blocking.                                            |
| **Phase 1** | Repo + shared-package extraction + MVP map canvas (R1, R2, R3) with the five retailers. Area-level clicks only; no store-level NEIDs yet.                                                   | ~2 person-weeks   | Phase 0 result, regardless of outcome.                          |
| **Phase 2** | Store-level NEID resolution + per-store context panel (R5, R6). Gated on Phase 0 hit-rate.                                                                                                  | ~1.5 person-weeks | Phase 0 hit-rate ≥ 30%.                                         |
| **Phase 3** | Cross-retailer overlays + analysis recipes (R4, R7). The product differentiator.                                                                                                            | ~2 person-weeks   | Phase 1 lands and at least 3 beta users are active.             |
| **Phase 4** | Premium-feed composition surface (R8) — panel, credit-card, imagery overlays with the same `available_in_production[]` pattern uses.                                                        | ~1 person-week    | First paid design-partner signals interest in feed composition. |
| **Phase 5** | DB-backed entity + observation cache, admin UI, multi-tenant hardening (R9, R10).                                                                                                           | ~3 person-weeks   | Beta converts to paid.                                          |

## Definitions

### Store Record

The atomic geocoded unit on the map. One row per physical retail location.

```jsonc
{
    "store_id": "target-1234", // retailer slug + store number
    "retailer": "Target",
    "banner": null, // Loblaw / Tesco sub-brands populate this
    "format": "General Merchandise", // Supercenter / Express / Metro / …
    "country": "US",
    "area_code": "06037", // 5-digit FIPS / LAD / CMA
    "area_type": "county", // "county" | "lad" | "cma"
    "lat": 34.0522,
    "lng": -118.2437,
    "address": "…",
    "city": "Los Angeles",
    "region": "CA",
    "neid": "…", // optional; populated when Elemental has coverage
}
```

### Area Record

The atomic polygon unit. One row per administrative area (county / LAD / CMA) that any tracked retailer operates in.

```jsonc
{
    "area_code": "06037",
    "area_type": "county",
    "country": "US",
    "area_name": "Los Angeles",
    "region": "California",
    "neid": "00514451033156531285", // required for click-context
    "centroid": [-118.24, 34.05],
    "store_counts": {
        "Target": 85,
        "Walmart": 40,
        "Dollar General": 35,
    },
}
```

### Analysis Recipe

A named, saveable composition of (retailers × area filter × overlay × time window) that produces a specific visualization. Recipes are serialized to the URL so they're shareable.

```jsonc
{
    "recipe_id": "opened-vs-closed-12m",
    "label": "Store openings minus closings, last 12 months",
    "retailers": ["Target", "Walmart", "Dollar General"],
    "area_scope": { "country": "US", "min_population": 50000 },
    "overlay": { "kind": "event_delta", "event_types": ["store_open", "store_close"] },
    "time_window": { "months_back": 12 },
}
```

MVP ships three canonical recipes (see R7); users can clone and tweak via URL parameters but can't save new ones to a server until Phase 5.

### Elemental coverage tiers

| Tier                         | What Elemental resolves                                                      | How we use it                                                        |
| ---------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Area**                     | County / LAD / CMA as `location` flavor entity                               | Choropleth click → `nowcast-county-context`-style fan-out.           |
| **Retailer org**             | Retailer as `organization` flavor (provven via `getEntityByCik`)             | Global retailer event feed, roll-ups.                                |
| **Store**                    | Individual store locations as `location` or `organization` flavors           | Per-dot click; gated on Phase 0 hit-rate.                            |
| **Shopping center / anchor** | Malls, lifestyle centers, strip-mall anchors as `location` or `organization` | Composed with stores; one click surfaces co-tenant events. Phase 3+. |

## Architecture

```mermaid
flowchart LR
  subgraph data[Data Repo - internal]
    csv[retail_locations/*.csv]
    topo[topojson/*.json]
    neid_area[area_neids.json]
    neid_store[store_neids.json]
    neid_retailer[retailer_neids.json]
  end

  subgraph core[Retail Map Core - npm package]
    build[build-retailer-map-data]
    expand[expand-*-neids]
    renderer[MapCanvas React component]
    panel[ContextPanel React component]
    client[elemental MCP client]
  end

  subgraph app[Retail Atlas App]
    canvas[/atlas canvas route]
    detail[/atlas/store/:id detail]
    supabase[Supabase edge fns]
  end

  el[Elemental MCP]
  census[Census geocoder + FCC]
  overture[Overture Maps - intl]
  osm[OSM Overpass - intl]

  csv --> build
  topo --> renderer
  build --> app
  expand --> el
  expand --> neid_area
  expand --> neid_store
  expand --> neid_retailer
  neid_area --> app
  neid_store --> app
  neid_retailer --> app

  census --> csv
  overture --> csv
  osm --> csv

  app --> supabase
  supabase --> client
  client --> el
  canvas --> renderer
  canvas --> panel
  panel --> supabase
```

The diagram is intentionally three-boxed: (1) data repo (2) `@lovelace/retail-map-core` — (3) Retail Atlas app — the product surface that imports core and wires it to its own routing, auth, and edge functions.

## Requirements

### R1 — Data substrate (P0, Phase 1)

#### R1.1 — Data location (realized)

Rather than the standalone `lovelace-retail-data` npm package the PRD originally proposed, the realized MVP keeps the entire data substrate in this repo:

```
data/retail_locations/                Source CSVs (committed)
  {slug}_stores.csv                   30 enriched per-retailer rosters
  _audit/{slug}_audit.json            Per-retailer geocode outlier reports
  _source/                            Raw upstream pulls (e.g. walmart_ceo.csv)

scripts/                              Build pipeline (TypeScript, run via tsx)
  build-retail-data.ts                Top-level: CSV → normalized JSON
  lib/retailer-registry.ts            30-retailer registry (slug, name, country, color, schema)
  lib/normalize.ts                    Schema-flavored normalizers (US-FIPS / UK-LAD / CA-CMA)

types/retail.ts                       Canonical Store / Area / Retailer types

public/data/retail_atlas/             Generated outputs (gitignored, rebuilt by `prebuild`)
  manifest.json                       Generation timestamp + per-CSV sha256 + counts
  retailers.json                      Index: slug, name, country, color, store_count, area_count
  stores/{slug}.json                  StoreRecord[] per retailer (lazy-loaded by chip)
  areas.json                          AreaRecord[] across all retailers (3,591 areas)

data/neid_cache/                      (Phase 1+) area_neids.json, store_neids.json
public/data/topojson/                 (Phase 1+) Bundled boundary files
```

The build pipeline runs automatically on Vercel via `prebuild` and on demand locally via `npm run build:data`. Source CSVs are committed; generated JSON is not (the build is deterministic and ~3 s, so regenerating is cheaper than carrying ~70 MB of diffs through git history). When a second app needs the same surface, the `scripts/` + `types/` directories graduate into a `@lovelace/retail-map-core` package per R2 — but until then this is the single source.

Adding a new retailer:

1. Drop the enriched CSV into `data/retail_locations/`.
2. Append a `RetailerMeta` entry to `scripts/lib/retailer-registry.ts`.
3. Run `npm run build:data` and verify the new `stores/{slug}.json` + updated `retailers.json` / `areas.json`.

The schema flavors (`us-fips`, `uk-lad`, `ca-cma`) currently cover all 30 retailers. New flavors require a new normalizer in `scripts/lib/normalize.ts` plus a registry update.

#### R1.2 — Supabase schema (minimal)

MVP schema is tight — most data lives in static files. The DB only tracks app-specific state.

```sql
-- User-saved views / recipes beyond the three canonical ones.
create table public.atlas_saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  recipe jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-click MCP telemetry so we can measure panel latency + cache hit-rate over time.
create table public.atlas_context_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  neid text not null,
  neid_flavor text not null,                -- 'location' | 'organization'
  duration_ms integer not null,
  tool_calls jsonb not null,                -- array of {tool, ms, ok}
  cache_hit boolean not null default false,
  created_at timestamptz not null default now()
);

create index on public.atlas_context_calls (neid, created_at desc);
```

No other tables in Phase 1. Retailer rosters, NEID caches, and area summaries all live in bundled JSON.

### R2 — Shared package extraction (P0, Phase 1)

#### R2.1 — `@lovelace/retail-map-core`

A new internal npm package:

| source                                                 | Moves to                            | Notes                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/nowcast/NowcastCockpitMap.tsx`         | `core/MapCanvas.tsx`                | Rename, drop the nowcast-specific props (`retailer` becomes a required `retailers: string[]`), keep the five-layer render pipeline.      |
| `src/components/nowcast/NowcastCountyContextPanel.tsx` | `core/AreaContextPanel.tsx`         | Becomes generic: takes `{ neid, area_type }` instead of `{ pinnedCountyFips, pinnedAreaCode }`.                                          |
| `src/lib/api/nowcast-counties.ts`                      | `core/areas.ts`                     | Rename types (`RetailArea` stays); drop the-specific top-N arrays in favor of a data-driven loader reading from `@lovelace/retail-data`. |
| `supabase/functions/_shared/elemental.ts`              | `core/elemental.ts`                 | Verbatim. The helper is already generic.                                                                                                 |
| `supabase/functions/_shared/sse.ts`                    | `core/sse.ts`                       | Verbatim.                                                                                                                                |
| `supabase/functions/nowcast-county-context/index.ts`   | `core/context-handler.ts`           | Extract the Deno-agnostic traversal logic; the edge-function wrapper stays in each app.                                                  |
| `scripts/build-retailer-map-data.ts`                   | `core/scripts/build-map-data.ts`    | Verbatim.                                                                                                                                |
| `scripts/expand-retailer-county-neids.ts`              | `core/scripts/expand-area-neids.ts` | Generalize to area_type param.                                                                                                           |
| `scripts/expand-international-area-neids.ts`           | merge with above                    | Unified in one script.                                                                                                                   |
| `scripts/lib/retail-stores-fips.ts`                    | `core/scripts/lib/fips-enrich.ts`   | Verbatim.                                                                                                                                |
| `scripts/build-international-topojson.sh`              | `core/scripts/build-topojson.sh`    | Verbatim.                                                                                                                                |

#### R2.2 — Package shape

```
@lovelace/retail-map-core
├── dist/                        (compiled; consumers import from here)
│   ├── react/                   MapCanvas, AreaContextPanel, StoreContextPanel
│   ├── data/                    loaders for bundled JSON (area/store/retailer)
│   ├── elemental/               MCP client + context handlers (Deno + Node builds)
│   └── scripts/                 build/expand/enrich — node + deno variants
├── src/                         TypeScript sources
├── package.json
└── README.md
```

Dual-runtime: React components build to an ESM bundle for browsers; scripts and MCP handlers ship both Node (for Retail Atlas edge functions if we move to Fly / Vercel Functions) and Deno (for Supabase edge functions) entry points. existing `elemental.ts` is already Deno-first; Node compatibility is a ~30-line shim.

#### R2.3 — Release cadence

Pre-1.0 semver; version-bumped manually on each consumer update. Published to the Lovelace private npm registry. Retail Atlas pins exact versions.

### R3 — Map canvas (P0, Phase 1)

The headline surface. Lives at `/atlas`.

#### R3.1 — Layer system

The five-layer composite generalizes to **N + 3** layers:

1. **Base country silhouette** (1 layer) — international markets only,
2. **Administrative polygons** (1 layer) — county / LAD / CMA boundaries for whichever country the viewport is focused on.
3. **Retailer choropleth layers** (1 per active retailer, up to 4 simultaneous) — store-count-per-area fill, color-coded per retailer.
4. **NEID halo** (1 layer, merged across retailers) — every area with a resolved NEID + ≥1 active-retailer store gets the halo.
5. **Store dots** (1 per active retailer) — one color / shape per retailer, sized by format (express vs supercenter).
6. **Analysis overlay** (1, optional) — chosen from the recipe library (event-density heat, opened-vs-closed delta, etc.). Rendered above dots, below the halo.
7. **Pinned outline** (1, transient) — the currently-pinned area or store.

#### R3.2 — Controls

- **Retailer chips** (top-left of canvas): one chip per retailer in the data repo; click to toggle that retailer's choropleth + dots. Default state opens with Target + Walmart enabled.
- **Country selector** (top-left, secondary): US / UK / CA in MVP. Switches topojson + projection. Resets retailer chips to retailers native to that country.
- **Overlay picker** (top-right): dropdown with the three MVP recipes + "None."
- **Time-window slider** (bottom): 30 days / 90 days / 12 months / all-time. Drives overlay recomputation; doesn't affect store/area layers.
- **Legend** (bottom-left, collapsible): renders the fill scale, halo meaning, and active dot palettes.

#### R3.3 — Interactions

- **Hover area** → tooltip with area name, per-retailer store counts, halo status.
- **Click area (haloed)** → right-docked Area Context Panel (R6.1); URL updates to `/atlas/area/:area_code`.
- **Hover store dot** → tooltip with retailer, banner/format, address.
- **Click store dot** → right-docked Store Context Panel (R6.2); URL updates to `/atlas/store/:store_id`. Only interactive when the store has a resolved NEID; otherwise tooltip shows "Context unavailable for this store."
- **ESC or background click** → clears pin, URL returns to `/atlas`.

#### R3.4 — Performance budget

- Cold-load time to first interactive frame: ≤ 2.5 s on broadband.
- Hover latency: < 16 ms (one animation frame). Enforced via Chrome performance tests in CI.
- Pan / zoom FPS: ≥ 50 on a 2020-vintage MacBook Air.

### R4 — Multi-retailer overlays (P0, Phase 3)

#### R4.1 — Rendering strategy

Four simultaneous retailer choropleths can't all be solid fills without turning mud. MVP approach:

- **Lead retailer** (first chip activated) → standard sequential-sqrt choropleth, its palette.
- **Other active retailers** → rendered as _pattern overlays_ (hatch / stipple via SVG `<pattern>` definitions) instead of fills. Density controlled by that retailer's store count in the area.

Hover tooltip shows all active retailers' counts regardless of who's drawing the fill. NEID halo is union across all active retailers.

Alternative explored and rejected: multiple semi-transparent fills with `mix-blend-mode: multiply`. Visually appealing but numerically misleading — darker areas read as "more retail" when they might just mean "more retailers overlapping with moderate counts." Pattern overlays keep each retailer's signal independently decodable.

#### R4.2 — Retailer palette

```
Target          hsl(0, 85%, 55%)      red
Walmart         hsl(210, 90%, 55%)    blue
Dollar General  hsl(42, 95%, 55%)     gold
Tesco           hsl(280, 70%, 55%)    purple
Loblaw          hsl(155, 60%, 50%)    teal
```

New retailers added via `@lovelace/retail-data` get auto-assigned the next slot in a 12-color palette; can be overridden per-retailer in the data repo's `retailer_metadata.json`.

### R5 — Store-level entity resolution (P0 for go/no-go, P0 for Phase 2)

The defining technical risk for the product. Everything depends on Phase 0's outcome.

#### R5.1 — Phase 0 coverage probe

Before committing to the Phase 2 build, run a scripted probe that samples 100 stores per retailer (~3,000 total across the 30 MVP retailers) and measures Elemental `elemental_get_entity` hit-rate with a battery of candidate queries:

```
candidates = [
  "{retailer} {store_number}",
  "{retailer} {address_line_1}, {city}",
  "{retailer} {city}, {region}",
  "{retailer} store {store_number} {city}",
  "{banner} {city}" (international sub-brands)
]
```

Threshold definition:

| Hit-rate | Decision                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 60%    | Build store-level NEIDs for the full roster; store dots are click-targets by default.                                                                                 |
| 30 – 60% | Build store-level NEIDs where they resolve; dots are conditionally click-targets (gated on NEID presence). Shopping-center resolution (Phase 3) becomes the fallback. |
| < 30%    | Cancel Phase 2. Product stays area-only; pitch pivots to "county-level context explorer." Shopping-center resolution moves earlier.                                   |

Script: `core/scripts/probe-store-coverage.ts`. Emits a JSON report + a markdown summary; commit both to the data repo for provenance.

#### R5.2 — Full-roster NEID resolution (Phase 2)

Assuming Phase 0 ≥ 30%:

- `scripts/expand-store-neids.ts` — iterates every store in every tracked retailer's normalized JSON, runs the candidate cascade, caches to `data/neid_cache/store_neids.json`. Keyed by `store_id`.
- Concurrency budget: 4 parallel MCP calls, 200 ms politeness delay between batches.
- The realized 30-retailer roster contains ~148k stores. At 4 parallel @ 500 ms / call average, the full run is ~5 hours. Re-runs are incremental (cache hits skip), so steady-state cost after the first sweep is dominated by net-new stores from monthly CSV refreshes.
- Recommended ordering: resolve big-box + grocery + drug first (~30 retailers' worth of headline events), then QSR/coffee in a second pass since those tend to have lower per-store coverage and dominate the row count.
- Re-run cadence: monthly, or on any CSV refresh.

#### R5.3 — Area NEID resolution expansion

The Yottagraph NEID cache covers top-25 per retailer. Retail Atlas needs **every** area a tracked retailer operates in to be clickable. The realized 30-retailer roster (see `data/retail_locations/`) yields **3,591 unique areas** (US counties + UK LADs + CA CMAs), already aggregated by the build pipeline into `public/data/retail_atlas/areas.json` with cross-retailer `store_counts_by_retailer` rolled up. Spot checks per major retailer:

| Retailer       | Areas covered (auto-aggregated) |
| -------------- | ------------------------------- |
| Walmart        | ~2,600 US counties              |
| Dollar General | ~2,800 US counties              |
| McDonald's     | ~2,500 US counties              |
| Subway         | ~2,800 US counties              |
| Starbucks      | ~1,500 US counties              |
| Tesco          | ~350 UK LADs                    |
| Loblaw         | ~80 CA CMAs                     |

The exact per-retailer area counts emit in `retailers.json` after each `npm run build:data` run. `scripts/expand-area-neids.ts` (Phase 1) walks the union set in the same cache-driven mode; incremental re-runs after roster refreshes are cheap.

### R6 — Live context panels (P0, Phase 1 for areas / Phase 2 for stores)

#### R6.1 — Area Context Panel

- Takes `{ neid, area_type, area_name, country, retailers: string[] }`.
- On mount, fires a Supabase edge function `atlas-area-context` that:
    1. Starts an Elemental MCP session.
    2. Parallel: `elemental_get_events(area_neid)`, `elemental_get_related(area_neid, "article", 12)` → `getArticleProperties(…)`, `elemental_get_related(area_neid, "economic_concept", 8)`.
    3. For each active retailer, parallel: `getEntityByCik(retailer_cik)` → `elemental_get_events(retailer_neid)` (retailer-level events).
    4. Returns a unified shape: `{ area_events, area_articles, economic_concepts, retailer_events_by_retailer }`.
- Renders four sections (tabs on narrow viewports): area events, retailer events (per retailer chip), articles, economic concepts.
- Footer: MCP provenance (which tools, how long each took, cache hit-rate over the last 24 h from `atlas_context_calls`).

#### R6.2 — Store Context Panel (Phase 2)

Takes `{ store_id, store_neid, retailer, area_code }`. Different traversal:

1. `elemental_get_events(store_neid)` — store-level events (openings, closures, incidents).
2. `elemental_get_related(store_neid, "article", 8)` — hyperlocal press.
3. `elemental_get_related(store_neid, "organization", 4)` — linked orgs (franchisee, parent, neighbors if shopping-center-resolved).
4. Fallback when store-level has 0 events: promote the surrounding area's event list with a "Store has no direct Elemental events — showing context from {area_name}" header.

#### R6.3 — Caching

Per-NEID context results are cached for 1 hour in Deno KV (Supabase's built-in) keyed by `{neid}:{retailers_hash}`. Cache key includes the active retailer set because the retailer events block varies. Cache hit-rate is logged to `atlas_context_calls.cache_hit`; target 40%+ after a week of usage.

### R7 — Analysis recipes (P0, Phase 3)

The product's differentiator. MVP ships three canonical recipes; users can clone via URL.

#### R7.1 — Recipe 1: Event-density choropleth

For each area in the viewport, compute `events_in_window / store_count` and render as an overlay (diverging color scale, neutral midpoint). Surfaces CBSAs where the world is "unusually loud" relative to how much retail physically lives there.

- Backed by a new edge fn `atlas-event-density` that batches `elemental_get_events(area_neid)` calls (session-pooled) across all visible areas.
- Cached per area for 1 hour; panel viewport triggers at most 100 area queries per load (viewport-clipped).
- UI affordance: hovering an area shows the raw count + the normalized density side by side.

#### R7.2 — Recipe 2: Opened vs closed delta

For each area, compute `(store_opens - store_closes)` for each selected retailer in the time window. Rendered as a diverging choropleth (reds = net closures, greens = net opens).

- Data source: `elemental_get_events` filtered to event types that map to opens/closes (Elemental event taxonomy TBD — probe during build). Fallback: parse `events.summary` text for open/close keywords.
- Works at the retailer-scoped level when the event is attached to the retailer org; attributed to the area via the store's `area_code`.
- Time windows: 90 / 365 / all-time.

#### R7.3 — Recipe 3: Cross-retailer co-occurrence

For a user-selected primary retailer, render a choropleth shaded by `count(primary_retailer_stores) × count(competing_retailer_stores)` — the product. Surfaces areas where two chains are materially co-present (potential competitive hotspots) vs areas where one dominates.

- Pure arithmetic over `store_counts` fields in `area_neids.json`-adjacent metadata. No MCP calls. Recomputes client-side on retailer-chip toggle.
- Secondary UI: a sortable table beneath the map ranking areas by the co-occurrence score, with links to the Area Context Panel for the top 25.

#### R7.4 — URL serialization

Every recipe state serializes into the URL via a compressed query param (`?r=…` for recipe, `?f=…` for filters, `?t=…` for time). Shareable link = product surface. No server-side state needed for recipe sharing.

### R8 — Premium feed composition (P1, Phase 4)

Same pattern PRDs 19 and 20 established. Each feed is a toggle-able overlay + metadata.

```jsonc
{
  "feed": "Placer.ai foot traffic",
  "surface": "store_dot_size" | "area_overlay" | "panel_section",
  "cost_oom_year_1_usd": "100k–250k",
  "expected_insight": "Daily visit counts per store; weekday-vs-weekend ratios; YoY deltas",
  "demo_mode": true
}
```

MVP premium feeds in Phase 4 (toggle-only, mocked until a design partner provisions real data):

- Placer.ai / Advan / SafeGraph — foot traffic. Overlays dot size or a separate choropleth band.
- Yipit / Second Measure — credit-card panel. Adds revenue-per-store / revenue-per-area overlay.
- Planet / BlackSky — imagery. Adds parking-lot-fullness delta as a per-store icon state.
- Panjiva / ImportGenius — customs / BoL. Feeds into the retailer-level context panel (upstream inventory signals).

Toggle infrastructure and cost readout port directly from `available_in_production[]` pattern.

### R9 — Auth + access (P0, Phase 1 minimal; P1, Phase 5 full)

#### R9.1 — Phase 1 minimal

- Supabase Auth email magic-link; no signup, invite-only from a hardcoded allowlist in env.
- Single role (`beta_user`); every logged-in user sees the full canvas.
- Anonymous visits bounce to a marketing page at `/` with a "Request access" form (stores submissions in a `atlas_access_requests` table + emails the Atlas team).

#### R9.2 — Phase 5 full

- Per-tenant workspaces (a tenant = an organization, e.g. a retailer, a REIT, a CI vendor).
- Per-tenant retailer visibility rules (e.g. Target's tenant shouldn't see Walmart's internal comparison recipes by default — symmetric NDA stance).
- Seat-based billing via Stripe.

### R10 — Telemetry + observability (P0, Phase 1)

- Every MCP call logged to `atlas_context_calls`
- Per-load performance marks sent to PostHog: time-to-first-render, time-to-first-interactive, panel-open-latency.
- Error budget: 99% of area clicks resolve a panel in ≤ 8 s; violations paged via Sentry (edge-fn timeouts) and fronted by a graceful fallback message.
- Weekly summary cron (Supabase scheduled fn): top-10 most-clicked areas, top-10 slowest tools, panel cache hit-rate, invite-request count.

### R11 — Design spec (P0, Phase 1)

The Atlas UI emulates signalfromthenoise's layout + theming system wholesale. This keeps the build cheap (most of the tokens and components already exist in `@lovelace/retail-map-core`'s port), gives Lovelace a coherent product family look, and lets a single design pass serve both apps.

#### R11.1 — Design language)

The following are lifted verbatim from [`src/index.css`](../../src/index.css) in the repo and shipped as part of `@lovelace/retail-map-core`'s styles entry point. Atlas imports them and only overrides retailer-specific accent tokens.

**Typography.**

- Primary sans: **Space Grotesk** (300 / 400 / 500 / 600 / 700) — loaded from Google Fonts on app boot.
- Monospace: **JetBrains Mono** (300 / 400 / 500 / 600) — used for numbers, NEIDs, store IDs, area codes, MCP provenance, and the terminal mode.
- Base body size `1.0625rem` (17 px), line-height `1.6`. Tighter in `[data-density="compact"]` (below).

**Color tokens.** Every color in the product reads from a CSS custom property on `:root`. Tokens come in three layers:

1. **Semantic base** — `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--focus-outline`. shadcn/ui convention; every component pulls from these.
2. **Product surfaces** — `--surface`, `--surface-1`, `--surface-2`, `--border-strong`, `--header-bg`, `--header-fg`. These layer the UI: page background → standard card → elevated card → rail / popover. The Atlas map canvas uses `--surface-2` for the legend backdrop and the control chips.
3. **Signal accents** — `--signal-green`, `--signal-amber`, `--signal-red`, `--signal-blue`, `--signal-purple`. Used for data visualization, status chips, and the choropleth ramps. Atlas introduces a fourth layer (retailer palette, below) but composes over these for all status and warning states.

**Modes.** `data-mode="light"` / `data-mode="dark"` (or `.dark` class) toggles the full token set. Persisted per-user in localStorage. Default is `light`; ships with a global mode toggle in the sidebar footer and Atlas does the same.

**Tenant palettes.** `data-tenant-palette="default" | "cyber" | "naval"` skins the entire app with an alternative brand tone. Atlas ships with the same three palettes (Signal Default / Cyber Green / Naval Academy) plus a fourth, **Atlas Graphite**, tuned for long-session analytical use (warm graphite surfaces, reduced saturation). Added to both `src/index.css` and `TENANT_PALETTE_VALUES` in `use-tenant-palette.ts`. Operation follows the pattern documented in [`TENANT_PALETTE_OPERATIONS.md`](TENANT_PALETTE_OPERATIONS.md).

**Terminal mode.** `.terminal` on `<html>` overrides every palette with monochrome amber-on-black + JetBrains Mono for everything including headings. Same boot sequence uses (`src/components/layout/TerminalBootSequence.tsx`). Activated by `g g t` keyboard combo; preserved across Atlas because the map renders cleanly in monochrome (amber halo + amber dots + amber polygon outlines reads surprisingly well).

**Density.** `data-density="comfortable" | "compact"` swaps a set of spacing + type + row-height tokens. Atlas defaults to `compact` on the map canvas (denser tooltips, smaller chips) and `comfortable` on detail pages.

**Focus visibility.** WCAG 2.2 compliant — `:focus-visible` renders a 2px outline in `hsl(var(--focus-outline))`. Every interactive element (retailer chips, halo polygons, store dots via SVG `role=button`) must participate.

#### R11.2 — Retailer palette layer

Atlas adds one layer that a per-retailer color channel for choropleth fills + dot colors + legend chips.

```
--retailer-target:   hsl(0, 85%, 55%)
--retailer-walmart:  hsl(210, 90%, 55%)
--retailer-dg:       hsl(42, 95%, 55%)
--retailer-tesco:    hsl(280, 70%, 55%)
--retailer-loblaw:   hsl(155, 60%, 50%)
```

Defined at `:root`; the retailer chip component resolves `hsl(var(--retailer-{slug}))` at render time. New retailers added to `@lovelace/retail-data` get an auto-assigned slot from a 12-color palette, overridable in `retailer_metadata.json`. Palette values are _brand-adjacent_, not trademark reproductions — we lean 5–10 degrees off exact brand hues to preserve contrast and avoid implying endorsement.

#### R11.3 — Layout: the canvas route

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [☰] WORDMARK       Retail Atlas · Beta          [palette] [mode] [user]  │  ← header bar (--header-bg / --header-fg)
├──┬──────────────────────────────────────────────────────────────────────┤
│  │                                                                       │
│ S│  ┌─ Retailer chips ───────────────┐  ┌─ Time window ─────────────┐    │
│ I│  │ [●Target] [○Walmart] [●DG] ... │  │ 30 / 90 / 365 / all-time  │    │
│ D│  └────────────────────────────────┘  └───────────────────────────┘    │
│ E│                                                                       │
│ B│  ┌─ Country selector ─┐  ┌─ Overlay picker ────────────────────┐     │
│ A│  │ [●US] [UK] [CA]    │  │ None ▾  (Event density ▸ …)          │     │
│ R│  └────────────────────┘  └──────────────────────────────────────┘     │
│  │                                                                       │
│  │  ┌───────────────────────────────────────────────────────────────┐   │
│  │  │                                                                │   │
│  │  │                  MAP CANVAS (d3-geo + SVG)                     │   │
│  │  │                  - basemap silhouette                          │   │
│  │  │                  - area polygons (--surface-2 empty fill)      │   │
│  │  │                  - retailer choropleths                        │   │
│  │  │                  - gold halo on Elemental-tracked areas        │   │
│  │  │                  - store dots                                  │   │
│  │  │                                                                │   │
│  │  │  [legend bottom-left]               [pinned badge top-right]   │   │
│  │  └───────────────────────────────────────────────────────────────┘   │
│  │                                                                       │
│  │  ┌─ Pinned area / store context panel (slides up from bottom) ──┐    │
│  │  │ Birmingham LAD E08000025 · 31 Tesco stores · NEID 04090658…   │    │
│  │  │ [Area events] [Articles] [Economic concepts] [Retailer events]│    │
│  │  │ …                                                              │    │
│  │  └───────────────────────────────────────────────────────────────┘    │
│  │                                                                       │
├──┴──────────────────────────────────────────────────────────────────────┤
│ MCP provenance: last call 1.8s · cache hit-rate 42% · 12 areas pinned    │  ← footer strip (--surface-2)
└─────────────────────────────────────────────────────────────────────────┘
```

Annotated regions:

- **Sidebar** (left, 240 px expanded / 56 px collapsed). . Nav items in MVP: Canvas, Saved recipes, Retailers, Docs, Settings. Collapse state persisted per user in localStorage ( `LS_KEY`). On narrow viewports it collapses to a top drawer.
- **Header bar** (top, 48 px on mobile, embedded above main content on desktop). Background `hsl(var(--header-bg))`, foreground `hsl(var(--header-fg))`. Holds the wordmark, a beta chip, the palette switcher (`data-tenant-palette`), the mode toggle (`data-mode`), and user menu.
- **Control rail** (top of canvas). Four horizontally-grouped controls: retailer chips, country selector, time window, overlay picker. Each is a `Card` with `--surface-2` fill and `--border` strokes. 12 px gap between groups, 8 px internal padding.
- **Map canvas** (main). Full-bleed within the main content column; `min-height: calc(100vh - 200px)`. Responsive to sidebar collapse. Renders inside a `Card` with `--surface-1` fill and a 1 px `--border` stroke. Legend floats bottom-left with `--surface-2` backdrop + 90% opacity + 4 px blur. Pinned badge floats top-right.
- **Context panel** (docked bottom, slides up on pin). 40% viewport height when open; `--surface-1` backdrop; tab strip uses `Tabs` component. Closes with `Esc` or an X button in the panel header. Same component shape as `NowcastCountyContextPanel`.
- **Footer strip** (telemetry). Always visible when a user is in the canvas. Shows last MCP call latency, cache hit-rate for the session, pinned count. `--surface-2` fill, 32 px height, mono font.

#### R11.4 — Component inventory )

All of these come directly from shadcn/ui + extensions and are already available in `@lovelace/retail-map-core`. Atlas imports them; no redesigns.

| Component                                           | source                                | Use in Atlas                                                   |
| --------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| `Card` + `CardContent`                              | `@/components/ui/card`                | Every panel in the canvas.                                     |
| `Button`                                            | `@/components/ui/button`              | Retailer chips, overlay picker trigger, context panel actions. |
| `Badge`                                             | `@/components/ui/badge`               | Beta chip, retailer chip labels, status chips.                 |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | `@/components/ui/tabs`                | Context panel sub-sections (events / articles / concepts).     |
| `Select` / `SelectContent` / `SelectItem`           | `@/components/ui/select`              | Country selector, overlay picker.                              |
| `Tooltip`                                           | `@/components/ui/tooltip`             | Hover tooltips on dots + polygons.                             |
| `Dialog`                                            | `@/components/ui/dialog`              | Saved-recipe confirmation, premium-feed upgrade modals.        |
| `Input` / `Label`                                   | `@/components/ui/{input,label}`       | Recipe naming, filter forms.                                   |
| `ScrollArea`                                        | `@/components/ui/scroll-area`         | Context panel content overflow, ranked-areas table.            |
| `Separator`                                         | `@/components/ui/separator`           | Subsection dividers in panels.                                 |
| `AppSidebar`                                        | `@/components/layout/AppSidebar`      | Directly ported; route entries swapped for Atlas.              |
| `AppLayout`                                         | `@/components/layout/AppLayout`       | Ported with `canvas` layout mode as the default.               |
| `ModeQuickToggle`                                   | `@/components/layout/ModeQuickToggle` | Light / dark / terminal cycler in header.                      |

| `TerminalBootSequence` | `@/components/layout/TerminalBootSequence` | Verbatim port. |

Icon library: **lucide-react**. Atlas-specific icons we need beyond existing: `Map`, `Building`, `MapPin`, `Layers`, `Share2`, `Download` .

#### R11.5 — Iconography + micro-interaction rules

- **Hover transitions** — 150 ms ease-out on opacity / fill / stroke. No bounce, no spring.
- **Pin transition** — 200 ms ease-out slide-up for the context panel (30 px translate + opacity).
- **Loading state** — `Loader2` from lucide with `animate-spin` class. Panel skeleton uses `animate-pulse` on `--muted` blocks. Same pattern as `NowcastCountyContextPanel`.
- **Error state** — `AlertTriangle` icon + `--destructive` color + concise one-line message + "retry" button. Never use the panel width for long stack traces; those go to browser console only.
- **Success state** — no icon flourish. Silent success is rule (see `NowcastDemoResultPanel` for the pattern).
- **Keyboard navigation** — `g h` → `/atlas`, `g s` → saved recipes, `n` → new recipe modal, `Esc` → clear pin, `Cmd/Ctrl + K` → command palette (Phase 3).
- **Empty states** — always include one sentence of guidance + one clickable action, not a bare "no data" message. Example: "No area pinned — click any gold-haloed polygon to load local context."

#### R11.6 — Shared stylesheet structure

Atlas has its own `src/index.css`. The only delta is (a) the addition of the retailer palette variables (R11.2) and (b) the Atlas Graphite tenant palette block.

```
src/index.css
├── @import Google Fonts (Space Grotesk, JetBrains Mono)
├── @tailwind base / components / utilities
├── @layer base {
│   ├── :root, [data-mode="light"]            ← Signal Default / Light
│   ├── [data-mode="dark"], .dark             ← Signal Default / Dark
│   ├── [data-tenant-palette="cyber"]         ← Cyber Green / Light + Dark
│   ├── [data-tenant-palette="naval"]         ← Naval Academy / Light + Dark
│   ├── [data-tenant-palette="graphite"]      ← Atlas Graphite / Light + Dark  (NEW)
│   ├── .terminal                              ← Terminal mode override
│   ├── [data-density="comfortable"]
│   ├── [data-density="compact"]
│   ├── :root retailer palette (R11.2)         (NEW — Atlas only)
│   └── body + :focus-visible                  ← WCAG 2.2 focus outline
└── @layer utilities { … }
```

Operation (palette switching, new palette addition, rollback) follows [`TENANT_PALETTE_OPERATIONS.md`](TENANT_PALETTE_OPERATIONS.md) exactly; Atlas ships its own `/admin/appearance` surface

#### R11.7 — Accessibility posture

- Color contrast: all foreground/background token pairs ≥ WCAG AA in every palette × mode combo. CI checks this via `@adobe/react-spectrum` contrast utility on every palette CSS change.
- The choropleth fill ramp is sequential (single-hue by retailer) — colorblind users get density from lightness; hue carries retailer identity. The halo is **always** `hsl(48, 100%, 70%)` gold regardless of palette because it's a semantic signal, not an aesthetic one.
- Every polygon in the tracked set is exposed as a keyboard-focusable SVG `<g>` with `role="button"` and a text `<title>` child containing the area name + store count + NEID. Tab order follows the visual top-to-bottom / left-to-right polygon order; `Enter` pins the area.
- Store dots default to `pointer-events: none` because Tab-navigating 30k dots is absurd; click-to-context is only surfaced when a user hovers a dot (reveals the clickable cursor + tooltip) or uses `Cmd/Ctrl + K` to search stores by number / address.
- Panel headings use proper `<h2>` / `<h3>` nesting; every `Tabs` instance has an accessible label.

### R12 — Documentation + handoff (P0, Phase 1)

- `README.md` in the app repo: architecture overview, local dev loop, deploy steps.
- `DATA.md`: source-by-source catalog (lift from [`RETAIL_MAP_DATA_SOURCES.md`](RETAIL_MAP_DATA_SOURCES.md), adapted).
- `RECIPES.md`: the three canonical recipes, their math, their expected user questions. Updated as new recipes ship.
- `COVERAGE.md`: auto-regenerated by the NEID-expansion scripts; lists per-retailer area + store NEID resolution rates, last-refreshed-at, known gaps.

## Open questions

1. **Elemental store-level hit-rate.** The single biggest risk. Resolved only by running R5.1's probe. Everything downstream of Phase 1 is conditional on it.
2. **Commercial relationship to Elemental licensing.** Does Retail Atlas sell as a standalone product with its own ARR, or as a vertical bundled into an Elemental license? The PRD assumes standalone; needs confirmation from leadership before Phase 3 scoping.
3. **Data-repo tenancy.** The internal data repo contains CSVs that include some retailer-friendly scraped data (Target's public store locator). If we sell to retailers, some of them will want "remove our roster from the package." How do we gate?
4. **Overture Maps / OSM licensing for international.** The Tesco + Loblaw roster fetchers pull from Overture Maps and OSM respectively. Both are open but carry attribution requirements; need a legal pass before publishing the Atlas product with those rosters visible.
5. **Panel-data partnerships.** Phase 4 is cleaner if we have at least one soft commitment from a panel vendor (Placer, Advan) to integrate via API rather than CSV dump. Worth exploratory conversations during Phase 1 build.
6. **Shopping-center / mall entity coverage in Elemental.** Phase 3 Recipe 3 and the Phase 2 fallback for stores-without-NEIDs both lean on this. A second probe script similar to R5.1 should run during Phase 1 to sanity-check coverage.
7. **International expansion beyond UK + CA.** Mexico and Japan are the obvious next two (Walmart de Mexico, Seven & i) but require new topojson + new enrichment pipelines. Gate on beta traction.

## Status

- **Stack**: Aether (Nuxt 3 + Vue 3 + Vuetify 3 + TS) scaffolded.
- **Data substrate (R1)**: 30 retailer CSVs landed in `data/retail_locations/` (~148k stores). Build pipeline (`scripts/build-retail-data.ts`) normalizes the three schema flavors into `public/data/retail_atlas/{retailers,areas,stores/*}.json` and writes a `manifest.json` with source-CSV sha256s. Wired into `prebuild` for Vercel.
- **Topojson boundaries**: US counties (us-atlas), UK LADs (ONS Dec 2024 BSC), CA CMAs (StatsCan 2021 CBF), world country outlines (world-atlas) committed to `public/data/topojson/`. Verified joins: walmart 1873/1873, target 659/659, dollargeneral 2805/2807, tesco 348/350, loblaw 129/129.
- **Phase 0 (R5.1) — RAN, RESULT = RED.** Probe (`npm run probe:coverage`) sampled 7 retailers (walmart, target, costco, mcdonalds, starbucks, tesco, loblaw) × 15 stores each through `POST /entities/search` with city-first candidate patterns. Strict per-store hit-rate ≤ 7% on every retailer; overall **1% strict / 7% loose**. Per-store entities exist for flagship locations ("Seminole Walmart Supercenter", "St. Johns Walmart Supercenter", "Target SoHo", "San Francisco Costco", "Pike Place Starbucks") but coverage is sparse and naming varies between `organization` and `location` flavors. Most retailers return only the parent company. **Decision: cancel Phase 2 store-level NEID resolution; ship Phase 1 area-only and treat any per-store entities as opportunistic enrichment when they happen to exist for a clicked store.** Probe artifacts in `data/probes/`.
- **Phase 1 R3 (map canvas)**: scaffolded. `/atlas` renders the five-layer composite (basemap silhouette → admin polygons → retailer choropleth → store dots → pinned outline) via d3-geo + SVG. Control rail with retailer chips (defaults Target + Walmart), country selector (US/UK/CA), time-window placeholder, overlay picker. Bottom-up context panel surfaces area or store details when pinned. Dot rendering capped at 5,000 per retailer (sampled evenly) until the canvas-rendering optimization in Phase 1.5 lands. Landing page at `/` lists the 30-retailer roster as deep-link chips.
- **Phase 1 R6 (area context fan-out)**: live, MCP-backed. `server/api/atlas/area-context.post.ts` (Nitro endpoint) opens a per-request MCP session against the lovelace-elemental server via `server/utils/elementalMcp.ts` (Streamable-HTTP transport, `@modelcontextprotocol/sdk` v1.29) and runs five tool calls in parallel inside it: `elemental_get_events(area)`, `elemental_get_related(area, "article")`, `elemental_get_related(area, "economic_concept")`, and one `elemental_get_events` per active retailer slug whose registry entry carries an `org_neid`. The slide-up panel renders all four surfaces (Area events, Retailer events grouped by chip color, Articles, Economic concepts). Articles request the full set of properties carried on article-flavored entities per `elemental_get_schema(article)` — `title`, `published_at`, `original_publication_name`, `has_topic`, `tone`, `title_factuality` — and the panel surfaces topic / tone / factuality as small badges where present. End-to-end fan-out latency lands at ~690 ms in local smoke tests against LA County. **Known limitation**: the article schema does not carry a URL property at all; clicks therefore don't open external pages.
- **Landing**: `/` is the map canvas. `/atlas` is preserved as a route alias for backward links; the prior marketing-style landing was removed at the user's request.
- **Area-NEID resolution**: ran. `scripts/expand-area-neids.ts` resolved **2,318 / 3,601 areas (64.4%)** — UK 93%, CA 86%, US 60% — at score ≥ 0.85, flavor=location/region, with country disambiguation. Cached to `data/neid_cache/area_neids.json` and merged into `areas.json` by `build-retail-data.ts`. The NEID halo (PRD R3.1 layer 4) lights up gold on every haloed area in the map canvas.
- **Phase 1 R9/R10 (auth + telemetry)**: not yet started. The realized stack uses Auth0 (already configured by the Aether template) so R9.1's invite-only Supabase Auth pattern is replaced by Auth0 magic-link plus an allowlist-of-emails gate.

## Modules

| Module                    | Path(s)                                                                                                                     | Purpose                                                                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retail data build         | `data/retail_locations/`, `scripts/build-retail-data.ts`, `scripts/lib/{retailer-registry,normalize}.ts`, `types/retail.ts` | Source-of-truth for the 30-retailer roster; CSV → unified Store/Area JSON; runs on `prebuild`.                                                                                                                                                                                         |
| Topojson fetch            | `scripts/fetch-topojson.ts`, `public/data/topojson/{us,uk,ca,world}/`                                                       | One-shot boundary bundling: us-atlas + world-atlas from npm, ONS LADs + StatsCan CMAs via paginated ArcGIS REST, simplified server-side. `npm run build:topojson`.                                                                                                                     |
| Store-NEID coverage probe | `scripts/probe-store-coverage.ts`, `data/probes/`                                                                           | Phase 0 / R5.1 go/no-go gate. `npm run probe:coverage`. Result on file: RED, area-only.                                                                                                                                                                                                |
| Atlas canvas (R3)         | `pages/atlas.vue`, `components/Atlas{ControlRail,MapCanvas,ContextPanel,Legend}.vue`, `composables/useAtlas{State,Data}.ts` | Phase 1 map UI. d3-geo + SVG. Composes the control rail, the layered canvas, the bottom context panel, and the legend.                                                                                                                                                                 |
| Atlas landing             | `pages/index.vue`                                                                                                           | Replaces the Aether boilerplate with a Retail Atlas hero, stats row, retailer chip roster (deep-links to `/atlas?retailers={slug}`), and Phase status checklist.                                                                                                                       |
| Area context (R6)         | `composables/useAreaContext.ts`, `server/api/atlas/area-context.post.ts`, `server/utils/elementalMcp.ts`                    | Nitro endpoint fans out a pinned area's NEID into events + linked articles + economic concepts + per-retailer events via the Elemental MCP server (Streamable-HTTP).                                                                                                                   |
| Area-NEID expansion       | `scripts/expand-area-neids.ts`, `scripts/lib/region-names.ts`, `data/neid_cache/area_neids.json`                            | Resolves Elemental NEIDs for the 3,601 admin areas via candidate cascades. Cache merged into `areas.json` by build-retail-data on each `npm run build:data`.                                                                                                                           |
| Retailer-NEID expansion   | `scripts/expand-retailer-neids.ts`, `data/neid_cache/retailer_neids.json`                                                   | Resolves parent-corp NEIDs for the 30 retailers (`{name} Inc./Corp./PLC` candidates) via `/entities/search`. 30/30 resolved at score 1.0. Merged into `retailers.json` so the area-context endpoint can surface per-retailer corporate events when an active chip has a resolved NEID. |
