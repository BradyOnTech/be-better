CREATE TABLE coach_conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO coach_conversations (id, title, created_at, updated_at)
VALUES ('default', CASE WHEN EXISTS (SELECT 1 FROM messages) THEN 'Earlier conversation' ELSE 'New conversation' END, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
ALTER TABLE messages RENAME TO messages_before_conversations;
CREATE TABLE messages (id TEXT PRIMARY KEY, sequence INTEGER NOT NULL UNIQUE, data TEXT NOT NULL, conversation_id TEXT NOT NULL DEFAULT 'default' REFERENCES coach_conversations(id));
INSERT INTO messages (id, sequence, data, conversation_id) SELECT id, sequence, data, 'default' FROM messages_before_conversations;
DROP TABLE messages_before_conversations;
ALTER TABLE turns RENAME TO turns_before_conversations;
CREATE TABLE turns (id TEXT PRIMARY KEY, text TEXT NOT NULL, status TEXT NOT NULL, response_id TEXT, updated_at TEXT NOT NULL, conversation_id TEXT NOT NULL DEFAULT 'default' REFERENCES coach_conversations(id));
INSERT INTO turns (id, text, status, response_id, updated_at, conversation_id) SELECT id, text, status, response_id, updated_at, 'default' FROM turns_before_conversations;
DROP TABLE turns_before_conversations;
CREATE INDEX messages_conversation_sequence ON messages(conversation_id, sequence);
