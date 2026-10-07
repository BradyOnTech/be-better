CREATE TABLE races (id TEXT PRIMARY KEY, date TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX race_date ON races(date);
CREATE TABLE plan_blocks (id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE questions (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, priority INTEGER NOT NULL, answered INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
CREATE TABLE assets (id TEXT PRIMARY KEY, hash TEXT NOT NULL, path TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX asset_hash ON assets(hash);
CREATE TABLE external_activities (provider TEXT NOT NULL, external_id TEXT NOT NULL, activity_id TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(provider, external_id));
CREATE TABLE sync_state (provider TEXT PRIMARY KEY, data TEXT NOT NULL);
