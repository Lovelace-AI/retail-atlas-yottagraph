/**
 * R-012 — client-side perf marks.
 *
 * This composable records core UX timings and forwards them to PostHog when
 * a `window.posthog.capture()` client is present. It is intentionally safe
 * when analytics is unset: all methods become no-ops.
 *
 * Metrics emitted:
 * - `ttfr_ms` (once/session): time-to-first-render for the map canvas.
 * - `ttfi_ms` (once/session): time-to-first-interactive after first render.
 * - `panel_open_latency_ms` (per area pin): area-context panel load latency.
 */

type PanelOutcome = 'ok' | 'error';

interface PostHogLike {
    capture: (event: string, properties?: Record<string, unknown>) => void;
}

let _ttfrSent = false;
let _ttfiSent = false;
let _pendingPanelStart: number | null = null;
let _pendingPanelAreaKey: string | null = null;

function hasPerfApi(): boolean {
    return typeof window !== 'undefined' && typeof performance !== 'undefined';
}

function posthogClient(): PostHogLike | null {
    if (typeof window === 'undefined') return null;
    const candidate = (window as unknown as { posthog?: PostHogLike }).posthog;
    if (!candidate || typeof candidate.capture !== 'function') return null;
    return candidate;
}

function captureMetric(metric: string, ms: number, extra: Record<string, unknown> = {}): void {
    const ph = posthogClient();
    if (!ph) return;
    ph.capture('atlas_perf_metric', {
        app: 'retail-atlas',
        metric,
        ms: Math.round(ms),
        ...extra,
    });
}

export function usePerfMarks() {
    function markFirstRenderOnce(source = 'atlas-map-canvas'): void {
        if (!hasPerfApi() || _ttfrSent) return;
        _ttfrSent = true;
        captureMetric('ttfr_ms', performance.now(), { source });
    }

    function markFirstInteractiveOnce(source = 'atlas-map-canvas'): void {
        if (!hasPerfApi() || _ttfiSent) return;
        _ttfiSent = true;
        captureMetric('ttfi_ms', performance.now(), { source });
    }

    function startPanelOpen(areaKey: string): void {
        if (!hasPerfApi()) return;
        _pendingPanelStart = performance.now();
        _pendingPanelAreaKey = areaKey;
    }

    function finishPanelOpen(outcome: PanelOutcome, cacheHit: boolean): void {
        if (!hasPerfApi() || _pendingPanelStart == null) return;
        const elapsed = performance.now() - _pendingPanelStart;
        captureMetric('panel_open_latency_ms', elapsed, {
            outcome,
            cache_hit: cacheHit,
            area_key: _pendingPanelAreaKey,
        });
        _pendingPanelStart = null;
        _pendingPanelAreaKey = null;
    }

    function cancelPanelOpen(): void {
        _pendingPanelStart = null;
        _pendingPanelAreaKey = null;
    }

    return {
        markFirstRenderOnce,
        markFirstInteractiveOnce,
        startPanelOpen,
        finishPanelOpen,
        cancelPanelOpen,
    };
}
