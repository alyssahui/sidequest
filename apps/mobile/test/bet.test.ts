import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bet = readFileSync(
  new URL("../src/features/markets/BetScreen.tsx", import.meta.url),
  "utf8",
);
const card = readFileSync(
  new URL("../src/features/markets/PredictionMarketCard.tsx", import.meta.url),
  "utf8",
);
const demo = readFileSync(
  new URL("../src/features/markets/demoMarkets.ts", import.meta.url),
  "utf8",
);
const tabs = readFileSync(
  new URL("../app/(tabs)/_layout.tsx", import.meta.url),
  "utf8",
);

describe("bet tab prediction surface", () => {
  it("is wired as the former feed tab", () => {
    expect(tabs).toContain('name="bet"');
    expect(tabs).not.toContain('name="feed"');
  });

  it("uses complete/fail pools instead of odds or an order book", () => {
    expect(bet).toContain("COMPLETE");
    expect(bet).toContain("FAIL");
    expect(bet).toContain("YOUR CREDIT");
    expect(bet).toContain("balanceValue");
    expect(bet).toContain("pari-mutuel");
    expect(bet).toContain("odds or an order book");
    expect(bet).not.toContain("selectedRow");
    expect(card).not.toContain("style={styles.card}");
    expect(card).toContain("Estimated total if correct");
    expect(card).toContain("no monetary value");
    expect(card).toContain("YOUR POSITION");
    expect(bet).toContain("YOUR POSITION");
    expect(bet).toContain("viewerPosition");
    expect(bet).toContain("current === market.id ? null : market.id");
  });

  it("blocks self-prediction and keeps self-bounty separate", () => {
    expect(card).toContain("YOU CANNOT PREDICT YOURSELF");
    expect(card).toContain("This is not a prediction on yourself");
    expect(demo).toContain('participantUserId: "zuri"');
  });
});
