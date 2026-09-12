import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

export type ComposedChallenge = {
  id: string;
  direction: "OUTGOING";
  person: string;
  title: string;
  stake: number;
  expires: string;
  status: "DELIVERED";
  progress: number;
  explanation: string;
};
const players = ["Etash", "Alyssa"];

export function ChallengeComposer({
  onSend,
}: {
  onSend: (challenge: ComposedChallenge) => void;
}) {
  const [recipient, setRecipient] = useState("Etash");
  const [task, setTask] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const assessment = useMemo(() => assess(task, location), [task, location]);
  const valid = task.trim().length >= 4;
  return (
    <HudCard accessibilityLabel="Create a player challenge">
      <StatusPill label="⚔ BUILD A CHALLENGE" />
      <Text style={styles.title}>Light the fuse.</Text>
      <Text style={styles.help}>
        Choose a Party player, write the mission, and SideQuest will classify it
        and calibrate a fair symmetric barter.
      </Text>
      <Text style={styles.label}>CHALLENGE PLAYER</Text>
      <View style={styles.players}>
        {players.map((player) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: recipient === player }}
            key={player}
            onPress={() => setRecipient(player)}
            style={[styles.choice, recipient === player && styles.choiceActive]}
          >
            <Text style={styles.choiceText}>{player}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Challenge task"
        multiline
        onChangeText={setTask}
        placeholder="Example: Teach me one chord on guitar before tonight"
        placeholderTextColor={colors.muted}
        style={[styles.input, styles.task]}
        value={task}
      />
      <TextInput
        accessibilityLabel="Challenge location"
        onChangeText={setLocation}
        placeholder="Location (optional)"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={location}
      />
      <TextInput
        accessibilityLabel="Challenge notes"
        onChangeText={setNotes}
        placeholder="Notes or friendly context (optional)"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={notes}
      />
      {valid ? (
        <View
          accessibilityLabel="Challenge assessment"
          style={styles.assessment}
        >
          <View style={styles.row}>
            <StatusPill label={assessment.category.toUpperCase()} />
            <CoinAmount amount={assessment.stake} />
          </View>
          <Text style={styles.explanation}>{assessment.explanation}</Text>
          <Text style={styles.help}>
            📸 Photo + ⏱ complete within 24 hours · both players barter{" "}
            {assessment.stake} credit
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !valid }}
        disabled={!valid}
        onPress={() => {
          onSend({
            id: `sent-${Date.now()}`,
            direction: "OUTGOING",
            person: recipient,
            title: task.trim(),
            stake: assessment.stake,
            expires: "24 hrs",
            status: "DELIVERED",
            progress: 0,
            explanation: `${assessment.explanation}${notes.trim() ? ` Field note: ${notes.trim()}` : ""}`,
          });
          setTask("");
          setLocation("");
          setNotes("");
        }}
        style={[styles.send, !valid && styles.disabled]}
      >
        <Text style={styles.sendText}>SEND CHALLENGE ⚡</Text>
      </Pressable>
    </HudCard>
  );
}

function assess(task: string, location: string) {
  const category = /walk|run|gym|rest/i.test(task)
    ? "wellness"
    : /clean|trash|litter/i.test(task)
      ? "community cleanup"
      : /friend|call|message/i.test(task)
        ? "reconnect"
        : /shop|food|cafe/i.test(task)
          ? "support local"
          : "learn & teach";
  const stake = Math.min(
    100,
    15 +
      Math.max(0, Math.ceil(task.trim().length / 45)) * 5 +
      (location.trim() ? 5 : 0),
  );
  return {
    category,
    stake,
    explanation: `🔥 ${category} quest detected! The ${stake}-credit barter matches the mission detail${location.trim() ? " and location commitment" : ""}.`,
  };
}
const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  help: { color: colors.muted, lineHeight: 21, marginTop: spacing.sm },
  label: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: spacing.lg,
  },
  players: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  choice: {
    alignItems: "center",
    borderColor: colors.brandDeep,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  choiceActive: { backgroundColor: colors.brand },
  choiceText: { color: colors.ink, fontWeight: "900" },
  input: {
    borderColor: colors.outline,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    marginTop: spacing.md,
    minHeight: 48,
    padding: spacing.md,
  },
  task: { minHeight: 88, textAlignVertical: "top" },
  assessment: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radii.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  explanation: {
    color: colors.brandDeep,
    fontWeight: "800",
    lineHeight: 21,
    marginTop: spacing.md,
  },
  send: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  disabled: { opacity: 0.45 },
  sendText: { color: colors.inkInverse, fontWeight: "900", letterSpacing: 1 },
});
