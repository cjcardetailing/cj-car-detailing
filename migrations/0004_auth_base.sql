-- Migration number: 0004 	 2026-02-16T01:52:06.018Z
-- =========================
-- USERS / AUTH BASE
-- =========================

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  username TEXT NOT NULL UNIQUE,        -- cj000001, cj100001 etc
  email TEXT NOT NULL UNIQUE,
  phone TEXT,

  role TEXT NOT NULL CHECK (role IN ('MANAGER','EMPLOYEE')),

  -- Password storage (we'll use PBKDF2 SHA-256 string format)
  password_hash TEXT NOT NULL,

  -- For account lifecycle
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- =========================
-- EMPLOYEE PROFILE DATA
-- =========================

CREATE TABLE IF NOT EXISTS employee_profiles (
  user_id INTEGER PRIMARY KEY, -- 1:1 with users

  full_name TEXT,
  dob TEXT,                    -- store as ISO date string YYYY-MM-DD
  age_years INTEGER,
  age_months INTEGER,

  -- Bank details: store encrypted blob/text (we'll encrypt in code using ENCRYPTION_KEY)
  bank_bsb_enc TEXT,
  bank_account_enc TEXT,

  -- Whether employee can still edit their own details (you said: once set, manager-only changes)
  bank_locked INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================
-- SESSIONS (REMEMBER ME)
-- =========================

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,

  -- store hash of session token (never store raw token)
  session_token_hash TEXT NOT NULL UNIQUE,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,

  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- =========================
-- PASSWORD RESET TOKENS
-- =========================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

-- =========================
-- MANAGER OTP (2FA) + TRUSTED DEVICES
-- =========================

CREATE TABLE IF NOT EXISTS manager_otp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manager_otp_user ON manager_otp(user_id);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  device_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
