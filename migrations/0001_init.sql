-- Store tables (spec §9.1). Only src/worker/store/ reads or writes them. Migrations are additive only.
-- source_state: one row per source row id (last-good payload + meta), and 'cron:last' holds the dispatcher's last tick.
CREATE TABLE source_state (
  source_id TEXT PRIMARY KEY,
  payload TEXT,
  source_as_of TEXT,
  fetched_at INTEGER NOT NULL,
  ok_at INTEGER,
  status TEXT NOT NULL,
  error TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  hash TEXT
);
CREATE TABLE resort_history (resort_id TEXT, hour TEXT, payload TEXT, PRIMARY KEY (resort_id, hour));
CREATE TABLE road_history (
  corridor TEXT,
  at INTEGER,
  state TEXT,
  traction INTEGER,
  post_id INTEGER,
  text TEXT,
  PRIMARY KEY (corridor, at)
);
CREATE TABLE stake_frames (cam_id TEXT, t INTEGER, bytes INTEGER, PRIMARY KEY (cam_id, t));
CREATE TABLE counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE drive_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
