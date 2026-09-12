import { StyleSheet, Text, View } from "react-native";

import { HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, spacing, typeScale } from "@sidequest/ui/theme";

import {
  PredictionMarketCard,
  SelfBountyCard,
} from "../markets/PredictionMarketCard";
import { ScreenFrame } from "./ScreenFrame";

export function QuestsScreen() {
  return (
    <ScreenFrame eyebrow="YOUR ADVENTURES" title="QUESTS">
      <View style={styles.tabs}>
        <StatusPill label="ACTIVE · 1" />
        <StatusPill label="NEARBY · 2" />
        <StatusPill label="CHALLENGES" />
        <StatusPill label="MY LIST" />
      </View>
      <HudCard accessibilityLabel="Active quest: Morning walk with the Party">
        <Text style={styles.title}>Morning walk with the Party</Text>
        <Text style={styles.meta}>12 min left · GPS verification · ◉ 45</Text>
        <Text style={styles.note}>
          Collect three pieces of litter and dispose of them safely. No
          pressure—skip anytime.
        </Text>
      </HudCard>
      <SelfBountyCard />
      <PredictionMarketCard
        participantName="Etash"
        closesLabel="47 minutes remaining"
      />
      <StatusPill label="NEARBY · 3" />
      <HudCard accessibilityLabel="Nearby quest: Something is happening nearby">
        <Text style={styles.title}>Something is happening nearby.</Text>
        <Text style={styles.note}>
          Matches your friends + community preferences. GPS + TIME · 30 credit.
        </Text>
      </HudCard>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: typeScale.title, fontWeight: "900" },
  meta: { color: colors.ink, marginTop: spacing.sm },
  note: { color: colors.muted, lineHeight: 22, marginTop: spacing.md },
});
