# Retail Atlas — Roadmap

Deferred work, anchored to [`DESIGN.md`](DESIGN.md) and [`design/RETAIL_ATLAS_PRD.md`](design/RETAIL_ATLAS_PRD.md). When a PR-sized chunk is ready to pick up, find the entry, check the dependencies, and write a plan against it.

## Legend

| Status              | Meaning                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `Queued`            | Clearly defined; pickable next.                                           |
| `Blocked-on-data`   | Code path is doable, but the underlying signal isn't in the graph yet.    |
| `Blocked-on-design` | Implementation is straightforward; the open question is product/UX shape. |
| `Won't-fix`         | Documented and intentionally not pursued. Includes rationale.             |
| `Cancelled`         | Worked once, decided against. See PRD R5.1 store-NEID resolution.         |

## Status snapshot (2026-05-06)

| PRD phase                                  | Status                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Phase 0** — Elemental store-NEID probe   | DONE → RED. < 10% strict per-store hit-rate; Phase 2 cancelled. Per-store entities are opportunistic. |
| **Phase 1** — Map canvas (R1, R2, R3)      | SHIPPED. 30 retailers, 148k stores, 3,601 areas, 2,318 area NEIDs, halo + dot layers + control rail.  |
| **Phase 1 R6** — Live area context fan-out | SHIPPED via MCP (events + articles + concepts + retailer events).                                     |
| **Phase 2** — Store-level NEID resolution  | CANCELLED per Phase 0.                                                                                |
| **Phase 3 R4/R7** — Recipes + URL sync     | SHIPPED. Three recipes (co-occurrence, event-density, opens-closes) + `?r=&f=&t=&c=&p=&halo=` sync.   |
| **R-001 / R-007** — KV cache + telemetry   | SHIPPED. Cache wraps all three fan-out routes; telemetry list + summary endpoint live.                |
| **Phase 4 R8** — Premium feeds             | NOT STARTED.                                                                                          |
| **Phase 5 R9.2 / saved state / DB cache**  | NOT STARTED.                                                                                          |

---

## User-flagged deferrals (from the R7 plan close-out)

These are the five out-of-scope items the user called out explicitly when closing the R7 plan. Track here so they don't get lost.

### R-001 · Server-side KV cache of recipe + area-context results — SHIPPED

- **PRD:** R6.3.
- **Status:** `Shipped` (commit `9b5e93d`).
- **Where it landed:** [`server/utils/atlasKv.ts`](server/utils/atlasKv.ts) — `withKvCache(opts, fn)` read-through helper using Upstash via the existing `getRedis()`. Wired into all three fan-out routes ([`area-context.post.ts`](server/api/atlas/area-context.post.ts), [`recipe/event-density.post.ts`](server/api/atlas/recipe/event-density.post.ts), [`recipe/opens-closes.post.ts`](server/api/atlas/recipe/opens-closes.post.ts)) with TTLs 1 h, 1 h, 6 h respectively. Cache key is sha256-truncated and array-input-sorted so `[a,b]` and `[b,a]` collapse. Each route returns `cache_hit` + `cache_age_ms` in its response.
- **Graceful degrade:** when `KV_REST_API_URL` / `KV_REST_API_TOKEN` are unset, `getRedis()` returns null and `withKvCache` bypasses to `fn()` directly; `cache_hit` is always false. Verified locally.

### R-002 · Saved recipes per user

- **PRD:** R7.4 / Phase 5.
- **Status:** `Queued` (Phase 5 per PRD, but trivially shippable now).
- **Effort:** half-day to a day.
- **Today:** `useAtlasUrlSync` makes the URL the canonical recipe state — copy/paste is the only "save". No per-user storage of named recipes.
- **Plan sketch:** Add a `Pref<SavedRecipe[]>` (see [`composables/usePrefsStore.ts`](composables/usePrefsStore.ts) — KV-backed). Store the URL-encoded query plus a user-supplied label. Add a "Save view" button to the rail next to `AtlasShareButton`; add a "Saved views" submenu in the user menu of [`components/AppHeader.vue`](components/AppHeader.vue). Per-user, no sharing semantics yet.
- **Phase-5 expansion:** When multi-tenant lands, recipes graduate from `Pref<>` to a `atlas_saved_recipes` Postgres table per PRD R1.2.

### R-003 · Map zoom/pan + true viewport-clipping

