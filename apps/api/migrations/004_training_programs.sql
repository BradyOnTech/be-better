CREATE TABLE training_programs (id TEXT PRIMARY KEY, status TEXT NOT NULL, data TEXT NOT NULL);
CREATE UNIQUE INDEX one_active_program ON training_programs(status) WHERE status='active';
