# Retail Atlas

A composable retail-store map. Layer 30 retailers' store footprints on a single canvas, click any county / LAD / CMA for live Elemental knowledge-graph context (events, articles, economic concepts, retailer corporate events), compose recipes (event-density choropleth, opens-vs-closes delta, cross-retailer co-occurrence) — all shareable via URL.

Built on the **Aether** app template: Nuxt 3 SPA + Vue 3 + Vuetify 3 + TypeScript, deployed to Vercel, with the Lovelace Elemental MCP server fronting the knowledge graph.

> **Living docs**
>
> - [`DESIGN.md`](DESIGN.md) — Status, modules, what each piece does.
> - [`ROADMAP.md`](ROADMAP.md) — Deferred work, anchored to PRD references.
> - [`design/RETAIL_ATLAS_PRD.md`](design/RETAIL_ATLAS_PRD.md) — Source PRD.
> - [`design/RECIPES.md`](design/RECIPES.md) — Math + caveats for the three analysis recipes.
> - [`DATA.md`](DATA.md) — Source-by-source catalog (CSVs, topojson, NEID caches).
> - [`COVERAGE.md`](COVERAGE.md) — Auto-regenerated NEID resolution rates.

## Quick start

```bash
npm install
npm run dev          # serves at http://localhost:3000 (override with PORT=)
```

The first `dev` run executes `predev` → `node init-project.js --local`, which creates `.env` from `broadchurch.yaml`. The first `build` run executes `prebuild` → `npm run build:data` to regenerate `public/data/retail_atlas/*.json` from the source CSVs.

## Architecture

```
data/
  retail_locations/       Source: 30 enriched per-retailer store CSVs (~148k rows)
    _audit/{slug}_audit.json   Per-retailer geocode outlier reports
    _source/walmart_ceo.csv    Raw upstream pull (kept for provenance)
  neid_cache/             Output of NEID-expansion scripts; merged into runtime JSON
    area_neids.json       3,601 admin areas → Elemental NEIDs
    retailer_neids.json   30 retailers → parent-org NEIDs
  probes/                 Read-only output of probe scripts (committed for provenance)

scripts/                  Build pipeline + ops scripts (TypeScript via tsx)
  build-retail-data.ts          CSV → unified Store / Area JSON; runs on `prebuild`
  fetch-topojson.ts             us-atlas + world-atlas + ONS LADs + StatsCan CMAs
  expand-area-neids.ts          Resolves NEIDs for the 3,601 admin areas
  expand-retailer-neids.ts      Resolves parent-corp NEIDs for the 30 retailers
  probe-store-coverage.ts       Phase 0 R5.1 go/no-go probe (RAN, RESULT = RED)
  probe-event-categories.ts     R7.2 step 3a — taxonomy probe
  build-coverage.ts             Reads the report JSONs, emits COVERAGE.md
  lib/{retailer-registry,normalize,region-names}.ts

types/retail.ts           Canonical Store / Area / Retailer / Recipe types

public/data/              (generated; gitignored under retail_atlas/, committed under topojson/)
  retail_atlas/           manifest.json + retailers.json + areas.json + stores/{slug}.json
  topojson/{us,uk,ca,world}/  Boundary geometries (committed)

components/Atlas*.vue     Map canvas, control rail, context panel, legend,
                          ranking table, share button, saved-views menu.
composables/useAtlas*.ts  Reactive state (state / data / recipe / url-sync /
                          telemetry / saved-recipes).

server/api/atlas/         Nitro routes:
  area-context.post.ts            R6.1 fan-out (events + articles + concepts +
                                   retailer events) via MCP, KV-cached 1h.
  recipe/event-density.post.ts    R7.1 top-K=100 fan-out, KV-cached 1h.
  recipe/opens-closes.post.ts     R7.2 retailer-event classification + area
                                   attribution, KV-cached 6h.
  telemetry/summary.get.ts        R10 aggregator — cache hit-rate, p50/p95.

server/utils/
  elementalMcp.ts         withElementalMcp(fn) — Streamable-HTTP MCP transport.
  atlasKv.ts              withKvCache + logToolCalls + readToolCalls.
```

## Dev loop

```bash
npm run dev               # Nuxt dev server, HMR
npm run build             # production build (auto-runs prebuild → build:data)
npm run preview           # serve the production build locally
npm run format            # Prettier (always run before committing — pre-commit
                          # hook will reject otherwise)
```

