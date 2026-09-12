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
});
