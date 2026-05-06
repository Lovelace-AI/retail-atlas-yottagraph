<template>
    <div class="control-rail">
        <!-- Country selector -->
        <v-card class="rail-card" variant="outlined" density="compact">
            <div class="rail-card-label">Country</div>
            <v-btn-toggle
                :model-value="country"
                @update:model-value="(v: any) => v && setCountry(v)"
                density="compact"
                variant="outlined"
                color="primary"
                mandatory
                divided
            >
                <v-btn value="US" size="small">US</v-btn>
                <v-btn value="UK" size="small">UK</v-btn>
                <v-btn value="CA" size="small">CA</v-btn>
            </v-btn-toggle>
        </v-card>

        <!-- Retailer chips -->
        <v-card class="rail-card chips-card" variant="outlined">
            <div class="rail-card-label">
                Retailers
                <span class="muted"
                    >({{ activeRetailers.length }} of {{ countryRetailers.length }} active)</span
                >
            </div>
            <div class="chips-container">
                <v-chip
                    v-for="r in countryRetailers"
                    :key="r.slug"
                    :color="activeRetailers.includes(r.slug) ? 'primary' : undefined"
                    :variant="activeRetailers.includes(r.slug) ? 'flat' : 'tonal'"
                    size="small"
                    class="retailer-chip"
                    :style="{
                        '--chip-accent': r.color,
                        borderColor: activeRetailers.includes(r.slug) ? r.color : 'transparent',
                    }"
                    @click="toggleRetailer(r.slug)"
                >
                    <span class="chip-dot" :style="{ background: r.color }" />
                    {{ r.name }}
                    <span class="muted ml-1">{{ formatCount(r.store_count) }}</span>
                </v-chip>
                <v-chip
                    v-if="loading"
                    size="small"
                    variant="tonal"
                    prepend-icon="mdi-loading"
                    class="retailer-chip"
                >
                    Loading retailers…
                </v-chip>
            </div>
        </v-card>

        <!-- Time window -->
        <v-card class="rail-card" variant="outlined" density="compact">
            <div class="rail-card-label">Time window</div>
            <v-btn-toggle
                :model-value="timeWindow"
                @update:model-value="(v: any) => v && (timeWindow = v)"
                density="compact"
                variant="outlined"
                color="primary"
                mandatory
                divided
            >
                <v-btn value="30" size="small">30d</v-btn>
                <v-btn value="90" size="small">90d</v-btn>
                <v-btn value="365" size="small">12mo</v-btn>
                <v-btn value="all" size="small">All</v-btn>
            </v-btn-toggle>
        </v-card>

        <!-- Overlay picker -->
        <v-card class="rail-card" variant="outlined" density="compact">
            <div class="rail-card-label">Overlay</div>
            <v-select
                v-model="overlay"
                :items="overlayOptions"
                density="compact"
                hide-details
                variant="outlined"
                style="min-width: 180px"
            />
        </v-card>

        <!-- Layers (NEID halo + future toggles) -->
        <v-card class="rail-card" variant="outlined" density="compact">
            <div class="rail-card-label">Layers</div>
            <v-switch
                v-model="showHalo"
                density="compact"
                hide-details
                color="warning"
                inset
                :label="'NEID halo'"
                aria-label="Toggle gold glow on Elemental-resolved areas"
                class="halo-switch"
            />
        </v-card>
    </div>
</template>

<script setup lang="ts">
    import { computed, onMounted } from 'vue';

    import { useAtlasData } from '~/composables/useAtlasData';
    import { useAtlasState } from '~/composables/useAtlasState';
    import type { RetailerSummary } from '~/types/retail';

    const { country, activeRetailers, timeWindow, overlay, showHalo, setCountry, toggleRetailer } =
        useAtlasState();
    const { loadRetailers, retailers, retailersLoading } = useAtlasData();

    const loading = retailersLoading;

    onMounted(async () => {
        await loadRetailers();
    });

    const countryRetailers = computed<RetailerSummary[]>(() => {
        const all = retailers.value ?? [];
        return all.filter((r) => r.country === country.value);
    });

    const overlayOptions = [
        { value: 'none', title: 'None' },
        { value: 'event_density', title: 'Event density (R7.1)' },
        { value: 'opens_minus_closes', title: 'Opens − closes (R7.2)' },
        { value: 'co_occurrence', title: 'Cross-retailer co-occurrence (R7.3)' },
    ];

    function formatCount(n: number): string {
        if (n < 1_000) return String(n);
        if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
        return `${Math.round(n / 1_000)}k`;
    }
</script>

<style scoped>
    .control-rail {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        padding: 12px;
        background: rgba(20, 20, 20, 0.6);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .rail-card {
        padding: 8px 12px;
        background: rgba(28, 28, 28, 0.9);
        border-color: rgba(255, 255, 255, 0.08) !important;
    }

    .rail-card-label {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(255, 255, 255, 0.55);
        margin-bottom: 6px;
    }

    .chips-card {
        flex: 1 1 auto;
        min-width: 320px;
    }

    .chips-container {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        max-height: 88px;
        overflow-y: auto;
    }

    .retailer-chip {
        cursor: pointer;
        transition: all 150ms ease-out;
    }

    .chip-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 6px;
        vertical-align: middle;
    }

    .muted {
        color: rgba(255, 255, 255, 0.4);
        font-size: 0.75em;
    }

    .halo-switch :deep(.v-label) {
        font-size: 0.8rem;
        opacity: 0.85;
    }
</style>