- **PRD:** Underpins the "viewport-clipped" wording in R7.1 + general UX expectations.
- **Status:** `Blocked-on-design`.
- **Effort:** 1–2 person-weeks (it's a meaningful canvas refactor).
- **Today:** [`components/AtlasMapCanvas.vue`](components/AtlasMapCanvas.vue) fits-to-country with no zoom/pan. R7.1 substitutes "top-K=100 by store count" for "what's on screen". Works for the headline US use case where the top-100 most-populous counties cover the visible signal anyway, but breaks down for international markets and long-tail counties.
- **Plan sketch:** Switch from a static `geoPath()` to a `d3.zoom()`-driven projection transform. Introduce a `viewportBounds` ref the recipe endpoints can take as an input bbox; pass to the server so the top-K filter becomes a real bbox filter. Persist zoom level + center in the URL (`?z=3.4&cx=-98&cy=39`). Re-cap dot rendering at viewport-density rather than per-retailer.
- **Watch out for:** SVG perf at city-level zoom. Probably wants a switch to canvas/WebGL rendering for dots; the polygons stay SVG. Document the transition triggers.

### R-004 · Premium-feed overlays (R8)

- **PRD:** R8 / Phase 4.
- **Status:** `Blocked-on-design` (commercial → first design partner) and `Blocked-on-data` (no panel-vendor API contract yet).
- **Effort:** ~1 person-week per feed once a partner contract is in place.
- **Today:** Not started. The PRD enumerates four feed kinds (foot traffic, credit-card panel, satellite imagery, customs) and the `available_in_production[]` toggle pattern.
- **Plan sketch:** Each feed is a toggleable overlay alongside the recipe layer in the rail. Feeds in demo mode render mocked deterministic-from-NEID data so the UX is testable; flipping `demo_mode: false` requires a real data backend. The R7 recipe-result plumbing (`scale`, `domain`, `midpoint`, `scores`) probably accommodates premium feeds with no shape change — the feed becomes another `RecipeKey` value.
- **Sub-deferral R-004a:** Ranked-areas tables for R7.1 (event-density) and R7.2 (opens-closes). Per the PRD only R7.3 ships with a table; the other two recipes can grow one if the choropleth alone is too dense for analyst use.

### R-005 · LZ-string URL compression

- **PRD:** R7.4 says "compressed query param" but readable comma lists ship today.
- **Status:** `Won't-fix unless asked`.
- **Why:** The encoded URL with all six params and a moderately long retailer list ("walmart,target,costco,mcdonalds,starbucks,dollargeneral") is ~150 chars. Well under URL length limits everywhere; gzip-on-the-wire shrinks it further. Compression turns a debuggable URL into a `?s=N4Igzg9hCG...` opaque blob.
- **Re-open trigger:** If the URL exceeds ~600 chars (e.g. when saved-recipes start packing dot-cluster IDs or panel layouts), revisit. [`composables/useAtlasUrlSync.ts`](composables/useAtlasUrlSync.ts) is the right place to plug LZ-string when that day comes.

---

## Other deferrals tracked across the build

These weren't on the user's flagged list but were called out as "out of scope / Phase X" inline during prior work. Carrying them forward so they don't get forgotten.

### R-006 · NER-backed area attribution for R7.2

- **PRD:** R7.2 fallback — "parse `events.summary` text for open/close keywords".
- **Status:** `Blocked-on-design`.
- **Today:** [`server/api/atlas/recipe/opens-closes.post.ts`](server/api/atlas/recipe/opens-closes.post.ts) attributes events to areas via zero-padded participant NEID match only. A description-text fallback was prototyped and removed because "McDonald's" the brand collides with "McDonald County, MO" any time the company is named. Result: R7.2 is sparse but trustworthy.
- **Plan sketch:** Use `elemental_get_entity` per event-NEID with a richer property fetch and look for explicit location-flavored relationships, OR run a secondary pass through a real NER model (spaCy / OpenAI / etc.) on the description string with the area-name list as an anchor vocabulary. Reject candidates that look like company names (cross-check against `retailer_neids.json`). See [`design/RECIPES.md`](design/RECIPES.md) for the full caveat list.
- **Effort:** ~3 days for an MCP-side fix if Lovelace can promote location attribution; ~1 person-week for in-app NER.

### R-007 · Telemetry persistence (R10) — SHIPPED

- **PRD:** R10.
- **Status:** `Shipped` (commit `1203a5b`).
- **Where it landed:** [`server/utils/atlasKv.ts`](server/utils/atlasKv.ts) `logToolCalls()` — fire-and-forget LPUSH to a 10k-cap Upstash list keyed `atlas:tel:v1`. All three fan-out routes call it post-response with sanitized request dimensions (no NEIDs). [`server/api/atlas/telemetry/summary.get.ts`](server/api/atlas/telemetry/summary.get.ts) reads + aggregates: count, cache_hit_rate, p50/p95 latency overall + per endpoint, top retailers, recent 50 raw entries. Auth-gated by Auth0 cookie. Session-level surface in the footer strip via [`composables/useAtlasTelemetry.ts`](composables/useAtlasTelemetry.ts) — shows cache-hit-rate + last latency for the current page session.
- **Deferred slice:** PostHog browser perf marks (TTFR, panel-open-latency) — see new entry **R-012** below.
- **Deferred slice:** Admin dashboard page rendering the summary endpoint — see new entry **R-013** below.

### R-008 · Article publication date / URL

- **PRD:** R6.1 implicit (the panel renders a feed of articles).
- **Status:** `Won't-fix without graph schema change`.
- **Why:** [`design/RECIPES.md`](design/RECIPES.md) summary applies here too: probed `elemental_get_schema(article)` — articles carry 13 properties but `published_at` is rarely populated and there's no URL property at all. The MCP server's `resolution.skipped` confirms this isn't fuzzy-match miss.
- **Re-open trigger:** If/when the upstream NewsData ingestion adds canonical URL or richer published-at fields. Track via a periodic re-probe with `scripts/probe-article-properties.ts` (rebuild from git history if needed).

### R-009 · Lift R7.1's per-area event cap

- **PRD:** Extension of R7.1.
- **Status:** `Queued, low priority`.
- **Today:** [`server/api/atlas/recipe/event-density.post.ts`](server/api/atlas/recipe/event-density.post.ts) caps each `elemental_get_events` call at `limit: 50`. Top counties (DC, Manhattan, Ventura, Fulton) all hit ceiling and tie at the leader board.
- **Plan sketch:** Either (a) raise the cap to 200+ at the cost of fan-out latency, or (b) fall back to `elemental_get_events(area, …, total_only: true)` if such a flag exists; check the MCP `elemental_get_events` schema. Cap of 50 is fine until users complain about leader-board ties.

### R-010 · Hover tooltips upgraded from native SVG to Vuetify

- **PRD:** R3.3 doesn't specify; this is UX polish.
- **Status:** `Queued, low priority`.
- **Today:** [`components/AtlasMapCanvas.vue`](components/AtlasMapCanvas.vue) uses native SVG `<title>` on every `<path>` and `<circle>`. Browsers render this with their own tooltip styling (slow, OS-dependent, can't include rich content).
- **Plan sketch:** Switch to a Vue-based hover tooltip — track mouse position, render an absolutely-positioned `<div>` with the same content. Allows formatting (chips for retailers, mini sparklines, etc.). Risk: 3,600 polygons each emitting mouse events; need event delegation on the SVG root.

### R-011 · Dot rendering to canvas

- **PRD:** R3.4 perf budget — pan/zoom FPS ≥ 50.
- **Status:** `Queued, blocked on R-003 (zoom/pan)`.
- **Today:** SVG renders capped at 5,000 dots per active retailer. Comfortable at the current fit-to-country view; will buckle at zoom levels that pull in 20k+ stores.
- **Plan sketch:** Add a `<canvas>` overlay sibling to the SVG. Project per-store coords through the same `d3.geoPath()` projection. Hit-test on click via reverse geometry (find nearest dot). Switch when stores per viewport > N.

---

### R-012 · PostHog client-side perf marks

- **PRD:** R10 — PRD calls for time-to-first-render, time-to-first-interactive, and panel-open-latency in PostHog.
- **Status:** `Queued`.
- **Today:** Server-side latency is captured (R-007). Client-side TTFR / panel-open-latency are not.
- **Plan sketch:** Tiny `usePerfMarks` composable that wraps `performance.mark` / `performance.measure` and posts to PostHog (or any analytics provider) on key UI events: first canvas render, first context-panel open, recipe selection. ~half-day with the right SDK in place.

### R-013 · Admin telemetry dashboard page

- **PRD:** R10 — "Weekly summary cron: top-10 most-clicked areas, top-10 slowest tools, panel cache hit-rate, invite-request count".
- **Status:** `Queued, blocked-on-design`.
- **Today:** [`/api/atlas/telemetry/summary`](server/api/atlas/telemetry/summary.get.ts) returns the data; nobody renders it.
- **Plan sketch:** New `pages/admin/telemetry.vue` (RBAC-gated when Phase 5 auth lands; for now any logged-in user can hit it since auth is single-role per PRD R9.1). Vuetify table + a couple of `chroma-js`-backed sparklines. Half-day max.

## Won't-fix / cancelled

| ID    | Title                                         | Why                                                                                                                                                                                                                            |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-CX1 | **Phase 2 store-NEID resolution (PRD R5.2)**  | Phase 0 RED. Per-store entities are sparsely indexed in the graph (~10% strict hit-rate); the product pivots to area-only context with opportunistic per-store enrichment when hits exist. See `data/probes/store-coverage-*`. |
| R-CX2 | **Description-text area NER (R7.2 fallback)** | "McDonald's" ↔ "McDonald County, MO" false-positive class drowns the signal. Re-enable behind real NER — see R-006.                                                                                                            |

---

## How to consume this

When picking up an item:

1. Find the entry above. Check `Status` and `Dependencies`.
2. Cross-reference [`DESIGN.md`](DESIGN.md) for the Phase 1 substrate it'll integrate with.
3. Cross-reference [`design/RETAIL_ATLAS_PRD.md`](design/RETAIL_ATLAS_PRD.md) for the original PRD-level intent.
4. Write a plan in plan mode (or inline) — the prior plans live in `.cursor/plans/`. Confirm dependencies cleared, write the plan.
5. Execute. Update this doc when the entry ships (status → `SHIPPED`) or new dependencies surface.

---

_Last updated: 2026-05-06. When you ship one of these, edit this file and commit alongside the change._
