CREATE TABLE motivation_cards (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE motivation_keeps (card_id TEXT PRIMARY KEY, kept_at TEXT NOT NULL);
