<template>
    <v-tooltip :text="copied ? 'Copied!' : 'Copy shareable URL'">
        <template #activator="{ props }">
            <v-btn
                v-bind="props"
                :icon="copied ? 'mdi-check' : 'mdi-link-variant'"
                size="small"
                variant="text"
                :color="copied ? 'success' : 'default'"
                aria-label="Copy current view URL to clipboard"
                @click="copy"
            />
        </template>
    </v-tooltip>
</template>

<script setup lang="ts">
    import { ref } from 'vue';

    /**
     * Copies `window.location.href` (which already encodes the current atlas
     * state via useAtlasUrlSync). Brief checkmark + tooltip change confirms
     * the action — no toast.
     */
    const copied = ref(false);

    async function copy() {
        try {
            const url = typeof window !== 'undefined' ? window.location.href : '';
            if (!url) return;
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                // Fallback for older browsers — create a transient textarea.
                const ta = document.createElement('textarea');
                ta.value = url;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            copied.value = true;
            setTimeout(() => {
                copied.value = false;
            }, 1500);
        } catch (err) {
            console.warn('[AtlasShareButton] clipboard write failed:', err);
        }
    }
</script>
