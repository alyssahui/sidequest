import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MarketOutcome } from "@sidequest/contracts/market";
import { poolTotals } from "@sidequest/market-core";
import { HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import { ScreenFrame } from "../shell/ScreenFrame";
import {
  DEMO_BALANCE,
  DEMO_VIEWER_ID,
  demoMarkets,
  type DemoMarket,
} from "./demoMarkets";
import { PredictionMarketCard, SelfBountyCard } from "./PredictionMarketCard";

export function BetScreen() {
  const [markets, setMarkets] = useState(demoMarkets);
  const [selectedId, setSelectedId] = useState(demoMarkets[0]?.id);
  const [balance, setBalance] = useState(DEMO_BALANCE);
  const selected = useMemo(
    () => markets.find((market) => market.id === selectedId) ?? markets[0],
    [markets, selectedId],
  );

  function place(outcome: MarketOutcome, amount: number) {
    if (!selected || selected.status !== "OPEN") return;
    if (selected.participantUserId === DEMO_VIEWER_ID) return;
    if (amount > balance) return;
    setBalance((current) => current - amount);
    setMarkets((current) =>
      current.map((market) => {
        if (market.id !== selected.id) return market;
        const bets = [
          ...market.bets,
          {
            id: `local-${Date.now()}`,
            bettorId: DEMO_VIEWER_ID,
            outcome,
            amount,
            createdAt: new Date().toISOString(),
          },
        ];
        return {
          ...market,
          bets,
          pools: poolTotals(bets),
          participantCount: new Set(bets.map((bet) => bet.bettorId)).size,
          version: market.version + 1,
        };
      }),
    );
  }

  return (
    <ScreenFrame eyebrow="PLAY-MONEY POOLS · NOT AN EXCHANGE" title="BET">
      <Text style={styles.disclaimer}>
        Predict whether a friend finishes an accepted quest. Credit is virtual
        and has no monetary value. Pools are pari-mutuel COMPLETE / FAIL, not
        odds or an order book.
      </Text>
      <View
        accessibilityLabel={`${balance} credit available`}
        style={styles.balanceRow}
      >
        <Text style={styles.balanceLabel}>YOUR CREDIT</Text>
        <Text style={styles.balanceValue}>◉ {balance}</Text>
      </View>

      {markets.map((market) => (
        <MarketRow
          key={market.id}
          market={market}
          selected={market.id === selected?.id}
          onSelect={() => setSelectedId(market.id)}
        />
      ))}

      {selected ? (
        <>
          <MarketTimeline market={selected} />
          <PredictionMarketCard
            key={selected.id}
            balance={balance}
            closesLabel={selected.closesLabel}
            market={selected}
            onPlaced={place}
            participantName={selected.participantName}
            viewerId={DEMO_VIEWER_ID}
          />
        </>
      ) : (
        <HudCard accessibilityLabel="No open party markets">
          <Text style={styles.empty}>
            No party markets yet. Markets open when a friend accepts a quest.
          </Text>
        </HudCard>
      )}

      <SelfBountyCard balance={balance} />
    </ScreenFrame>
  );
}

function MarketRow({
  market,
  selected,
  onSelect,
}: {
  market: DemoMarket;
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
      <HudCard>
        <View style={styles.row}>
          <StatusPill label={market.status} />
          <Text style={styles.meta}>{market.closesLabel}</Text>
        </View>
        <Text style={styles.prompt}>{market.prompt}</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${completeShare}%` }]} />
        </View>
        <View style={styles.row}>
          <Text style={styles.poolStat}>
            COMPLETE ◉ {market.pools.COMPLETE} · {completeShare}% of pool
          </Text>
          <Text style={styles.poolStat}>FAIL ◉ {market.pools.FAIL}</Text>
        </View>
        <Text style={styles.meta}>
          {market.participantCount} predictors · estimated payouts change as
          friends join
        </Text>
      </HudCard>
    </Pressable>
  );
}

function MarketTimeline({ market }: { market: DemoMarket }) {
  const steps = [
    { id: "OPEN", label: "OPEN", done: true },
    {
      id: "CLOSED",
      label: "CLOSES",
      done: market.status !== "OPEN",
    },
    {
      id: "SETTLED",
      label: market.status === "VOID" ? "VOID" : "SETTLED",
      done: market.status === "SETTLED" || market.status === "VOID",
    },
  ];
  return (
    <HudCard accessibilityLabel="Market resolution timeline">
      <Text style={styles.timelineTitle}>RESOLUTION</Text>
      <View style={styles.timeline}>
        {steps.map((step) => (
          <View key={step.id} style={styles.timelineStep}>
            <View style={[styles.dot, step.done && styles.dotDone]} />
            <Text style={styles.timelineLabel}>{step.label}</Text>
          </View>
        ))}
      </View>
      {market.outcome ? (
        <Text style={styles.meta}>Resolved {market.outcome}.</Text>
      ) : null}
    </HudCard>
  );
}

const styles = StyleSheet.create({
  disclaimer: {
    color: colors.surface,
    fontSize: 13,
    lineHeight: 19,
  },
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
    includeFontPadding: false,
    letterSpacing: 1.4,
    lineHeight: 20,
  },
  balanceValue: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: "900",
    includeFontPadding: false,
    lineHeight: 20,
  },
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
  meta: { color: colors.muted, fontSize: 12, marginTop: spacing.xs },
  barTrack: {
    backgroundColor: colors.outline,
    borderRadius: radii.pill,
    height: 10,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  barFill: {
    backgroundColor: colors.brandDeep,
    height: 10,
  },
  poolStat: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  empty: { color: colors.ink, fontWeight: "700" },
  timelineTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  timeline: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  timelineStep: { alignItems: "center", flex: 1 },
  dot: {
    backgroundColor: colors.outline,
    borderRadius: radii.pill,
    height: 12,
    width: 12,
  },
  dotDone: { backgroundColor: colors.brandDeep },
  timelineLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
});
