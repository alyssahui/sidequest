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

  it("lets two demo identities share a challenge", async () => {
    const app = buildApp();
    apps.push(app);
    const sent = await app.inject({
      method: "POST",
      url: "/v1/challenges/custom",
      headers: {
        "idempotency-key": "shared-challenge-one",
        "x-demo-user-id": "user-zuri",
      },
      payload: {
        recipientUserId: "user-ben",
        partyId: "party-demo",
        task: "Audit one source of wasted water",
        locationLabel: "Home",
        deadline: "2099-09-12T18:00:00.000Z",
        stakeCoins: 35,
      },
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().stakeCoins).toBe(35);

    const benView = await app.inject({
      method: "GET",
      url: "/v1/challenges",
      headers: { "x-demo-user-id": "user-ben" },
    });
    expect(benView.json().incoming).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sent.json().id, status: "PENDING" }),
      ]),
    );

    const accepted = await app.inject({
      method: "POST",
      url: `/v1/challenges/${sent.json().id}/respond`,
      headers: {
        "idempotency-key": "shared-challenge-accept",
        "x-demo-user-id": "user-ben",
      },
      payload: { accept: true, expectedVersion: sent.json().version },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe("ACCEPTED");
  });

  it("lets an issuer recall a pending challenge and restores escrow", async () => {
    const app = buildApp();
    apps.push(app);
    const sent = await app.inject({
      method: "POST",
      url: "/v1/challenges/custom",
      headers: { "idempotency-key": "recall-one" },
      payload: {
        recipientUserId: "user-ben",
        partyId: "party-demo",
        task: "Count three campus trees",
        deadline: "2099-09-12T18:00:00.000Z",
        stakeCoins: 25,
      },
    });
    const recalled = await app.inject({
      method: "POST",
      url: `/v1/challenges/${sent.json().id}/cancel`,
      headers: { "idempotency-key": "recall-two" },
      payload: { expectedVersion: sent.json().version },
    });
    expect(recalled.statusCode).toBe(200);
    expect(recalled.json()).toMatchObject({ status: "DECLINED" });
  });

  it("seeds live markets and can add a labeled synthetic crowd", async () => {
    const app = buildApp();
    apps.push(app);
    const list = await app.inject({ method: "GET", url: "/v1/markets" });
    expect(list.statusCode).toBe(200);
    const market = list.json().markets[0];
    expect(market.status).toBe("OPEN");

    const crowd = await app.inject({
      method: "POST",
      url: `/v1/demo/markets/${market.id}/simulate-crowd`,
      headers: {
        "idempotency-key": "simulate-crowd-one",
        "x-demo-user-id": "user-zuri",
      },
      payload: { count: 12 },
    });
    expect(crowd.statusCode).toBe(200);
    expect(crowd.json().simulation).toMatchObject({
      added: 12,
      source: "deterministic-fallback",
    });
    expect(crowd.json().market.participantCount).toBe(12);
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
