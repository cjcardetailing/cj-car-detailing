/**
 * Portal Database - SQLite setup and queries for CJ Detailing employee portal
 * Handles users, employees, managers, sessions, and password resets
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'portal.db');

let db = null;

function getDb() {
    if (!db) {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) console.error('Portal DB connection error:', err);
        });
    }
    return db;
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function execMany(statements) {
    return statements.reduce((p, sql) => p.then(() => run(sql.trim())), Promise.resolve());
}

function initPortalDb() {
    const statements = [
        `CREATE TABLE IF NOT EXISTS portal_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('manager', 'employee')),
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS portal_employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
            full_name TEXT,
            dob TEXT,
            bsb TEXT,
            account_number TEXT,
            phone TEXT,
            availability TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS portal_managers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS portal_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            device_info TEXT,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS portal_password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS portal_booking_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cal_booking_uid TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
            amount REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(cal_booking_uid)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_portal_users_username ON portal_users(username)`,
        `CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON portal_sessions(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON portal_sessions(token_hash)`,
        `CREATE INDEX IF NOT EXISTS idx_portal_assignments_user ON portal_booking_assignments(user_id)`,
    ];

    return execMany(statements).catch((err) => {
        console.error('Portal DB init error:', err);
        throw err;
    });
}

/** Generate a cryptographically secure random password */
function generateSecurePassword(length = 16) {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    let pwd = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) pwd += chars[bytes[i] % chars.length];
    return pwd;
}

/** Get next employee username (cj1xxxxx) */
async function getNextEmployeeUsername() {
    const row = await get(
        `SELECT username FROM portal_users WHERE role = 'employee' ORDER BY username DESC LIMIT 1`
    );
    if (!row) return 'cj100001';
    const num = parseInt(row.username.replace('cj', ''), 10);
    return `cj${num + 1}`;
}

/** Create manager account (pre-seeded) - returns { username, password } */
async function createManagerAccount(username, email) {
    const password = generateSecurePassword(16);
    const hash = await bcrypt.hash(password, 12);
    await run(
        `INSERT INTO portal_users (username, password_hash, role, email) VALUES (?, ?, 'manager', ?)`,
        [username, hash, email || null]
    );
    const user = await get(`SELECT id FROM portal_users WHERE username = ?`, [username]);
    await run(`INSERT INTO portal_managers (user_id) VALUES (?)`, [user.id]);
    return { username, password };
}

/** Create employee account - returns { username, password, userId } */
async function createEmployeeAccount(name, dob, managerUserId, email = null) {
    const username = await getNextEmployeeUsername();
    const password = generateSecurePassword(16);
    const hash = await bcrypt.hash(password, 12);
    await run(
        `INSERT INTO portal_users (username, password_hash, role, email) VALUES (?, ?, 'employee', ?)`,
        [username, hash, email]
    );
    const user = await get(`SELECT id FROM portal_users WHERE username = ?`, [username]);
    await run(
        `INSERT INTO portal_employees (user_id, full_name, dob) VALUES (?, ?, ?)`,
        [user.id, name, dob]
    );
    return { username, password, userId: user.id, email };
}

/** Validate credentials - returns user object or null */
async function validateCredentials(username, password) {
    const user = await get(
        `SELECT id, username, password_hash, role, email FROM portal_users WHERE username = ?`,
        [username]
    );
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
}

/** Create session for "remember 30 days" */
async function createSession(userId, deviceInfo, days = 30) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    await run(
        `INSERT INTO portal_sessions (user_id, token_hash, device_info, expires_at) VALUES (?, ?, ?, ?)`,
        [userId, tokenHash, deviceInfo || '', expires.toISOString()]
    );
    return token;
}

/** Validate session token */
async function validateSession(token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await get(
        `SELECT s.user_id, u.username, u.role, u.email 
         FROM portal_sessions s 
         JOIN portal_users u ON u.id = s.user_id 
         WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
        [hash]
    );
    if (!row) return null;
    return { userId: row.user_id, username: row.username, role: row.role, email: row.email };
}

/** Create password reset token */
async function createPasswordResetToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);
    await run(
        `INSERT INTO portal_password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
        [userId, tokenHash, expires.toISOString()]
    );
    return token;
}

