<template>
    <div class="ranking-table">
        <div class="table-header">
            <div class="header-title">
                Top areas — cross-retailer co-occurrence
                <span v-if="primarySlug" class="muted mono"> primary: {{ primaryName }} </span>
            </div>
            <div class="muted mono">click any row to pin its area</div>
        </div>
        <v-table density="compact" theme="dark" class="table-inner" hover>
            <thead>
                <tr>
                    <th class="rank-col">#</th>
                    <th>Area</th>
                    <th>Country</th>
                    <th class="num-col">Primary</th>
                    <th class="num-col">Competitors</th>
                    <th class="num-col">Score</th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="(row, i) in rows"
                    :key="row.area_key"
                    class="ranking-row"
                    @click="pinArea(row.area_key)"
                >
                    <td class="rank-col mono">{{ i + 1 }}</td>
                    <td>
                        <span class="area-name">{{ row.area_name }}</span>
                        <span v-if="row.region" class="muted">, {{ row.region }}</span>
                    </td>
                    <td class="muted mono">{{ row.country }}</td>
                    <td class="num-col mono">{{ row.numerator?.toLocaleString() }}</td>
                    <td class="num-col mono">{{ row.denominator?.toLocaleString() }}</td>
                    <td class="num-col mono score-cell">
                        {{ row.score.toLocaleString() }}
                    </td>
                </tr>
                <tr v-if="!rows.length">
                    <td colspan="6" class="muted text-center pa-4">
                        Toggle at least two retailers to see co-occurrence rankings.
                    </td>
                </tr>
            </tbody>
        </v-table>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    import { useAtlasRecipe } from '~/composables/useAtlasRecipe';
    import { useAtlasState } from '~/composables/useAtlasState';
    import type { AreaRecord, RetailerSummary } from '~/types/retail';

    const { pinArea } = useAtlasState();
    const { data, scoresByKey, primarySlug, areas, retailers } = useAtlasRecipe();

    const TOP_N = 25;

    const primaryName = computed(() => {
        const list = retailers.value as RetailerSummary[] | null;
        return list?.find((r) => r.slug === primarySlug.value)?.name ?? primarySlug.value;
    });

    interface Row {
        area_key: string;
        area_name: string;
        region: string;
        country: string;
        numerator?: number;
        denominator?: number;
        score: number;
    }

    const rows = computed<Row[]>(() => {
        if (!data.value || data.value.scores.length === 0) return [];
        const list = (areas.value as AreaRecord[] | null) ?? [];
        const byKey = new Map<string, AreaRecord>();
        for (const a of list) byKey.set(a.area_key, a);

        // Sort by score desc, then take top N. Pull display fields from the
        // matching AreaRecord for region / area_name.
        const sorted = [...data.value.scores].sort((a, b) => b.score - a.score);
        const out: Row[] = [];
        for (const s of sorted) {
            if (out.length >= TOP_N) break;
            const a = byKey.get(s.area_key);
            if (!a) continue;
            out.push({
                area_key: s.area_key,
                area_name: a.area_name ?? a.area_code,
                region: a.region ?? '',
                country: a.country,
                numerator: scoresByKey.value.get(s.area_key)?.numerator,
                denominator: scoresByKey.value.get(s.area_key)?.denominator,
                score: s.score,
            });
        }
        return out;
    });
</script>

<style scoped>
    .ranking-table {
        background: rgba(20, 20, 20, 0.85);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        max-height: 32vh;
        overflow-y: auto;
        font-size: 0.85rem;
    }

    .table-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: 8px 16px 4px;
        position: sticky;
        top: 0;
        background: rgba(20, 20, 20, 0.95);
        backdrop-filter: blur(4px);
        z-index: 1;
    }

    .header-title {
        font-family: var(--font-headline, sans-serif);
        font-size: 0.95rem;
    }

    .table-inner {
        background: transparent !important;
    }

    .table-inner :deep(thead th) {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: rgba(255, 255, 255, 0.55);
    }

    .ranking-row {
        cursor: pointer;
    }

    .ranking-row:hover :deep(td) {
        background: rgba(255, 255, 255, 0.04);
    }

    .rank-col {
        width: 40px;
        text-align: right;
        color: rgba(255, 255, 255, 0.45);
    }

    .num-col {
        text-align: right;
        width: 110px;
    }

    .score-cell {
        color: var(--lv-green, #3fea00);
    }

    .area-name {
        font-weight: 500;
    }

    .muted {
        color: rgba(255, 255, 255, 0.45);
    }

    .mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
