import { StyleSheet, Text } from "react-native";

import { HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, spacing, typeScale } from "@sidequest/ui/theme";

import { ScreenFrame } from "./ScreenFrame";

export function QuestsScreen() {
  return (
    <ScreenFrame eyebrow="YOUR ADVENTURES" title="QUESTS">
      <StatusPill label="ACTIVE · 1" />
      <HudCard>
        <Text style={styles.title}>Morning walk with the Party</Text>
        <Text style={styles.meta}>12 min left · GPS verification · ◉ 45</Text>
        <Text style={styles.note}>
          Quest lifecycle UI will be supplied by the quests feature module.
        </Text>
      </HudCard>
      <StatusPill label="NEARBY · 3" />
      <HudCard>
        <Text style={styles.title}>Something is happening nearby.</Text>
        <Text style={styles.note}>
          This stable route is ready for the quest agent's exported screen.
        </Text>
      </HudCard>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: typeScale.title, fontWeight: "900" },
  meta: { color: colors.ink, marginTop: spacing.sm },
  note: { color: colors.muted, lineHeight: 22, marginTop: spacing.md },
});
