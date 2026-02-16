#!/usr/bin/env node
/**
 * Seed manager accounts (cj000001, cj000002)
 * Run: node portal/seed-managers.js
 * 
 * Creates two manager accounts with secure random passwords.
 * IMPORTANT: Save the passwords - they cannot be recovered.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./db');

async function seed() {
    await db.initPortalDb();

    const managers = [
        { username: 'cj000001', email: process.env.MANAGER1_EMAIL || null },
        { username: 'cj000002', email: process.env.MANAGER2_EMAIL || null },
    ];

    console.log('Creating manager accounts...\n');

    for (const m of managers) {
        try {
            const existing = await db.get('SELECT id FROM portal_users WHERE username = ?', [m.username]);
            if (existing) {
                console.log(`${m.username} already exists - skipping`);
                continue;
            }
            const { username, password } = await db.createManagerAccount(m.username, m.email);
            console.log(`${username}`);
            console.log(`  Password: ${password}`);
            console.log(`  SAVE THIS PASSWORD - it cannot be recovered!\n`);
        } catch (err) {
            console.error(`Failed to create ${m.username}:`, err.message);
        }
    }

    console.log('Done. Managers can log in at /portal');
}

seed().catch(console.error);
