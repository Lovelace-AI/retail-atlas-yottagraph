# Retail Atlas — analysis recipes

Each recipe is a per-area scoring function that drives the canvas choropleth. Recipes are surfaced via the rail's overlay picker and selected through the URL param `?r=…` (see [`pages/index.vue`](../pages/index.vue) and [`composables/useAtlasUrlSync.ts`](../composables/useAtlasUrlSync.ts)).

The atlas ships with three recipes today; new ones plug in via [`composables/useAtlasRecipe.ts`](../composables/useAtlasRecipe.ts) and a corresponding Nitro endpoint (or pure-client compute for math-only recipes).

| Key                  | Label                        | Backend                                | Scale      | Question it answers                                                                                                     |
| -------------------- | ---------------------------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `co_occurrence`      | Cross-retailer co-occurrence | client-only                            | sequential | Where are two (or more) retailers materially co-present, suggesting competitive hotspots?                               |
| `event_density`      | Event density                | `POST /api/atlas/recipe/event-density` | diverging  | Which counties / LADs / CMAs are unusually loud relative to how much retail physically lives there?                     |
| `opens_minus_closes` | Opens − closes               | `POST /api/atlas/recipe/opens-closes`  | diverging  | Where is the retail footprint expanding (greens) and where is it contracting (reds) per active retailer in this window? |

## R7.3 — Cross-retailer co-occurrence

Pure arithmetic over `public/data/retail_atlas/areas.json`'s `store_counts_by_retailer`. No MCP calls.

For each area:

1. Pick the **primary retailer** = the active retailer with the highest global store count.
2. Sum the store counts of all _other_ active retailers — that's the **competitor mass**.
3. `score = primary × competitor`.
4. Areas where either side is zero are skipped (uninformative).

Sequential green ramp. Areas with the highest score glow brightest.

The `AtlasRankingTable` mounts when this recipe is active and shows the top 25 areas by score (click any row to pin its area). Together they answer "where do these chains overlap, and how heavily?" in a single glance.

## R7.1 — Event density

Diverging-around-median fan-out via Elemental.

1. Server reads `areas.json`, filters to the requested country, NEID-resolved areas with at least one active-retailer store. Sorts by `total_stores` desc, takes top **K = 100** (substitutes "viewport-clipped" until zoom lands; flagged via `truncated: true`).
2. Inside one MCP session, an **adaptive two-pass** fan-out runs at concurrency 4:
    - **Fast pass**: `elemental_get_events(area_neid, time_range, limit: 50)` for every area.
    - **Deep follow-up**: any area whose fast pass returned exactly 50 events (cap-tripped) is re-queried with `limit: 500`. The deep count replaces the fast count for scoring.
    - Areas still capped at ≥500 are tallied into `capped_areas` on the response and surfaced in the legend as "{N} areas capped at ≥500 events".
3. `score = event_count / total_stores`. Domain capped at the 95th percentile so a single outlier doesn't crush the ramp; midpoint at the median so "typical density" sits visually neutral.

Time windows: `30 / 90 / 365 / all` (translate to `time_range: { after }` on the server). Module-level cache in the composable for one hour keyed by `(country, retailers_hash, time_window)`; server-side KV cache also for one hour.

**Why the two-pass**: probed (`scripts/probe-event-total.ts`) — MCP returns `total === min(real_count, limit)`, so a single low-limit call can't distinguish 50-event areas from 500-event areas. The fast/deep split keeps the typical 80%+ of areas on the cheap path while letting dense counties separate properly. Latency: ~7 s when no areas trip the cap, ~10–15 s when many do.

## R7.2 — Opens − closes delta

Diverging red↔grey↔green fan-out at the retailer-org level.

For each active retailer with a resolved `org_neid`:

