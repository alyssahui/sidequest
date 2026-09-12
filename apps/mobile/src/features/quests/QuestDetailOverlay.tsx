import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { CoinAmount } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import type { QuestItem } from "./demoData";

type Props = {
  quest: QuestItem;
  balance: number;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onComplete: () => void;
  onFail: () => void;
};

export function QuestDetailOverlay({
  quest,
  balance,
  onClose,
  onAccept,
  onDecline,
  onCancel,
  onComplete,
  onFail,
}: Props) {
  const pending =
    quest.attention &&
    quest.status === "PENDING" &&
    quest.direction === "INCOMING";
  const active = quest.status === "ACTIVE";
  const insufficient = pending && quest.stake > balance;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close quest details"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel={`Details for ${quest.title}`}
          style={styles.sheet}
        >
          <Text style={styles.kicker}>
            {quest.kind === "OWN"
              ? "YOUR TASK"
              : quest.kind === "CHALLENGE"
                ? "FRIEND CHALLENGE"
                : "SYSTEM QUEST"}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            {quest.title}
          </Text>
          <Text style={styles.meta}>📍 {quest.location}</Text>
          <Text style={styles.meta}>⏱ {quest.timeLeft} left</Text>
          <Text style={styles.body}>{quest.description}</Text>
          {quest.kind === "OWN" ? (
            <Text style={styles.body}>
              Self-wager ◉ {quest.stake}. Finish and the credit returns. Miss it
              and it is forfeited. Virtual credit has no monetary value.
            </Text>
          ) : quest.direction === "OUTGOING" ? (
            <Text style={styles.body}>
              Waiting on {quest.person}. Your ◉ {quest.stake} is held. If they
              decline, every escrowed credit is returned—no hard feelings.
            </Text>
          ) : quest.kind === "SYSTEM" ? (
            <Text style={styles.body}>
              SideQuest spawned this. Wager ◉ {quest.stake}. Declining has no
              penalty and never shares your location.
            </Text>
          ) : (
            <Text style={styles.body}>
              {quest.person} challenged you. Wager ◉ {quest.stake}. Declining
              has no penalty and never shares your location.
            </Text>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>WAGER</Text>
            <CoinAmount amount={quest.stake} />
          </View>
          <Text style={styles.balance}>Your credit: ◉ {balance}</Text>

          {pending ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: insufficient }}
                disabled={insufficient}
                onPress={onAccept}
                style={[styles.primary, insufficient && styles.disabled]}
              >
                <Text style={styles.primaryText}>
                  {insufficient ? "NOT ENOUGH CREDIT" : "ACCEPT"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onDecline}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>DECLINE</Text>
              </Pressable>
            </View>
          ) : null}

          {quest.kind === "CHALLENGE" &&
          quest.direction === "OUTGOING" &&
          quest.status === "PENDING" ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>RECALL CHALLENGE</Text>
              </Pressable>
            </View>
          ) : null}

          {active ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={onComplete}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>MARK COMPLETE</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onFail}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>MARK FAILED</Text>
              </Pressable>
            </View>
          ) : null}

          {quest.status === "COMPLETE" || quest.status === "FAILED" ? (
            <Text style={styles.body}>
              {quest.status === "COMPLETE"
                ? "Done. Credit settled for this task."
                : "Missed. The wagered credit is gone."}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 18, 22, 0.72)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  kicker: {
    color: colors.brandDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
  },
  meta: { color: colors.ink, fontWeight: "700" },
  body: { color: colors.muted, lineHeight: 21 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  label: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  balance: { color: colors.muted, fontSize: 12 },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  primary: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 48,
  },
  disabled: { opacity: 0.45 },
  primaryText: { color: colors.inkInverse, fontWeight: "900" },
  secondary: {
    alignItems: "center",
    borderColor: colors.brandDeep,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  secondaryText: { color: colors.brandDeep, fontWeight: "800" },
  close: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  closeText: { color: colors.ink, fontWeight: "800" },
});
