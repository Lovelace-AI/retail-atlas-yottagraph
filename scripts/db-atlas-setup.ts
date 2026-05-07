#!/usr/bin/env tsx

/**
 * R-015 Phase A setup.
 *
 * Initializes Neon tables for the Atlas substrate. Safe to run repeatedly.
 *
 * Usage:
 *   npm run db:atlas:setup
 */

import 'dotenv/config';

import { ensureAtlasTables, getDb } from '../server/utils/neon';

async function main(): Promise<void> {
    const sql = getDb();
    if (!sql) {
        console.error('DATABASE_URL not configured. Cannot initialize Neon schema.');
        process.exit(1);
    }

    await ensureAtlasTables(sql);
    console.log('Neon Atlas tables initialized.');
}

void main().catch((err) => {
    console.error(err);
    process.exit(1);
});
