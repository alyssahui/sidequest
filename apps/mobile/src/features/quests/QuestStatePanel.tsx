import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@sidequest/ui/theme";
export type QuestViewState =
  | "ready"
  | "loading"
  | "empty"
  | "error"
  | "offline"
  | "permission-denied"
  | "expired"
  | "conflict"
  | "complete";
const copy: Record<
  Exclude<QuestViewState, "ready">,
  { title: string; detail: string; action?: string }
> = {
  loading: { title: "LOADING QUESTS", detail: "Checking the game world…" },
  empty: {
    title: "NO QUESTS HERE",
    detail: "None nearby.",
  },
  error: {
    title: "QUESTS COULDN'T LOAD",
    detail: "Your progress is safe. Try again.",
    action: "RETRY",
  },
  offline: {
    title: "OFFLINE MODE",
    detail:
      "Saved quests remain visible. Evidence will send after reconnecting.",
    action: "RETRY",
  },
  "permission-denied": {
    title: "LOCATION IS PAUSED",
    detail:
      "GPS evidence needs foreground permission. You can choose a photo quest instead.",
    action: "OPEN SETTINGS",
  },
  expired: {
    title: "QUEST EXPIRED",
    detail: "This quest expired.",
    action: "VIEW ALTERNATIVES",
  },
  conflict: {
    title: "QUEST ALREADY UPDATED",
    detail: "Refresh to see its latest state and resolution.",
    action: "REFRESH",
  },
  complete: {
    title: "QUEST VERIFIED",
    detail: "Quest complete.",
    action: "BACK TO QUESTS",
  },
};
export function QuestStatePanel({
  state,
  onAction,
}: {
  state: QuestViewState;
  onAction?: () => void;
}) {
  if (state === "ready") return null;
  const c = copy[state];
  return (
    <View accessibilityRole="alert" style={styles.panel}>
      <Text style={styles.title}>{c.title}</Text>
      <Text style={styles.detail}>{c.detail}</Text>
      {c.action ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={styles.action}
        >
          <Text style={styles.actionText}>{c.action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.brand,
    borderRadius: radii.md,
    borderWidth: 2,
    padding: spacing.lg,
  },
  title: { color: colors.ink, fontWeight: "900", letterSpacing: 1 },
  detail: { color: colors.muted, lineHeight: 21, marginTop: spacing.sm },
  action: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  actionText: { color: colors.inkInverse, fontWeight: "900" },
});