/** Use password reset token and set new password */
async function usePasswordResetToken(token, newPassword) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await get(
        `SELECT id, user_id FROM portal_password_resets 
         WHERE token_hash = ? AND expires_at > datetime('now') AND used = 0`,
        [hash]
    );
    if (!row) return false;
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await run(`UPDATE portal_users SET password_hash = ? WHERE id = ?`, [passwordHash, row.user_id]);
    await run(`UPDATE portal_password_resets SET used = 1 WHERE id = ?`, [row.id]);
    return true;
}

/** Get employee by user_id */
async function getEmployeeByUserId(userId) {
    return get(
        `SELECT e.*, u.username, u.email 
         FROM portal_employees e 
         JOIN portal_users u ON u.id = e.user_id 
         WHERE e.user_id = ?`,
        [userId]
    );
}

/** Get all employees (for manager) */
async function getAllEmployees() {
    return all(
        `SELECT e.*, u.username, u.email 
         FROM portal_employees e 
         JOIN portal_users u ON u.id = e.user_id 
         ORDER BY u.username`
    );
}

/** Update employee profile - employees can update certain fields, managers can update bank details */
async function updateEmployee(userId, data, isManager = false) {
    const allowed = ['full_name', 'dob', 'phone', 'availability'];
    if (isManager) allowed.push('bsb', 'account_number');
    const updates = [];
    const values = [];
    for (const [k, v] of Object.entries(data)) {
        if (allowed.includes(k) && v !== undefined) {
            updates.push(`${k} = ?`);
            values.push(v);
        }
    }
    if (updates.length === 0) return;
    updates.push(`updated_at = datetime('now')`);
    values.push(userId);
    await run(
        `UPDATE portal_employees SET ${updates.join(', ')} WHERE user_id = ?`,
        values
    );
    if (data.email !== undefined) {
        await run(`UPDATE portal_users SET email = ? WHERE id = ?`, [data.email, userId]);
    }
}

/** Update user email (for password reset / notifications) */
async function updateUserEmail(userId, email) {
    await run(`UPDATE portal_users SET email = ? WHERE id = ?`, [email, userId]);
}

/** Get user by id */
async function getUserById(userId) {
    return get(`SELECT id, username, role, email FROM portal_users WHERE id = ?`, [userId]);
}

/** Get user by username or email (for password reset) */
async function getUserByUsernameOrEmail(usernameOrEmail) {
    return get(
        `SELECT id, username, email FROM portal_users WHERE username = ? OR email = ?`,
        [usernameOrEmail, usernameOrEmail]
    );
}

/** Assign booking to employee for payroll */
async function assignBookingToEmployee(calBookingUid, userId, amount) {
    await run(
        `INSERT OR REPLACE INTO portal_booking_assignments (cal_booking_uid, user_id, amount) 
         VALUES (?, ?, ?)`,
        [calBookingUid, userId, amount]
    );
}

/** Get payroll totals per employee for period */
async function getPayrollByEmployee(bookingIds) {
    if (!bookingIds || bookingIds.length === 0) return [];
    const placeholders = bookingIds.map(() => '?').join(',');
    return all(
        `SELECT u.id as user_id, u.username, e.full_name, e.bsb, e.account_number, e.phone, u.email,
                COALESCE(SUM(a.amount), 0) as total_owed
         FROM portal_users u
         JOIN portal_employees e ON e.user_id = u.id
         LEFT JOIN portal_booking_assignments a ON a.user_id = u.id AND a.cal_booking_uid IN (${placeholders})
         WHERE u.role = 'employee'
         GROUP BY u.id`,
        bookingIds
    );
}

/** Get all assignments for a set of bookings */
async function getAssignmentsForBookings(bookingIds) {
    if (!bookingIds || bookingIds.length === 0) return {};
    const placeholders = bookingIds.map(() => '?').join(',');
    const rows = await all(
        `SELECT cal_booking_uid, user_id, amount FROM portal_booking_assignments 
         WHERE cal_booking_uid IN (${placeholders})`,
        bookingIds
    );
    const map = {};
    for (const r of rows) map[r.cal_booking_uid] = { userId: r.user_id, amount: r.amount };
    return map;
}

module.exports = {
    getDb,
    run,
    get,
    all,
    initPortalDb,
    generateSecurePassword,
    createManagerAccount,
    createEmployeeAccount,
    validateCredentials,
    createSession,
    validateSession,
    createPasswordResetToken,
    usePasswordResetToken,
    getEmployeeByUserId,
    getAllEmployees,
    updateEmployee,
    updateUserEmail,
    getUserById,
    getUserByUsernameOrEmail,
    assignBookingToEmployee,
    getPayrollByEmployee,
    getAssignmentsForBookings,
};
