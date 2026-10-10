import type { UIMessage } from "ai";
import type {
  AppState,
  CoachConversation,
} from "../../../packages/domain/src/index.js";
import {
  athleteSchema,
  emptyMotivation,
} from "../../../packages/domain/src/index.js";

export function readToken() {
  return localStorage.getItem("be-better-token") || "";
}
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await authenticatedFetch(
    `/api${path}`,
    body === undefined
      ? { signal: AbortSignal.timeout(10000), cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Your server is unavailable." }));
    throw new ApiError(error.error || "Please try again.", response.status);
  }
  return response.json();
}
export function operationId() {
  return crypto.randomUUID();
}
export interface Snapshot {
  state: AppState;
  messages: UIMessage[];
  conversationId: string;
  conversations: CoachConversation[];
  savedAt: string;
}
export function readSnapshot(): Snapshot | null {
  try {
    const snapshot = JSON.parse(
      localStorage.getItem("be-better-snapshot") || "null",
    );
    if (!snapshot?.state) return null;
    snapshot.conversationId ??= "default";
    snapshot.conversations ??= [];
    snapshot.state = {
      program: null,
      programProgress: null,
      planReviews: [],
      drafts: [],
      races: [],
      blocks: [],
      block: null,
      questions: [],
      motivation: emptyMotivation,
      sync: {
        provider: "intervals",
        configured: false,
        lastSync: null,
        error: null,
      },
      ...snapshot.state,
      athlete: athleteSchema.parse(snapshot.state.athlete),
    };
    return snapshot;
  } catch {
    return null;
  }
}
export function saveSnapshot(
  state: AppState,
  messages: UIMessage[],
  conversationId = "default",
  conversations: CoachConversation[] = [],
) {
  try {
    localStorage.setItem(
      "be-better-snapshot",
      JSON.stringify({
        state,
        messages,
        conversationId,
        conversations,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    /* Server data remains authoritative if browser storage is full. */
  }
}
