import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import type { QuestItem } from "./demoData";

const friends = ["Ben", "Alyssa", "Chris"] as const;
const stakes = [10, 25, 50] as const;

type Mode = "OWN" | "CHALLENGE";

type Props = {
  balance: number;
  onClose: () => void;
  onCreate: (quest: QuestItem) => void;
};

export function AddTaskOverlay({ balance, onClose, onCreate }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [friend, setFriend] = useState<(typeof friends)[number]>("Ben");
  const [stake, setStake] = useState<(typeof stakes)[number]>(25);
  const valid = title.trim().length >= 3 && stake <= balance;

  function submit() {
    if (!mode || !valid) return;
    const now = Date.now();
    if (mode === "OWN") {
      onCreate({
        id: `own-${now}`,
        kind: "OWN",
        status: "ACTIVE",
        attention: false,
        direction: "SELF",
        escrowHeld: true,
        title: title.trim(),
        location: location.trim() || "Your call",
        person: "You",
        description:
          description.trim() || "A promise you put credit behind yourself.",
        timeLeft: "24 hrs",
        stake,
      });
      return;
    }
    onCreate({
      id: `challenge-out-${now}`,
      kind: "CHALLENGE",
      status: "PENDING",
      attention: false,
      direction: "OUTGOING",
      escrowHeld: true,
      title: title.trim(),
      location: location.trim() || "Campus",
      person: friend,
      description:
        description.trim() ||
        `You challenged ${friend}. They can accept or decline with no penalty.`,
      timeLeft: "24 hrs",
      stake,
    });
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close add task"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel="Create a task or challenge"
          style={styles.sheet}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.kicker}>NEW</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Add a task
            </Text>
            <Text style={styles.help}>
              Make a yellow self-wager, or send a red challenge to a friend.
              Credit is virtual and has no monetary value.
            </Text>

            <View accessibilityRole="tablist" style={styles.modes}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === "OWN" }}
                onPress={() => setMode("OWN")}
                style={[styles.mode, mode === "OWN" && styles.modeYellow]}
              >
                <Text
                  style={[
                    styles.modeText,
                    mode === "OWN" && styles.modeTextDark,
                  ]}
                >
                  QUEST
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === "CHALLENGE" }}
                onPress={() => setMode("CHALLENGE")}
                style={[styles.mode, mode === "CHALLENGE" && styles.modeRed]}
              >
                <Text
                  style={[
                    styles.modeText,
                    mode === "CHALLENGE" && styles.modeTextLight,
                  ]}
                >
                  CHALLENGE
                </Text>
              </Pressable>
            </View>

            {mode === "CHALLENGE" ? (
              <>
                <Text style={styles.label}>CHALLENGE PLAYER</Text>
                <View style={styles.row}>
                  {friends.map((name) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: friend === name }}
                      key={name}
                      onPress={() => setFriend(name)}
                      style={[
                        styles.chip,
                        friend === name && styles.chipSelected,
                      ]}
                    >
                      <Text style={styles.chipText}>{name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            {mode ? (
              <>
                <TextInput
                  accessibilityLabel="Task title"
                  onChangeText={setTitle}
                  placeholder="What needs doing?"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={title}
                />
                <TextInput
                  accessibilityLabel="Task location"
                  onChangeText={setLocation}
                  placeholder="Location"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={location}
                />
                <TextInput
                  accessibilityLabel="Task description"
                  multiline
                  onChangeText={setDescription}
                  placeholder="Short description"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.multiline]}
                  value={description}
                />
                <Text style={styles.label}>
                  {mode === "OWN" ? "SELF-WAGER" : "SYMMETRIC WAGER"}
                </Text>
                <View style={styles.row}>
                  {stakes.map((amount) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: stake === amount }}
                      key={amount}
                      onPress={() => setStake(amount)}
                      style={[
                        styles.chip,
                        stake === amount && styles.chipSelected,
                      ]}
                    >
                      <Text style={styles.chipText}>◉ {amount}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.help}>
                  {mode === "OWN"
                    ? "Finish and your stake returns. Miss it and the credit is forfeited. No new credit is created."
                    : `You and ${friend} each put up the same stake. Declining has no penalty.`}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !valid }}
                  disabled={!valid}
                  onPress={submit}
                  style={[styles.primary, !valid && styles.disabled]}
                >
                  <Text style={styles.primaryText}>
                    {stake > balance
                      ? "NOT ENOUGH CREDIT"
                      : mode === "OWN"
                        ? "CREATE TASK"
                        : "SEND CHALLENGE"}
                  </Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={styles.close}
            >
              <Text style={styles.closeText}>CLOSE</Text>
            </Pressable>
          </ScrollView>
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
    maxHeight: "88%",
    padding: spacing.lg,
    paddingBottom: spacing.xl,
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
    marginTop: spacing.xs,
  },
  help: { color: colors.muted, lineHeight: 20, marginTop: spacing.sm },
  modes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  mode: {
    alignItems: "center",
    borderColor: colors.outline,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  modeYellow: { backgroundColor: colors.warning, borderColor: colors.warning },
  modeRed: { backgroundColor: colors.brandDeep, borderColor: colors.brandDeep },
  modeText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  modeTextDark: { color: colors.ink },
  modeTextLight: { color: colors.inkInverse },
  label: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    alignItems: "center",
    borderColor: colors.brandDeep,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  chipSelected: { backgroundColor: colors.brand },
  chipText: { color: colors.ink, fontWeight: "900" },
  input: {
    borderColor: colors.outline,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  primary: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  disabled: { opacity: 0.45 },
  primaryText: { color: colors.inkInverse, fontWeight: "900" },
  close: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  closeText: { color: colors.ink, fontWeight: "800" },
});