1. `elemental_get_events(org_neid, time_range, limit: 100, include_participants: true)`.
2. Each event is classified as **open (+1)**, **close (−1)**, or **neither (0)** via:
    - **Category exact-match**: `OPEN_CATEGORIES = ["Launch of a new product"]`, `CLOSE_CATEGORIES = []`. List sourced from [`data/probes/event-categories-2026-05-06T16-59-53-090Z.md`](../data/probes/event-categories-2026-05-06T16-59-53-090Z.md). Update both the probe report and the constants together when re-running.
    - **Keyword regex** on `name + description` as fallback. Close patterns take precedence over open ("opens new store while closing two others" → -1).
3. **Area attribution**: scan `participants[]`; zero-pad each NEID to 20 chars (the standard Lovelace gotcha — relationship-property values arrive 18-19 chars and need padding); look up against the active country's `areas.json`. Each matched area receives the signal.

Per-area: `score = opens − closes`. Domain mirrored about zero so reds and greens have equal visual weight.

### Honest-signal disclaimer

Per the step-3a probe, the Elemental knowledge graph does NOT carry a discrete "Store opening" / "Store closure" event category — only "Launch of a new product" matched. The keyword fallback is the primary signal source. Two known limits:

1. **Most retailer-level events do not carry county-granularity participants.** A retailer's event feed often surfaces with the retailer org plus state-level locations (e.g. "California") which don't match our county-keyed `areas.json`. Result: many areas still show zero score even after fallback. Areas that do show a score remain trustworthy; absent score does not mean "no activity".
2. **Guarded text fallback is now US-only and strict.** If participant attribution yields zero matches, we run a conservative text parser that only accepts explicit `"<area suffix>, <state code>"` phrases (e.g., `"Fulton County, GA"`, `"McDonald County, MO"`). This avoids the old false-positive class where bare county names collide with brand terms (for example `"McDonald's"` vs `"McDonald County"`). It improves recall modestly without opening the broad ambiguity floodgate.
3. **Full area-name NER is still deferred.** UK/CA text attribution and fuzzy US text attribution remain out of scope until a proper NER pass lands (R-006).

## URL serialization (R7.4)

Every recipe state is two-way bound to the URL via [`useAtlasUrlSync.ts`](../composables/useAtlasUrlSync.ts):

| Param  | Encodes                           | Default (omitted) | Example                   |
| ------ | --------------------------------- | ----------------- | ------------------------- |
| `c`    | country                           | `US`              | `c=UK`                    |
| `r`    | recipe                            | `none`            | `r=event_density`         |
| `t`    | time window                       | `365`             | `t=90`                    |
| `f`    | active retailers, comma-separated | `target,walmart`  | `f=walmart,target,costco` |
| `halo` | NEID-halo layer toggle            | `1`               | `halo=0`                  |
| `p`    | pinned area or store              | (none)            | `p=area:US:county:06037`  |

Always uses `router.replace`, never `push` — chip toggles must not pollute browser history. Every state→URL diff applies through this code path; mount-time URL→state hydration runs before the watcher arms so a deep link doesn't immediately rewrite the URL it just landed on.

The `AtlasShareButton` (link icon at the right end of the rail) copies the current URL — already encoded — to the clipboard. That's the "shareable link is the product" surface from PRD R7.4.

## Adding a recipe

1. Add the key to `RecipeKey` in [`types/retail.ts`](../types/retail.ts).
2. Add the dispatch case in `useAtlasRecipe.load()` — pure client compute for math-only recipes, or a `$fetch` to a new Nitro endpoint for fan-out recipes.
3. Update the rail's overlay picker options in [`components/AtlasControlRail.vue`](../components/AtlasControlRail.vue).
4. If the recipe needs a secondary surface (R7.3 has a ranking table), gate its mount in [`pages/index.vue`](../pages/index.vue).
5. Document the math here.

The canvas + legend re-derive everything from `RecipeResult.scale | domain | midpoint` so they don't need per-recipe code — ship a recipe by shipping data, not a UI rewrite.
