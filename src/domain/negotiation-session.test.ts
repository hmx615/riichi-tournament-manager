import { describe, expect, it } from "vitest";
import { createNegotiationSession, verifyNegotiationSession } from "./negotiation-session";

const secret = "test-secret-at-least-32-characters-long";
const payload = { competitionId: "cup", participantId: "player-1", expiresAt: Date.parse("2026-10-16T00:00:00.000Z") };

describe("negotiation session cookie", () => {
  it("round trips a signed payload", async () => {
    const token = await createNegotiationSession(secret, payload);
    expect(await verifyNegotiationSession(secret, token, Date.parse("2026-09-20T00:00:00.000Z"))).toEqual(payload);
  });

  it("rejects tampering, foreign secrets and expired sessions", async () => {
    const token = await createNegotiationSession(secret, payload);
    const [body, signature] = token.split(".");
    expect(await verifyNegotiationSession(secret, `${body}x.${signature}`)).toBeNull();
    expect(await verifyNegotiationSession("another-secret-at-least-32-characters", token)).toBeNull();
    expect(await verifyNegotiationSession(secret, token, Date.parse("2026-11-01T00:00:00.000Z"))).toBeNull();
    expect(await verifyNegotiationSession(secret, "not-a-token")).toBeNull();
  });
});
