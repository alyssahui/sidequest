import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { CoinAmount } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import type { QuestItem } from "./demoData";
import { formatTimeLeft } from "./dueAt";
import { LocationPinIcon } from "./MetaIcons";

type Props = {
  quest: QuestItem;
  balance: number;
  now: number | null;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onComplete: () => void;
  onFail: () => void;
};

export function QuestDetailOverlay({
  quest,
  balance,
  now,
  onClose,
  onAccept,
  onDecline,
  onComplete,
  onFail,
}: Props) {
  const pending =
    quest.attention &&
    quest.status === "PENDING" &&
    quest.direction === "INCOMING";
  const active = quest.status === "ACTIVE";
  const insufficient = pending && quest.stake > balance;
  const timeLeft = now === null ? "…" : formatTimeLeft(quest.dueAt, now);

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
          <View style={styles.metaRow}>
            <LocationPinIcon color={colors.ink} />
            <Text style={styles.meta}>{quest.location}</Text>
          </View>
          <Text style={styles.meta}>
            {timeLeft === "expired" ? "EXPIRED" : `⏱ ${timeLeft} left`}
          </Text>
          {quest.description ? (
            <Text style={styles.body}>{quest.description}</Text>
          ) : null}
          {quest.kind === "OWN" ? (
            <Text style={styles.body}>
              Self-wager ◉ {quest.stake}. Complete to gain it. Fail to lose it.
            </Text>
          ) : quest.direction === "OUTGOING" ? (
            <Text style={styles.body}>
              Waiting on {quest.person}. Wager ◉ {quest.stake}.
            </Text>
          ) : quest.kind === "SYSTEM" ? (
            <Text style={styles.body}>
              Spawned quest. Wager ◉ {quest.stake}.
            </Text>
          ) : (
            <Text style={styles.body}>
              {quest.person} challenged you. Wager ◉ {quest.stake}.
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
                ? `Done. ◉ ${quest.stake} added to your credit.`
                : `Missed. ◉ ${quest.stake} deducted from your credit.`}
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
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  meta: { color: colors.ink, flex: 1, fontWeight: "700" },
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
