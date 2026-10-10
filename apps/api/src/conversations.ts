import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import {
  DomainError,
  type CoachConversation,
} from "../../../packages/domain/src/index.js";
import type { CoachService } from "./service.js";

const select = `SELECT c.id, c.title, c.created_at AS createdAt, c.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messageCount
  FROM coach_conversations c`;

export class ConversationStore {
  constructor(private service: CoachService) {}
  private get sqlite() {
    return this.service.database.sqlite;
  }
  list(): CoachConversation[] {
    return this.sqlite
      .prepare(`${select} ORDER BY c.updated_at DESC, c.rowid DESC`)
      .all() as CoachConversation[];
  }
  get(id = "default"): CoachConversation {
    const conversation = this.sqlite
      .prepare(`${select} WHERE c.id = ?`)
      .get(id) as CoachConversation | undefined;
    if (!conversation)
      throw new DomainError(
        "CONVERSATION_NOT_FOUND",
        "That conversation could not be found.",
        404,
      );
    return conversation;
  }
  create(operationId: string): CoachConversation {
    return this.service.mutate(
      operationId,
      { kind: "create-conversation" },
      () => {
        const id = randomUUID(),
          now = this.service.now().toISOString();
        this.sqlite
          .prepare(
            "INSERT INTO coach_conversations (id, title, created_at, updated_at) VALUES (?, 'New conversation', ?, ?)",
          )
          .run(id, now, now);
        return this.get(id);
      },
    );
  }
  messages(id = "default"): UIMessage[] {
    this.get(id);
    return (
      this.sqlite
        .prepare(
          "SELECT data FROM messages WHERE conversation_id = ? ORDER BY sequence DESC LIMIT 100",
        )
        .all(id) as { data: string }[]
    )
      .reverse()
      .map((row) => JSON.parse(row.data));
  }
  saveMessage(message: UIMessage, id = "default") {
    this.sqlite.transaction(() => {
      const conversation = this.get(id);
      const existing = this.sqlite
        .prepare("SELECT conversation_id FROM messages WHERE id = ?")
        .get(message.id) as { conversation_id: string } | undefined;
      if (existing && existing.conversation_id !== id)
        throw new DomainError(
          "CONFLICT",
          "This message belongs to another conversation.",
          409,
        );
      this.sqlite
        .prepare(
          `INSERT INTO messages (id, sequence, data, conversation_id)
        VALUES (?, (SELECT COALESCE(MAX(sequence), 0) + 1 FROM messages), ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
        )
        .run(message.id, JSON.stringify(message), id);
      const title =
        conversation.messageCount === 0 && message.role === "user"
          ? message.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 80) || "New conversation"
          : conversation.title;
      this.sqlite
        .prepare(
          "UPDATE coach_conversations SET title = ?, updated_at = ? WHERE id = ?",
        )
        .run(title, this.service.now().toISOString(), id);
    })();
  }
}
