-- Ski-day tracker (spec §9.1). Trip dates = TRIP in config/ikon.ts (test-enforced: each appears twice).
CREATE TABLE people (
  id TEXT PRIMARY KEY,                       -- 10-char nanoid (crypto.getRandomValues)
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  mode TEXT NOT NULL DEFAULT 'unknown' CHECK (mode IN ('ski','board','unknown')),
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE ski_days (
  person_id TEXT NOT NULL REFERENCES people(id),
  date TEXT NOT NULL CHECK (date BETWEEN '2026-12-27' AND '2027-01-31'),
  resort_id TEXT NOT NULL CHECK (resort_id IN ('alta','snowbird','alta-snowbird','brighton','solitude','deer-valley','snowbasin')),
  status TEXT NOT NULL DEFAULT 'skied' CHECK (status IN ('planned','skied')),
  updated_at INTEGER NOT NULL,               -- ms; optimistic-concurrency token
  updated_by TEXT,                           -- client_id; never returned by GET
  PRIMARY KEY (person_id, date)
);
CREATE TABLE bookings (
  date TEXT NOT NULL CHECK (date BETWEEN '2026-12-27' AND '2027-01-31'),
  kind TEXT NOT NULL CHECK (kind IN ('dv-lift','alta-parking','brighton-parking','solitude-parking','snowbird-parking')),
  person_id TEXT NOT NULL DEFAULT '*',       -- '*' = car-level (parking); personId for dv-lift
  note TEXT CHECK (note IS NULL OR length(note) <= 80),
  updated_at INTEGER NOT NULL, updated_by TEXT,
  PRIMARY KEY (date, kind, person_id)
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL,
  client_id TEXT, ip_hash TEXT,              -- forensics only; never returned by GET
  action TEXT NOT NULL, entity TEXT NOT NULL, key TEXT NOT NULL,
  before_json TEXT, after_json TEXT, undone_by INTEGER
);
CREATE INDEX audit_at ON audit_log(at DESC);
