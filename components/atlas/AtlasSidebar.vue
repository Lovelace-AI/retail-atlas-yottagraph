<template>
    <v-navigation-drawer :rail="state.sidebarCollapsed" permanent class="atlas-sidebar" width="220">
        <div class="sidebar-header">
            <button class="collapse-btn" @click="toggleSidebar" :aria-label="'Toggle sidebar'">
                <v-icon size="small">{{
                    state.sidebarCollapsed ? 'mdi-menu' : 'mdi-menu-open'
                }}</v-icon>
            </button>
            <span v-if="!state.sidebarCollapsed" class="sidebar-brand">RETAIL ATLAS</span>
        </div>

        <v-list nav density="compact" class="sidebar-list">
            <v-list-item
                v-for="item in items"
                :key="item.to"
                :to="item.to"
                :prepend-icon="item.icon"
                :title="item.title"
                exact
            />
        </v-list>

        <template #append>
            <div class="sidebar-footer" v-if="!state.sidebarCollapsed">
                <div class="density-toggle">
                    <button
                        class="density-btn"
                        :class="{ active: state.density === 'compact' }"
                        @click="setDensity('compact')"
                    >
                        Compact
                    </button>
                    <button
                        class="density-btn"
                        :class="{ active: state.density === 'comfortable' }"
                        @click="setDensity('comfortable')"
                    >
                        Comfort
                    </button>
                </div>
            </div>
        </template>
    </v-navigation-drawer>
</template>

<script setup lang="ts">
    const { state, toggleSidebar, setDensity } = useAtlasState();

    const items = [
        { title: 'Canvas', icon: 'mdi-map', to: '/atlas' },
        { title: 'Recipes', icon: 'mdi-bookmark-multiple', to: '/atlas/recipes' },
        { title: 'Retailers', icon: 'mdi-storefront', to: '/atlas/retailers' },
        { title: 'Docs', icon: 'mdi-book-open-variant', to: '/atlas/docs' },
    ];
</script>

<style scoped>
    .atlas-sidebar :deep(.v-navigation-drawer__content) {
        background: var(--lv-surface);
    }

    .sidebar-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 12px 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .collapse-btn {
        background: transparent;
        border: none;
        color: var(--lv-silver);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
    }

    .collapse-btn:hover {
        color: var(--lv-white);
        background: rgba(255, 255, 255, 0.04);
    }

    .sidebar-brand {
        font-family: var(--font-mono);
        font-size: 0.8rem;
        letter-spacing: 0.1em;
        color: var(--lv-green);
    }

    .sidebar-list {
        padding-top: 12px;
    }

    .sidebar-list :deep(.v-list-item) {
        font-family: var(--font-primary);
        font-size: 0.85rem;
        color: var(--lv-white);
    }

    .sidebar-list :deep(.v-list-item--active) {
        background: rgba(63, 234, 0, 0.08);
        color: var(--lv-green-light);
    }

    .sidebar-footer {
        padding: 8px 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .density-toggle {
        display: flex;
        gap: 4px;
    }

    .density-btn {
        flex: 1;
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--lv-silver);
        border-radius: 4px;
        padding: 4px 6px;
        font-family: var(--font-mono);
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        cursor: pointer;
    }

    .density-btn.active {
        border-color: var(--lv-green);
        color: var(--lv-green-light);
        background: rgba(63, 234, 0, 0.08);
    }
</style>
