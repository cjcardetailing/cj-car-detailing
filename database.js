const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'bookings.db');

// Initialize database and create tables
function initDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }
            console.log('Connected to SQLite database');
        });

        db.serialize(() => {
            // Create table with unique constraint
            db.run(`
                CREATE TABLE IF NOT EXISTS bookings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customerName TEXT NOT NULL,
                    contactMethod TEXT NOT NULL,
                    email TEXT,
                    phone TEXT,
                    serviceDate TEXT NOT NULL,
                    serviceTime TEXT NOT NULL,
                    serviceType TEXT NOT NULL,
                    vehicleType TEXT NOT NULL,
                    address TEXT NOT NULL,
                    addressLine2 TEXT,
                    city TEXT NOT NULL,
                    state TEXT NOT NULL,
                    postcode TEXT NOT NULL,
                    specialInstructions TEXT,
                    newsletter INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'pending',
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(serviceDate, serviceTime)
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating table:', err);
                    reject(err);
                } else {
                    // Check if unique constraint exists, if not add it
                    db.all(`
                        SELECT name FROM sqlite_master 
                        WHERE type='index' AND name='idx_booking_slot_unique'
                    `, (indexCheckErr, rows) => {
                        if (indexCheckErr) {
                            console.warn('Could not check for existing index:', indexCheckErr.message);
                        }
                        
                        // Create unique index to enforce constraint (helps with existing databases)
                        db.run(`
                            CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_slot_unique 
                            ON bookings(serviceDate, serviceTime)
                        `, (indexErr) => {
                            if (indexErr) {
                                // If unique index fails (e.g., duplicate data exists), log warning
                                console.warn('Note: Could not create unique index. If duplicate bookings exist, please clean them up:', indexErr.message);
                            } else {
                                console.log('Unique constraint on booking slots enforced');
                            }
                            console.log('Database tables initialized');
                            resolve();
                        });
                    });
                }
            });
        });

        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            }
        });
    });
}

// Check if a time slot is available
function checkSlotAvailability(serviceDate, serviceTime) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);

        db.get(
            `SELECT id FROM bookings WHERE serviceDate = ? AND serviceTime = ? AND status != 'cancelled'`,
            [serviceDate, serviceTime],
            (err, row) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    // Slot is available if no booking exists
                    resolve(!row);
                }
            }
        );
    });
}

// Create a new booking with transaction to prevent race conditions
function createBooking(bookingData) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);

        const {
            customerName,
            contactMethod,
            email,
            phone,
            serviceDate,
            serviceTime,
            serviceType,
            vehicleType,
            address,
            addressLine2,
            city,
            state,
            postcode,
            specialInstructions,
            newsletter
        } = bookingData;

        // Use a transaction to ensure atomicity and prevent race conditions
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // First, check if slot is available (within transaction)
            db.get(
                `SELECT id FROM bookings WHERE serviceDate = ? AND serviceTime = ? AND status != 'cancelled'`,
                [serviceDate, serviceTime],
                (err, row) => {
                    if (err) {
                        db.run('ROLLBACK');
                        db.close();
                        reject(err);
                        return;
                    }

                    if (row) {
                        // Slot is already taken
                        db.run('ROLLBACK');
                        db.close();
                        const conflictError = new Error('This time slot is already booked');
                        conflictError.code = 'SLOT_TAKEN';
                        reject(conflictError);
                        return;
                    }

                    // Slot is available, insert the booking
                    db.run(
                        `INSERT INTO bookings (
                            customerName, contactMethod, email, phone, serviceDate, serviceTime,
                            serviceType, vehicleType, address, addressLine2, city, state, postcode,
                            specialInstructions, newsletter, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            customerName,
                            contactMethod,
                            email || null,
                            phone || null,
                            serviceDate,
                            serviceTime,
                            serviceType,
                            vehicleType,
                            address,
                            addressLine2 || null,
                            city,
                            state,
                            postcode,
                            specialInstructions || null,
                            newsletter ? 1 : 0,
                            'pending'
                        ],
                        function(insertErr) {
                            if (insertErr) {
                                db.run('ROLLBACK');
                                db.close();
                                // Check if it's a unique constraint violation (shouldn't happen due to check above, but safety net)
                                if (insertErr.message && insertErr.message.includes('UNIQUE constraint failed')) {
                                    const conflictError = new Error('This time slot is already booked');
                                    conflictError.code = 'SLOT_TAKEN';
                                    reject(conflictError);
                                } else {
                                    reject(insertErr);
                                }
                            } else {
                                // Commit transaction
                                db.run('COMMIT', (commitErr) => {
                                    if (commitErr) {
                                        db.close();
                                        reject(commitErr);
                                        return;
                                    }

                                    // Fetch the created booking
                                    db.get(
                                        `SELECT * FROM bookings WHERE id = ?`,
                                        [this.lastID],
                                        (fetchErr, row) => {
                                            db.close();
                                            if (fetchErr) {
                                                reject(fetchErr);
                                            } else {
                                                resolve(row);
                                            }
                                        }
                                    );
                                });
                            }
                        }
                    );
                }
            );
        });
    });
}

// Get all bookings
function getBookings() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);

        db.all(
            `SELECT * FROM bookings ORDER BY createdAt DESC`,
            [],
            (err, rows) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Get booking by ID
function getBookingById(id) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);

        db.get(
            `SELECT * FROM bookings WHERE id = ?`,
            [id],
            (err, row) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            }
        );
    });
}

module.exports = {
    initDatabase,
    checkSlotAvailability,
    createBooking,
    getBookings,
    getBookingById
};

