import { StyleSheet, Text } from "react-native";

import type { FeedEvent } from "@sidequest/contracts/events";
import { CoinAmount, HudCard } from "@sidequest/ui/components";
import { colors, spacing } from "@sidequest/ui/theme";

export const demoFeed: FeedEvent[] = [
  {
    id: "feed-1",
    type: "quest.completed",
    occurredAt: "2026-09-11T18:30:00.000Z",
    actorDisplayName: "Zuri",
    title: "completed “7 AM Run”",
    detail: "Six friends predicted against them.",
    coinDelta: 120,
  },
  {
    id: "feed-2",
    type: "prediction.won",
    occurredAt: "2026-09-11T18:22:00.000Z",
    actorDisplayName: "Alyssa",
    title: "won a prediction on Etash",
    detail: "COMPLETE pool paid out.",
    coinDelta: 35,
  },
  {
    id: "feed-3",
    type: "challenge.issued",
    occurredAt: "2026-09-11T18:10:00.000Z",
    actorDisplayName: "Chris",
    title: "challenged Maya",
    detail: "Find the weirdest drink under $5.",
  },
  {
    id: "feed-4",
    type: "quest.group_invite",
    occurredAt: "2026-09-11T17:40:00.000Z",
    actorDisplayName: "Party",
    title: "invited everyone to a Boss Raid",
    detail: "Saturday IKEA Expedition. Join from the map when you are nearby.",
  },
  {
    id: "feed-5",
    type: "unknown.future",
    occurredAt: "2026-09-11T17:00:00.000Z",
    actorDisplayName: "Party",
    title: "posted a party note",
    detail: "Something happened in the party. Details stay private.",
  },
];

const icons: Record<string, string> = {
  "quest.completed": "🏆",
  "prediction.won": "◉",
  "challenge.issued": "⚔️",
  "quest.group_invite": "⚡",
};

function eventIcon(type: string) {
  return icons[type] ?? "✦";
}

export function FeedEventCard({ event }: { event: FeedEvent }) {
  return (
    <HudCard
      accessibilityLabel={`${event.actorDisplayName ?? "Party"} ${event.title}`}
    >
      <Text style={styles.title}>
        {eventIcon(event.type)} {event.actorDisplayName} {event.title}
      </Text>
      {event.detail ? <Text style={styles.detail}>{event.detail}</Text> : null}
      {event.coinDelta ? <CoinAmount amount={event.coinDelta} /> : null}
    </HudCard>
  );
}

export function FeedEventList({ events }: { events: readonly FeedEvent[] }) {
  return (
    <>
      {events.map((event) => (
        <FeedEventCard event={event} key={event.id} />
      ))}
    </>
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
