<template>
    <div class="atlas-footer">
        <span class="footer-meta"
            >MCP <span v-if="lastCall">last call {{ lastCall }}ms</span
            ><span v-else>idle</span></span
        >
        <span class="footer-divider">·</span>
        <span class="footer-meta">cache entries {{ cacheStats().entries }}</span>
        <span class="footer-divider">·</span>
        <span class="footer-meta">
            {{ pinnedLabel }}
        </span>
        <span class="footer-spacer" />
        <span class="footer-meta footer-version">{{ version }}</span>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{ lastCall?: number | null }>();

    const { state } = useAtlasState();
    const { cacheStats } = useAtlasContext();

    const version = useRuntimeConfig().public.versionString as string;

    const pinnedLabel = computed(() => {
        if (state.pinnedAreaCode) return `pinned area ${state.pinnedAreaCode}`;
        if (state.pinnedStoreId) return `pinned store ${state.pinnedStoreId}`;
        return 'no pin';
    });

    const lastCall = computed(() => props.lastCall ?? null);
</script>

<style scoped>
    .atlas-footer {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        background: var(--lv-surface-light);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-family: var(--font-mono);
        font-size: 0.7rem;
        color: var(--lv-silver);
    }

    .footer-divider {
        opacity: 0.4;
    }

    .footer-spacer {
        flex: 1;
    }

    .footer-version {
        opacity: 0.5;
    }
</style>
