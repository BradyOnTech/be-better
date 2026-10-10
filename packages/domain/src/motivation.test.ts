import { describe, expect, it } from "vitest";
import {
  motivationCardInputSchema,
  motivationDeck,
  plainCardText,
} from "./motivation.js";

describe("motivation deck", () => {
  it("has unique IDs and fits the same limits as the athlete's own cards", () => {
    expect(new Set(motivationDeck.map((card) => card.id)).size).toBe(
      motivationDeck.length,
    );
    for (const card of motivationDeck) {
      expect(motivationCardInputSchema.parse(card)).toBeTruthy();
      expect(card.front.split("*").length % 2, card.id).toBe(1);
    }
  });
  it("strips highlight markers for sharing", () => {
    expect(plainCardText("Bad runs *count*.")).toBe("Bad runs count.");
    expect(plainCardText("A lone * stays")).toBe("A lone * stays");
  });
});
