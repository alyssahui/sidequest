import { StyleSheet, Text, View } from "react-native";

import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import { ScreenFrame } from "../shell/ScreenFrame";

const members = [
  { name: "Zuri", status: "On a quest", coins: 420, avatar: "Z" },
  { name: "Alyssa", status: "Near campus", coins: 365, avatar: "A" },
  { name: "Ben", status: "Location paused", coins: 290, avatar: "B" },
];

export function PartyScreen() {
  return (
    <ScreenFrame eyebrow="FRIENDS ONLINE · 2" title="THE PARTY">
      <HudCard>
        <StatusPill label="WEEKLY PARTY QUEST" />
        <Text style={styles.raidTitle}>Try three new places together</Text>
        <Text style={styles.meta}>2 of 3 complete · Everyone earns ◉ 75</Text>
      </HudCard>

      {members.map((member) => (
        <HudCard key={member.name} style={styles.member}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{member.avatar}</Text>
          </View>
          <View style={styles.memberText}>
            <Text style={styles.name}>{member.name}</Text>
            <Text style={styles.meta}>{member.status}</Text>
          </View>
          <CoinAmount amount={member.coins} />
        </HudCard>
      ))}
      <Text style={styles.privacy}>
        Party presence is approximate. Exact live locations stay private by
        default.
      </Text>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  raidTitle: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  meta: { color: colors.muted, marginTop: spacing.xs },
  member: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: { color: colors.inkInverse, fontSize: 20, fontWeight: "900" },
  memberText: { flex: 1 },
  name: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  privacy: {
    color: colors.surface,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
