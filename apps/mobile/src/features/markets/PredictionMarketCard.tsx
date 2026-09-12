import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type {
  MarketBetDto,
  MarketOutcome,
  MarketStatus,
} from "@sidequest/contracts/market";
import { estimatedPayout } from "@sidequest/market-core";
import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

const demoBets: MarketBetDto[] = [
  {
    id: "demo-1",
    bettorId: "alyssa",
    outcome: "COMPLETE",
    amount: 80,
    createdAt: "1",
  },
  {
    id: "demo-2",
    bettorId: "chris",
    outcome: "FAIL",
    amount: 210,
    createdAt: "2",
  },
];

type Props = {
  participantName: string;
  closesLabel: string;
  status?: MarketStatus;
  balance?: number;
};

export function PredictionMarketCard({
  participantName,
  closesLabel,
  status = "OPEN",
  balance = 110,
}: Props) {
  const [outcome, setOutcome] = useState<MarketOutcome>("COMPLETE");
  const [amount, setAmount] = useState(25);
  const [receipt, setReceipt] = useState<string | null>(null);
  const estimate = useMemo(
    () => estimatedPayout(demoBets, outcome, amount),
    [amount, outcome],
  );
  const disabled = status !== "OPEN" || amount > balance;

  return (
    <HudCard
      accessibilityLabel={`Prediction for ${participantName}`}
      style={styles.card}
    >
      <View style={styles.row}>
        <StatusPill label="PARTY PREDICTION" />
        <CoinAmount amount={balance} />
      </View>
      <Text style={styles.title}>Will {participantName} actually do it?</Text>
      <Text style={styles.caption}>
        {closesLabel} · Virtual Coins have no monetary value.
      </Text>

      <View accessibilityRole="radiogroup" style={styles.outcomes}>
        {(["COMPLETE", "FAIL"] as const).map((choice) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: outcome === choice }}
            key={choice}
            onPress={() => {
              setOutcome(choice);
              setReceipt(null);
            }}
            style={[
              styles.outcome,
              outcome === choice && styles.outcomeSelected,
            ]}
          >
            <Text style={styles.outcomeLabel}>
              {choice === "COMPLETE" ? "✓ COMPLETE" : "× FAIL"}
            </Text>
            <Text style={styles.pool}>
              {choice === "COMPLETE" ? "◉ 80" : "◉ 210"} in pool
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>YOUR PICK</Text>
      <View style={styles.stakes}>
        {[10, 25, 50].map((stake) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: amount === stake }}
            key={stake}
            onPress={() => {
              setAmount(stake);
              setReceipt(null);
            }}
            style={[styles.stake, amount === stake && styles.stakeSelected]}
          >
            <Text
              style={[
                styles.stakeLabel,
                amount === stake && styles.stakeLabelSelected,
              ]}
            >
              ◉ {stake}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.estimate}>
        Estimated total if correct: ◉ {estimate}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setReceipt(`${outcome} · ◉ ${amount} committed`)}
        style={[styles.submit, disabled && styles.disabled]}
      >
        <Text style={styles.submitLabel}>
          {status === "OPEN" ? "CONFIRM PREDICTION" : status}
        </Text>
      </Pressable>
      {receipt ? (
        <Text accessibilityRole="alert" style={styles.receipt}>
          ✓ {receipt}. Your party pool is updated.
        </Text>
      ) : null}
    </HudCard>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.brand, borderWidth: 2 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  outcomes: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  outcome: {
    borderColor: colors.outline,
    borderRadius: radii.sm,
    borderWidth: 2,
    flex: 1,
    minHeight: 68,
    padding: spacing.sm,
  },
  outcomeSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brandDeep,
  },
  outcomeLabel: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  pool: { color: colors.ink, fontSize: 12, marginTop: spacing.xs },
  label: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  stakes: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  stake: {
    alignItems: "center",
    borderColor: colors.outline,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 70,
  },
  stakeSelected: { backgroundColor: colors.brandDeep },
  stakeLabel: { color: colors.ink, fontWeight: "900" },
  stakeLabelSelected: { color: colors.inkInverse },
  estimate: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  submit: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  disabled: { opacity: 0.45 },
  submitLabel: {
    color: colors.inkInverse,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  receipt: {
    color: colors.brandDeep,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: spacing.md,
  },
});

export function SelfBountyCard({ balance = 110 }: { balance?: number }) {
  const [amount, setAmount] = useState(25);
  const [committed, setCommitted] = useState(false);

  return (
    <HudCard accessibilityLabel="Self-bounty commitment">
      <StatusPill label="BACK YOURSELF" />
      <Text style={styles.title}>Put Coins behind your promise</Text>
      <Text style={styles.caption}>
        Finish and your stake returns. Miss it and the Coins are forfeited. No
        new Coins are created.
      </Text>
      <View style={styles.stakes}>
        {[10, 25, 50].map((stake) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: amount === stake }}
            key={stake}
            onPress={() => {
              setAmount(stake);
              setCommitted(false);
            }}
            style={[styles.stake, amount === stake && styles.stakeSelected]}
          >
            <Text
              style={[
                styles.stakeLabel,
                amount === stake && styles.stakeLabelSelected,
              ]}
            >
              ◉ {stake}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: amount > balance || committed }}
        disabled={amount > balance || committed}
        onPress={() => setCommitted(true)}
        style={[
          styles.submit,
          (amount > balance || committed) && styles.disabled,
        ]}
      >
        <Text style={styles.submitLabel}>
          {committed ? "BOUNTY ACTIVE" : "PLACE SELF-BOUNTY"}
        </Text>
      </Pressable>
    </HudCard>
  );
}