### Data-pipeline scripts

```bash
npm run build:data        # CSV → JSON; runs automatically on `build`
npm run build:topojson    # Re-fetch boundaries (rare; data refresh only)
npm run build:coverage    # Regenerate COVERAGE.md from the report JSONs

npm run expand:areas      # Resolve admin-area NEIDs (idempotent; ~7 min for 3,601)
npm run expand:retailers  # Resolve parent-corp NEIDs (~30 retailers, ~30 s)

npm run probe:coverage         # R5.1 store-NEID coverage probe
npm run probe:event-categories # R7.2 event-taxonomy probe
```

The expand scripts are idempotent — they only resolve entries missing from the cache. Pass `RESET=1` to ignore the cache and re-resolve everything.

## Deploy

Push to `main` → Vercel auto-deploys. The `prebuild` hook regenerates `public/data/retail_atlas/*.json` from the committed source CSVs, so deploys never depend on a freshly-run pipeline. Topojson + NEID cache files are committed, so they're available without re-running their scripts.

### Environment variables

`broadchurch.yaml` is the source of truth for tenant config. `init-project.js --local` derives `.env` from it. For Vercel deploys, mirror these in the project's environment-variable settings:

| Var                         | Source               | Purpose                                                        |
| --------------------------- | -------------------- | -------------------------------------------------------------- |
| `NUXT_PUBLIC_GATEWAY_URL`   | `broadchurch.yaml`   | Lovelace gateway base URL                                      |
| `NUXT_PUBLIC_TENANT_ORG_ID` | `broadchurch.yaml`   | Tenant id (path segment in MCP routes)                         |
| `NUXT_PUBLIC_QS_API_KEY`    | `broadchurch.yaml`   | Query Server / gateway API key                                 |
| `NUXT_PUBLIC_AUTH0_*`       | `broadchurch.yaml`   | Auth0 SPA config                                               |
| `KV_REST_API_URL`           | Vercel KV / Upstash  | R-001 cache + R-007 telemetry + R9.1 access requests; optional |
| `KV_REST_API_TOKEN`         | Vercel KV / Upstash  | …same. All helpers no-op gracefully when unset.                |
| `ATLAS_ALLOWLIST`           | hand-curated         | R9.1 invite-list — comma-separated emails. Empty = no gate.    |
| `RESEND_API_KEY`            | Resend               | R-014 access-request email notification provider key.          |
| `ATLAS_NOTIFY_EMAIL`        | your ops mailbox     | R-014 notification destination (who gets new access requests). |
| `ATLAS_NOTIFY_FROM`         | Resend-verified from | Optional sender; defaults to `onboarding@resend.dev`.          |

## How the data flows

```
[CSV in data/retail_locations/]
        │  scripts/build-retail-data.ts
        ▼
[public/data/retail_atlas/{retailers,areas,stores/*}.json]
        │
        ├─ async loaded by useAtlasData composable
        │
        ▼
[AtlasMapCanvas.vue]  ←  d3-geo + topojson-client (public/data/topojson/)
        │
        │  on click (haloed area) →
        ▼
[POST /api/atlas/area-context]
        │  withKvCache (1h) → withElementalMcp →
        ▼
[lovelace-elemental MCP] over Streamable-HTTP via the gateway
        │
        ▼ events / articles / concepts / retailer events
[AtlasContextPanel.vue]
```

For recipe routes (`/api/atlas/recipe/*`), the same KV-cache + MCP path applies; recipe scores then drive the choropleth fill via `useAtlasRecipe`.

## Testing

There is no test runner in the project today. Verification is via:

- `npm run build` (catches type / route compile errors)
- `npm run dev` + manual smoke against `localhost:3000`
- The Nitro routes are smoke-tested by curl against the live MCP backend during each substantive change — sample command in [`design/RECIPES.md`](design/RECIPES.md).

## Status + roadmap

[`DESIGN.md`](DESIGN.md) tracks shipped status by phase; [`ROADMAP.md`](ROADMAP.md) tracks deferred items by ID. Per the source PRD: Phase 0 ran (RED → Phase 2 cancelled), Phase 1 + Phase 3 are shipped, Phase 4 + Phase 5 are open.
