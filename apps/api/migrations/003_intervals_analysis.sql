CREATE TABLE intervals_observations (
  connection_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  date TEXT NOT NULL,
  data TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, kind, record_id)
);
CREATE INDEX intervals_observations_date ON intervals_observations(connection_id, kind, date);
CREATE TABLE intervals_refresh_state (
  connection_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (connection_id, kind)
);
