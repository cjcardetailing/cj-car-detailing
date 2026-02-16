-- Migration number: 0007  2026-02-16
-- Manager profiles (full_name, dob) and seed data for Griffin Crick & Jett Hilton

CREATE TABLE IF NOT EXISTS manager_profiles (
  user_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  dob TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Griffin Crick: cj100001
UPDATE users SET email = 'griffin.m.crick@gmail.com', phone = '+61492994164' WHERE username = 'cj100001';
INSERT OR REPLACE INTO manager_profiles (user_id, full_name, dob)
  SELECT id, 'Griffin Crick', '2008-12-29' FROM users WHERE username = 'cj100001';

-- Jett Hilton: cj100002
UPDATE users SET email = 'jetthilton88@gmail.com', phone = '+61437984814' WHERE username = 'cj100002';
INSERT OR REPLACE INTO manager_profiles (user_id, full_name, dob)
  SELECT id, 'Jett Hilton', '2007-11-18' FROM users WHERE username = 'cj100002';
