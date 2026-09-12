import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((a) => a.close())));
describe("quest API", () => {
  it("lists seeded demo quests and suggestions with server-authenticated ownership", async () => {
    const app = buildApp();
    apps.push(app);
    const list = await app.inject({ method: "GET", url: "/v1/quests" });
    expect(list.statusCode).toBe(200);
    expect(list.json().nearby[0]).toMatchObject({
      ownerUserId: "user-zuri",
      status: "SPAWNED",
    });
    const suggestions = await app.inject({
      method: "GET",
      url: "/v1/quest-suggestions?area=CMU&nearbyMemberCount=1",
    });
    expect(suggestions.statusCode).toBe(200);
    expect(suggestions.json().suggestions.length).toBeGreaterThan(0);
  });
  it("validates transitions, version and idempotency", async () => {
    const app = buildApp();
    apps.push(app);
    const list = await app.inject({ method: "GET", url: "/v1/quests" });
    const q = list.json().nearby[0];
    const accepted = await app.inject({
      method: "POST",
      url: `/v1/quests/${q.id}/accept`,
      headers: { "idempotency-key": "api-accept" },
      payload: { expectedVersion: q.version },
    });
    expect(accepted.statusCode).toBe(200);
    const duplicate = await app.inject({
      method: "POST",
      url: `/v1/quests/${q.id}/accept`,
      headers: { "idempotency-key": "api-accept" },
      payload: { expectedVersion: q.version },
    });
    expect(duplicate.json()).toEqual(accepted.json());
    const stale = await app.inject({
      method: "POST",
      url: `/v1/quests/${q.id}/start`,
      headers: { "idempotency-key": "api-stale" },
      payload: { expectedVersion: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe("VERSION_CONFLICT");
  });
  it("rejects unsafe media references", async () => {
    const app = buildApp();
    apps.push(app);
    const spawn = await app.inject({
      method: "POST",
      url: "/v1/quests/spawn",
      headers: { "idempotency-key": "photo-spawn" },
      payload: {
        templateId: "pgh-reconnect",
        expiresAt: "2099-12-31T00:00:00.000Z",
      },
    });
    const q = spawn.json();
    await app.inject({
      method: "POST",
      url: `/v1/quests/${q.id}/accept`,
      headers: { "idempotency-key": "photo-accept" },
      payload: { expectedVersion: 1 },
    });
    const evidence = await app.inject({
      method: "POST",
      url: `/v1/quests/${q.id}/evidence`,
      headers: { "idempotency-key": "bad-photo" },
      payload: {
        expectedVersion: 2,
        evidence: { photo: { mediaRef: "https://example.com/private.jpg" } },
      },
    });
    expect(evidence.statusCode).toBe(400);
    expect(evidence.json().code).toBe("PHOTO_REFERENCE_UNSAFE");
  });
});
