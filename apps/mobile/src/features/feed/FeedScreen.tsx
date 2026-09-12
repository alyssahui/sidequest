import { StyleSheet, Text } from "react-native";

import type { FeedEvent } from "@sidequest/contracts/events";
import { CoinAmount, HudCard } from "@sidequest/ui/components";
import { colors, spacing } from "@sidequest/ui/theme";

import { ScreenFrame } from "../shell/ScreenFrame";

const feed: FeedEvent[] = [
  {
    id: "feed-1",
    type: "quest.completed",
    occurredAt: "2026-09-11T18:30:00.000Z",
    actorDisplayName: "Zuri",
    title: "completed “7 AM Run”",
    detail: "Six friends predicted against them. Legendary comeback.",
    coinDelta: 120,
  },
  {
    id: "feed-2",
    type: "challenge.issued",
    occurredAt: "2026-09-11T18:10:00.000Z",
    actorDisplayName: "Chris",
    title: "challenged Maya",
    detail: "Find the weirdest drink under $5. Declining has no penalty.",
  },
];

function FeedEventCard({ event }: { event: FeedEvent }) {
  return (
    <HudCard
      accessibilityLabel={`${event.actorDisplayName ?? "Party"} ${event.title}`}
    >
      <Text style={styles.title}>
        {event.type === "quest.completed" ? "🏆" : "⚔️"}{" "}
        {event.actorDisplayName} {event.title}
      </Text>
      {event.detail ? <Text style={styles.detail}>{event.detail}</Text> : null}
      {event.coinDelta ? <CoinAmount amount={event.coinDelta} /> : null}
    </HudCard>
  );
}

export function FeedScreen() {
  return (
    <ScreenFrame eyebrow="THE STORY SO FAR" title="PARTY FEED">
      {feed.map((event) => (
        <FeedEventCard event={event} key={event.id} />
      ))}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  detail: {
    color: colors.muted,
    lineHeight: 21,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
});
