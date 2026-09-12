import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MarketDto, MarketOutcome } from "@sidequest/contracts/market";
import { HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import { DEMO_USERS, useDemoSession } from "../demo/DemoSession";
import { ScreenFrame } from "../shell/ScreenFrame";
import { PredictionMarketCard } from "./PredictionMarketCard";

type CrowdResult = {
  added: number;
  completePercent: number;
  rationale: string;
  source: "grok" | "deterministic-fallback";
  model: string;
};

const nameFor = (id: string) =>
  DEMO_USERS.find((user) => user.id === id)?.name ?? "A party member";

export function BetScreen() {
  const { request, user } = useDemoSession();
  const [markets, setMarkets] = useState<MarketDto[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [balance, setBalance] = useState(0);
  const [message, setMessage] = useState(
    "Connecting to the shared party pool…",
  );
  const [crowd, setCrowd] = useState<CrowdResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [marketResult, economy] = await Promise.all([
        request<{ markets: MarketDto[] }>("/v1/markets"),
        request<{ balance: number }>("/v1/economy/me"),
      ]);
      setMarkets(marketResult.markets);
      setBalance(economy.balance);
      setSelectedId((current) => current ?? marketResult.markets[0]?.id);
      setMessage("Live · refreshes every 3 seconds");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "API unavailable");
    }
  }, [request]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const selected = useMemo(
    () => markets.find((market) => market.id === selectedId) ?? markets[0],
    [markets, selectedId],
  );

  async function place(outcome: MarketOutcome, amount: number) {
    if (!selected) return;
    const result = await request<{ market: MarketDto }>(
      `/v1/markets/${selected.id}/bets`,
      {
        method: "POST",
        headers: { "idempotency-key": `web-bet-${user.id}-${Date.now()}` },
        body: JSON.stringify({ outcome, amount }),
      },
    );
    setMarkets((current) =>
      current.map((market) =>
        market.id === result.market.id ? result.market : market,
      ),
    );
    setBalance((current) => current - amount);
  }

  async function simulateCrowd() {
    if (!selected || simulating) return;
    setSimulating(true);
    setCrowd(null);
    try {
      const result = await request<{
        market: MarketDto;
        simulation: CrowdResult;
      }>(`/v1/demo/markets/${selected.id}/simulate-crowd`, {
        method: "POST",
        headers: { "idempotency-key": `crowd-${Date.now()}` },
        body: JSON.stringify({ count: 20 }),
      });
      setMarkets((current) =>
        current.map((market) =>
          market.id === result.market.id ? result.market : market,
        ),
      );
      setCrowd(result.simulation);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Crowd simulation failed",
      );
    } finally {
      setSimulating(false);
    }
  }

  return (
    <ScreenFrame eyebrow="GROK-SIMULATED SENTIMENT · PLAY MONEY" title="BET">
      <Text style={styles.disclaimer}>
        Predict whether a friend completes a measurable impact quest. Credit is
        virtual, cannot be purchased, and has no monetary value. Pools are
        pari-mutuel COMPLETE / FAIL—not odds or an order book.
      </Text>
      <View style={styles.balanceRow}>
        <View>
          <Text style={styles.balanceLabel}>YOUR CREDIT</Text>
          <Text style={styles.sync}>{message}</Text>
        </View>
        <Text style={styles.balanceValue}>◉ {balance}</Text>
      </View>

      {markets.map((market) => (
        <MarketRow
          key={market.id}
          market={market}
          selected={market.id === selected?.id}
          onSelect={() => {
            setSelectedId(market.id);
            setCrowd(null);
          }}
        />
      ))}

      {selected ? (
        <>
          <HudCard style={styles.grokCard}>
            <StatusPill label="GROK CROWD LAB" />
            <Text style={styles.grokTitle}>Stress-test this market</Text>
            <Text style={styles.meta}>
              Grok estimates a diverse synthetic crowd’s sentiment, then 20
              labeled bot accounts place small play-money predictions.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={simulating || selected.status !== "OPEN"}
              onPress={() => void simulateCrowd()}
              style={[styles.action, simulating && styles.disabled]}
            >
              <Text style={styles.actionText}>
                {simulating ? "GROK IS FORECASTING…" : "SIMULATE 20 PREDICTORS"}
              </Text>
            </Pressable>
            {crowd ? (
              <Text accessibilityRole="alert" style={styles.result}>
                {crowd.source === "grok" ? "GROK LIVE" : "SAFE FALLBACK"} ·{" "}
                {crowd.completePercent}% COMPLETE · {crowd.added} new
                predictors. {crowd.rationale}
              </Text>
            ) : null}
          </HudCard>
          <PredictionMarketCard
            key={`${selected.id}-${user.id}`}
            balance={balance}
            closesLabel="Closes with the quest deadline"
            market={selected}
            onPlaced={(outcome, amount) => place(outcome, amount)}
            participantName={nameFor(selected.participantUserId)}
            viewerId={user.id}
          />
        </>
      ) : (
        <HudCard>
          <Text style={styles.empty}>No live markets yet.</Text>
        </HudCard>
      )}
    </ScreenFrame>
  );
}

function MarketRow({
  market,
  selected,
  onSelect,
}: {
  market: MarketDto;
  selected: boolean;
  onSelect: () => void;
}) {
  const total = market.pools.COMPLETE + market.pools.FAIL;
  const completeShare =
    total === 0 ? 50 : Math.round((market.pools.COMPLETE / total) * 100);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
    >
      <HudCard style={selected ? styles.selectedRow : undefined}>
        <View style={styles.row}>
          <StatusPill label={market.status} />
          <Text style={styles.meta}>{market.participantCount} predictors</Text>
        </View>
        <Text style={styles.prompt}>{market.prompt}</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${completeShare}%` }]} />
        </View>
        <View style={styles.row}>
          <Text style={styles.poolStat}>
            COMPLETE ◉ {market.pools.COMPLETE}
          </Text>
          <Text style={styles.poolStat}>FAIL ◉ {market.pools.FAIL}</Text>
        </View>
      </HudCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disclaimer: { color: colors.surface, fontSize: 13, lineHeight: 19 },
  balanceRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  balanceLabel: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  balanceValue: { color: colors.brand, fontSize: 20, fontWeight: "900" },
  sync: { color: colors.surface, fontSize: 10, marginTop: 3 },
  selectedRow: { borderColor: colors.brand, borderWidth: 2 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "space-between",
  },
  prompt: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  barTrack: {
    backgroundColor: colors.outline,
    borderRadius: radii.pill,
    height: 10,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  barFill: { backgroundColor: colors.brandDeep, height: 10 },
  poolStat: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  empty: { color: colors.ink, fontWeight: "700" },
  grokCard: { borderColor: colors.warning, borderWidth: 2 },
  grokTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  action: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radii.sm,
    marginTop: spacing.md,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  actionText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  disabled: { opacity: 0.5 },
  result: {
    color: colors.brandDeep,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: spacing.md,
  },
});
