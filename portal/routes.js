/**
 * Portal API routes - auth, manager, employee endpoints
 */

const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');
const cal = require('./cal');
const { createTransporter, sendPasswordResetEmail, sendEmployeeCredentialsEmail } = require('../email');

const JWT_SECRET = process.env.JWT_SECRET || process.env.PORTAL_JWT_SECRET || 'cj-portal-secret-change-in-production';
const JWT_EXPIRY = '24h';
const SESSION_DAYS = 30;

/** Auth middleware - validates JWT or session token */
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = { userId: decoded.userId, username: decoded.username, role: decoded.role };
        return next();
    } catch {
        const session = await db.validateSession(token);
        if (session) {
            req.user = { userId: session.userId, username: session.username, role: session.role };
            return next();
        }
        return res.status(401).json({ error: 'Unauthorized' });
    }
}

/** Require manager role */
function requireManager(req, res, next) {
    if (req.user?.role !== 'manager') return res.status(403).json({ error: 'Manager access required' });
    next();
}

/** Require employee role */
function requireEmployee(req, res, next) {
    if (req.user?.role !== 'employee') return res.status(403).json({ error: 'Employee access required' });
    next();
}

/** Mask BSB and account number for display */
function maskBankDetails(bsb, accountNumber) {
    if (!bsb && !accountNumber) return { bsb: '', account_number: '', masked: '' };
    const b = (bsb || '').replace(/\d/g, 'x');
    const a = (accountNumber || '').replace(/\d(?=\d{4})/g, 'x');
    return { bsb: b || '', account_number: a || '', masked: `${b} •••• ${a}` };
}

