import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("foundation API", () => {
  it("starts in credential-free demo mode", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      mode: "demo",
      service: "sidequest-api",
    });
  });

  it("injects the deterministic demo principal", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ userId: "user-zuri", coins: 420 });
  });

  it("opens a market and places an authenticated demo prediction idempotently", async () => {
    const app = buildApp();
    apps.push(app);

    const create = await app.inject({
      method: "POST",
      url: "/v1/markets",
      headers: { "idempotency-key": "create-api-market" },
      payload: {
        questInstanceId: "quest-api",
        participantUserId: "user-ben",
        partyId: "party-demo",
        prompt: "Will Ben finish the quest?",
        opensAt: "2026-09-11T18:00:00.000Z",
        closesAt: "2099-09-11T19:00:00.000Z",
        questDeadline: "2099-09-11T20:00:00.000Z",
      },
    });
    expect(create.statusCode).toBe(201);
    const marketId = create.json().market.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/markets/${marketId}/open`,
      headers: { "idempotency-key": "open-api-market" },
    });
    const first = await app.inject({
      method: "POST",
      url: `/v1/markets/${marketId}/bets`,
      headers: {
        "idempotency-key": "bet-api-market",
        "x-demo-user-id": "user-alyssa",
      },
      payload: { outcome: "COMPLETE", amount: 25 },
    });
    const retry = await app.inject({
      method: "POST",
      url: `/v1/markets/${marketId}/bets`,
      headers: {
        "idempotency-key": "bet-api-market",
        "x-demo-user-id": "user-alyssa",
      },
      payload: { outcome: "COMPLETE", amount: 25 },
    });

    expect(first.statusCode).toBe(201);
    expect(retry.json().bet.id).toBe(first.json().bet.id);
    expect(retry.json().market.bets).toHaveLength(1);

    const forbidden = await app.inject({
      method: "POST",
      url: `/v1/markets/${marketId}/bets`,
      headers: {
        "idempotency-key": "outsider-bet",
        "x-demo-user-id": "user-outsider",
      },
      payload: { outcome: "FAIL", amount: 10 },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe("FORBIDDEN");
  });

  it("enforces Party access and supports escrowed self-bounties", async () => {
    const app = buildApp();
    apps.push(app);
    const bounty = await app.inject({
      method: "POST",
      url: "/v1/self-bounties",
      headers: {
        "idempotency-key": "bounty-api-one",
        "x-demo-user-id": "user-alyssa",
      },
      payload: { questInstanceId: "quest-api", amount: 25 },
    });
    const retry = await app.inject({
      method: "POST",
      url: "/v1/self-bounties",
      headers: {
        "idempotency-key": "bounty-api-one",
        "x-demo-user-id": "user-alyssa",
      },
      payload: { questInstanceId: "quest-api", amount: 25 },
    });
    expect(bounty.statusCode).toBe(201);
    expect(retry.json().bounty.id).toBe(bounty.json().bounty.id);

    const balance = await app.inject({
      method: "GET",
      url: "/v1/economy/me",
      headers: { "x-demo-user-id": "user-alyssa" },
    });
    expect(balance.json().balance).toBe(340);
  });
});
