-- Migration number: 0001 	 2026-02-15T23:54:15.402Z
CREATE TABLE IF NOT EXISTS _sanity_check (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