function registerPortalRoutes(app) {
    // Login
    app.post('/api/portal/login', async (req, res) => {
        try {
            const { username, password, trustDevice } = req.body;
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password required' });
            }

            const user = await db.validateCredentials(username, password);
            if (!user) return res.status(401).json({ error: 'Invalid username or password' });

            let sessionToken = null;
            if (trustDevice) {
                sessionToken = await db.createSession(user.id, req.headers['user-agent'], SESSION_DAYS);
            }

            const jwtToken = jwt.sign(
                { userId: user.id, username: user.username, role: user.role },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRY }
            );

            res.json({
                token: jwtToken,
                sessionToken: sessionToken || undefined,
                user: { id: user.id, username: user.username, role: user.role },
            });
        } catch (err) {
            console.error('Portal login error:', err);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    // Get current user
    app.get('/api/portal/me', authMiddleware, async (req, res) => {
        try {
            if (req.user.role === 'employee') {
                const emp = await db.getEmployeeByUserId(req.user.userId);
                if (emp) {
                    const { bsb, account_number, masked } = maskBankDetails(emp.bsb, emp.account_number);
                    return res.json({
                        ...req.user,
                        profile: {
                            full_name: emp.full_name,
                            dob: emp.dob,
                            bsb,
                            account_number,
                            masked,
                            phone: emp.phone,
                            email: emp.email,
                            availability: emp.availability || null,
                        },
                    });
                }
            }
            res.json(req.user);
        } catch (err) {
            console.error('Portal me error:', err);
            res.status(500).json({ error: 'Failed to get user' });
        }
    });

    // Request password reset
    app.post('/api/portal/reset-password', async (req, res) => {
        try {
            const { usernameOrEmail } = req.body;
            if (!usernameOrEmail) return res.status(400).json({ error: 'Username or email required' });

            const user = await db.getUserByUsernameOrEmail(usernameOrEmail);
            if (!user || !user.email) {
                return res.status(200).json({ message: 'If an account exists, a reset link was sent' });
            }

            const token = await db.createPasswordResetToken(user.id);
            const baseUrl = process.env.PORTAL_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
            const resetUrl = `${baseUrl}/portal/reset.html?token=${token}`;
            await sendPasswordResetEmail(user.email, resetUrl);

            res.status(200).json({ message: 'If an account exists, a reset link was sent' });
        } catch (err) {
            console.error('Reset password error:', err);
            res.status(500).json({ error: 'Failed to send reset email' });
        }
    });

    // Confirm password reset
    app.post('/api/portal/reset-password/confirm', async (req, res) => {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword || newPassword.length < 8) {
                return res.status(400).json({ error: 'Valid token and password (min 8 chars) required' });
            }
            const ok = await db.usePasswordResetToken(token, newPassword);
            if (!ok) return res.status(400).json({ error: 'Invalid or expired reset link' });
            res.json({ message: 'Password reset successful' });
        } catch (err) {
            console.error('Reset confirm error:', err);
            res.status(500).json({ error: 'Failed to reset password' });
        }
    });

    // --- Manager routes ---
    app.get('/api/portal/manager/revenue', authMiddleware, requireManager, async (req, res) => {
        try {
            const period = req.query.period || 'month';
            const data = await cal.getPastBookings(period);
            res.json(data);
        } catch (err) {
            console.error('Manager revenue error:', err);
            res.status(500).json({ error: 'Failed to fetch revenue' });
        }
    });

    app.get('/api/portal/manager/bookings', authMiddleware, requireManager, async (req, res) => {
        try {
            const period = req.query.period || 'month';
            const data = await cal.getPastBookings(period);
            const assignments = await db.getAssignmentsForBookings(data.bookings.map((b) => b.id));
            res.json({ bookings: data.bookings, assignments });
        } catch (err) {
            console.error('Manager bookings error:', err);
            res.status(500).json({ error: 'Failed to fetch bookings' });
        }
    });

    app.post('/api/portal/manager/assign-booking', authMiddleware, requireManager, async (req, res) => {
        try {
            const { bookingUid, userId, amount } = req.body;
            if (!bookingUid || !userId || amount == null) {
                return res.status(400).json({ error: 'bookingUid, userId, amount required' });
            }
            await db.assignBookingToEmployee(bookingUid, userId, amount);
            res.json({ ok: true });
        } catch (err) {
            console.error('Assign booking error:', err);
            res.status(500).json({ error: 'Failed to assign' });
        }
    });

    app.get('/api/portal/manager/payroll', authMiddleware, requireManager, async (req, res) => {
        try {
            const period = req.query.period || 'month';
            const { bookings } = await cal.getPastBookings(period);
            const ids = bookings.map((b) => b.id);
            const employees = await db.getAllEmployees();
            const owedByUser = {};
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                const rows = await db.all(
                    `SELECT user_id, amount FROM portal_booking_assignments WHERE cal_booking_uid IN (${placeholders})`,
                    ids
                );
                for (const row of rows) {
                    owedByUser[row.user_id] = (owedByUser[row.user_id] || 0) + row.amount;
                }
            }

            const payroll = employees.map((e) => ({
                user_id: e.user_id,
                username: e.username,
                full_name: e.full_name,
                email: e.email,
                phone: e.phone,
                bsb: e.bsb,
                account_number: e.account_number,
                amount_owed: owedByUser[e.user_id] || 0,
            }));

            res.json({ payroll, totalOwed: Object.values(owedByUser).reduce((a, b) => a + b, 0) });
        } catch (err) {
            console.error('Manager payroll error:', err);
            res.status(500).json({ error: 'Failed to fetch payroll' });
        }
    });

    app.get('/api/portal/manager/employees', authMiddleware, requireManager, async (req, res) => {
        try {
            const employees = await db.getAllEmployees();
            const list = employees.map((e) => ({
                user_id: e.user_id,
                username: e.username,
                full_name: e.full_name,
                dob: e.dob,
                email: e.email,
                phone: e.phone,
                bsb: e.bsb,
                account_number: e.account_number,
            }));
            res.json({ employees: list });
        } catch (err) {
            console.error('Manager employees error:', err);
            res.status(500).json({ error: 'Failed to fetch employees' });
        }
    });

    app.post('/api/portal/manager/employees', authMiddleware, requireManager, async (req, res) => {
        try {
            const { name, dob, email } = req.body;
            if (!name || !dob) return res.status(400).json({ error: 'Name and DOB required' });

            const { username, password, userId } = await db.createEmployeeAccount(name, dob, req.user.userId, email);

            const emp = await db.getEmployeeByUserId(userId);
            const toEmail = email || emp?.email;
            if (toEmail) {
                const portalUrl = `${process.env.PORTAL_BASE_URL || 'https://cjdetailing.shop'}/portal`;
                await sendEmployeeCredentialsEmail(toEmail, username, password, portalUrl);
            }

            res.json({ username, password, userId });
        } catch (err) {
            console.error('Create employee error:', err);
            res.status(500).json({ error: 'Failed to create employee' });
        }
    });

    app.put('/api/portal/manager/employees/:id', authMiddleware, requireManager, async (req, res) => {
        try {
            const userId = parseInt(req.params.id, 10);
            if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' });
            await db.updateEmployee(userId, req.body, true);
            res.json({ ok: true });
        } catch (err) {
            console.error('Update employee error:', err);
            res.status(500).json({ error: 'Failed to update' });
        }
    });

    // --- Employee routes ---
    app.get('/api/portal/employee/earnings', authMiddleware, requireEmployee, async (req, res) => {
        try {
            const period = req.query.period || 'month';
            const { bookings } = await cal.getPastBookings(period);
            const assignments = await db.getAssignmentsForBookings(bookings.map((b) => b.id));
            let total = 0;
            for (const [uid, a] of Object.entries(assignments)) {
                if (a.userId === req.user.userId) total += a.amount;
            }
            res.json({ total, period });
        } catch (err) {
            console.error('Employee earnings error:', err);
            res.status(500).json({ error: 'Failed to fetch earnings' });
        }
    });

    app.get('/api/portal/employee/jobs', authMiddleware, requireEmployee, async (req, res) => {
        try {
            const jobs = await cal.getUpcomingBookings();
            res.json({ jobs });
        } catch (err) {
            console.error('Employee jobs error:', err);
            res.status(500).json({ error: 'Failed to fetch jobs' });
        }
    });

    app.put('/api/portal/employee/profile', authMiddleware, requireEmployee, async (req, res) => {
        try {
            await db.updateEmployee(req.user.userId, req.body, false);
            res.json({ ok: true });
        } catch (err) {
            console.error('Update profile error:', err);
            res.status(500).json({ error: 'Failed to update profile' });
        }
    });
}

module.exports = { registerPortalRoutes, authMiddleware };
