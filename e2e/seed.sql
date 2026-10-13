-- Local/e2e seed (pnpm db:local): one source_state row per row id the slot table writes, fetched "now",
-- a fresh cron:last (so /api/health?strict=1 is green), a crew of 4 and one cached drive. Re-runnable.
-- Payloads are minimal: '{}' / '[]' placeholders (every adapter that reads its last-good row tolerates them),
-- realistic RoadStatus rows for the four corridors.
INSERT OR REPLACE INTO source_state (source_id, payload, fetched_at, ok_at, status, fail_count) VALUES
  ('resort:alta', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('resort:snowbird', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('resort:brighton', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('resort:solitude', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('resort:deer-valley', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('resort:snowbasin', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('alta:weather', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:alta:base', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:alta:summit', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:snowbird:base', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:snowbird:summit', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:brighton:base', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:brighton:summit', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:solitude:base', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:solitude:summit', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:deer-valley:base', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:deer-valley:summit', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:snowbasin:base', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:snowbasin:summit', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:afd', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:alerts', '[]', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('obs', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('avy:uac', '[]', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('snotel', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('yt:state', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('cams:status', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('hdrelay:config', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('udot:cams', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('nws:points', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('stake:alta', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('stake:skiutah', '{}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('roads:lcc', '{"corridor":"lcc","state":"traction","tractionLaw":true,"eto":null,"closesAt":null,"reason":"weather","headline":"Traction law in effect","latestPost":null,"guardsman":null,"advisories":[],"segments":[],"signs":[],"pass":null,"parkingFull":[],"crossChecks":[]}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('roads:bcc', '{"corridor":"bcc","state":"open","tractionLaw":false,"eto":null,"closesAt":null,"reason":null,"headline":"Open","latestPost":null,"guardsman":null,"advisories":[],"segments":[],"signs":[],"pass":null,"parkingFull":[],"crossChecks":[]}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('roads:parleys', '{"corridor":"parleys","state":"open","tractionLaw":false,"eto":null,"closesAt":null,"reason":null,"headline":"Open","latestPost":null,"guardsman":null,"advisories":[],"segments":[],"signs":[],"pass":null,"parkingFull":[],"crossChecks":[]}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0),
  ('roads:snowbasin', '{"corridor":"snowbasin","state":"open","tractionLaw":false,"eto":null,"closesAt":null,"reason":null,"headline":"Open","latestPost":null,"guardsman":null,"advisories":[],"segments":[],"signs":[],"pass":null,"parkingFull":[],"crossChecks":[]}', unixepoch() * 1000, unixepoch() * 1000, 'ok', 0);

INSERT OR REPLACE INTO source_state (source_id, payload, fetched_at, ok_at, status, fail_count)
VALUES ('cron:last', json_object('slot', 0, 'startedAt', unixepoch() * 1000, 'jobs', json('[]'), 'deferred', json('[]'),
  'suspects', json('[]')), unixepoch() * 1000, unixepoch() * 1000, 'ok', 0);

INSERT OR REPLACE INTO people (id, name, mode, color, created_at, updated_at, deleted_at) VALUES
  ('otakar0001', 'Otakar', 'ski', '#3b82f6', unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('sam0000002', 'Sam', 'board', '#ef4444', unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('jess000003', 'Jess', 'ski', '#10b981', unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('alex000004', 'Alex', 'ski', '#f59e0b', unixepoch() * 1000, unixepoch() * 1000, NULL);

INSERT OR REPLACE INTO drive_cache (key, payload, created_at) VALUES ('40.761,-111.891', json_object(
  'origin', json_object('lat', 40.761, 'lon', -111.891),
  'results', json('{"alta":{"min":48,"mi":31.2},"snowbird":{"min":45,"mi":29.9},"brighton":{"min":46,"mi":31.0,"via":"bcc-mouth"},"solitude":{"min":43,"mi":28.6,"via":"bcc-mouth"},"deer-valley":{"min":41,"mi":34.5},"snowbasin":{"min":52,"mi":47.8}}'),
  'computedAt', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), unixepoch() * 1000);
