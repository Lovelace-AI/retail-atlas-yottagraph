#!/usr/bin/env node
/* eslint-disable */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const areas = JSON.parse(
    readFileSync(path.join(root, 'public/data/retail-atlas/areas.json'), 'utf8')
).areas;
const retailers = JSON.parse(
    readFileSync(path.join(root, 'public/data/retail-atlas/retailers.json'), 'utf8')
).retailers;

const formats = {
    target: ['SuperTarget', 'General Merchandise', 'Small Format'],
    walmart: ['Supercenter', 'Neighborhood Market', 'Walmart'],
    'dollar-general': ['Discount', 'DG Market', 'pOpshelf'],
    tesco: ['Extra', 'Superstore', 'Metro', 'Express'],
    loblaw: ['Loblaws', 'Real Canadian Superstore', 'No Frills', 'Shoppers Drug Mart'],
};

const banners = {
    target: [null],
    walmart: [null],
    'dollar-general': [null, 'pOpshelf'],
    tesco: [null],
    loblaw: ['Loblaws', 'Real Canadian Superstore', 'No Frills', 'Shoppers Drug Mart'],
};

// Deterministic PRNG so re-runs produce the same store set.
function mulberry32(seed) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const rand = mulberry32(42);

function jitter(coord) {
    // ~ ±0.15 degrees ≈ 12 km of spread per area centroid
    return coord + (rand() - 0.5) * 0.3;
}

function pick(arr) {
    return arr[Math.floor(rand() * arr.length)];
}

const stores = [];
let counter = 0;

for (const area of areas) {
    for (const retailer of retailers) {
        const present = (area.store_counts ?? {})[retailer.slug] ?? 0;
        if (!present) continue;
        // Render up to 4 representative stores per (retailer × area).
        const display = Math.min(4, Math.max(1, Math.round(Math.sqrt(present))));
        for (let i = 0; i < display; i++) {
            counter++;
            const lat = jitter(area.centroid[1]);
            const lng = jitter(area.centroid[0]);
            const banner = pick(banners[retailer.slug]);
            const format = pick(formats[retailer.slug]);
            const storeNumber = 1000 + counter;
            // Roughly 35% of stores have store-level NEID coverage for the
            // demo dataset (matches the PRD's R5.1 30–60% tier).
            const hasNeid = rand() < 0.35;
            stores.push({
                store_id: `${retailer.slug}-${storeNumber}`,
                retailer: retailer.slug,
                retailer_name: retailer.name,
                banner,
                format,
                country: area.country,
                area_code: area.area_code,
                area_type: area.area_type,
                area_name: area.area_name,
                region: area.region,
                lat: Number(lat.toFixed(5)),
                lng: Number(lng.toFixed(5)),
                address: `${100 + Math.floor(rand() * 900)} Market St`,
                city: area.area_name,
                store_number: storeNumber,
                neid: hasNeid ? `00514461${String(counter).padStart(12, '0')}` : null,
            });
        }
    }
}

writeFileSync(
    path.join(root, 'public/data/retail-atlas/stores.json'),
    JSON.stringify({ stores }, null, 2) + '\n'
);

console.log(`Wrote ${stores.length} stores across ${areas.length} areas.`);
