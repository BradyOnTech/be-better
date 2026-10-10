import { randomUUID } from "node:crypto";
import {
  activitySchema,
  addDays,
  weekStart,
  DomainError,
  motivationCardInputSchema,
  motivationKeepSchema,
  motivationDeck,
  type Activity,
  type MotivationCard,
  type MotivationRecords,
  type MotivationState,
} from "../../../packages/domain/src/index.js";
import type { CoachService } from "./service.js";

export class MotivationStore {
  constructor(private service: CoachService) {}
  private get sqlite() {
    return this.service.database.sqlite;
  }
  state(): MotivationState {
    return { cards: this.cards(), kept: this.kept(), records: this.records() };
  }
  cards(): MotivationCard[] {
    return (
      this.sqlite
        .prepare(
          "SELECT data FROM motivation_cards ORDER BY created_at DESC, rowid DESC",
        )
        .all() as { data: string }[]
    ).map((row) => JSON.parse(row.data));
  }
  /** Kept card IDs, most recently kept first. */
  kept(): string[] {
    return (
      this.sqlite
        .prepare(
          "SELECT card_id FROM motivation_keeps ORDER BY kept_at DESC, rowid DESC",
        )
        .all() as { card_id: string }[]
    ).map((row) => row.card_id);
  }
  saveCard(raw: unknown, id: string | null, operationId: string) {
    const input = motivationCardInputSchema.parse(raw);
    return this.service.mutate(operationId, { input, id }, () => {
      const before = id
        ? this.cards().find((card) => card.id === id)
        : undefined;
      if (id && !before)
        throw new DomainError("NOT_FOUND", "That card was not found.", 404);
      const now = this.service.now().toISOString();
      const card: MotivationCard = {
        ...input,
        id: before?.id ?? randomUUID(),
        createdAt: before?.createdAt ?? now,
        updatedAt: now,
      };
      this.sqlite
        .prepare(
          "INSERT INTO motivation_cards (id,created_at,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        )
        .run(card.id, card.createdAt, JSON.stringify(card));
      return card;
    });
  }
  deleteCard(id: string, operationId: string) {
    return this.service.mutate(operationId, { id }, () => {
      if (!this.cards().some((card) => card.id === id))
        throw new DomainError("NOT_FOUND", "That card was not found.", 404);
      this.sqlite.prepare("DELETE FROM motivation_cards WHERE id=?").run(id);
      this.sqlite
        .prepare("DELETE FROM motivation_keeps WHERE card_id=?")
        .run(id);
      return { ok: true };
    });
  }
  keep(raw: unknown, operationId: string) {
    const { cardId, kept } = motivationKeepSchema.parse(raw);
    return this.service.mutate(operationId, { cardId, kept }, () => {
      if (!kept)
        this.sqlite
          .prepare("DELETE FROM motivation_keeps WHERE card_id=?")
          .run(cardId);
      else if (
        motivationDeck.some((card) => card.id === cardId) ||
        this.cards().some((card) => card.id === cardId)
      )
        this.sqlite
          .prepare(
            "INSERT INTO motivation_keeps (card_id,kept_at) VALUES (?,?) ON CONFLICT(card_id) DO NOTHING",
          )
          .run(cardId, this.service.now().toISOString());
      else throw new DomainError("NOT_FOUND", "That card was not found.", 404);
      return { kept: this.kept() };
    });
  }
  records(): MotivationRecords {
    const today = this.service.today();
    const totals = this.sqlite
      .prepare(
        "SELECT COUNT(*) AS sessions, COALESCE(SUM(json_extract(data,'$.durationSeconds')),0) AS seconds, COALESCE(SUM(json_extract(data,'$.distanceMetres')),0) AS distance, COALESCE(SUM(json_extract(data,'$.elevationGainMetres')),0) AS climb FROM activities WHERE confirmed=1",
      )
      .get() as {
      sessions: number;
      seconds: number;
      distance: number;
      climb: number;
    };
    const best = (where: string, order: string): Activity | null => {
      const row = this.sqlite
        .prepare(
          `SELECT data FROM activities WHERE confirmed=1 ${where} ORDER BY ${order}, date DESC LIMIT 1`,
        )
        .get() as { data: string } | undefined;
      return row ? activitySchema.parse(JSON.parse(row.data)) : null;
    };
    // A streak counts consecutive weeks with any session. The current week
    // keeps it alive until it ends.
    const weeks = new Set(
      (
        this.sqlite
          .prepare(
            "SELECT DISTINCT date FROM activities WHERE confirmed=1 AND date >= ? AND date <= ?",
          )
          .all(addDays(today, -7 * 260), today) as { date: string }[]
      ).map((row) => weekStart(row.date)),
    );
    const current = weekStart(today);
    let cursor = weeks.has(current) ? current : addDays(current, -7);
    let count = 0;
    let since: string | null = null;
    while (weeks.has(cursor)) {
      count++;
      since = cursor;
      cursor = addDays(cursor, -7);
    }
    return {
      sessions: totals.sessions,
      seconds: totals.seconds,
      distanceMetres: totals.distance,
      climbMetres: totals.climb,
      longest: best("", "json_extract(data,'$.durationSeconds') DESC"),
      biggestClimb: best(
        "AND json_extract(data,'$.elevationGainMetres') > 0",
        "json_extract(data,'$.elevationGainMetres') DESC",
      ),
      hardest: best(
        "AND json_extract(data,'$.rpe') >= 8",
        "json_extract(data,'$.rpe') DESC",
      ),
      streak: { weeks: count, since, thisWeek: weeks.has(current) },
    };
  }
}
