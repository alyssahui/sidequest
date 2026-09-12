import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import { demoFeed, FeedEventList } from "../feed/FeedScreen";
import { ScreenFrame } from "../shell/ScreenFrame";
import { AddFriendOverlay } from "./AddFriendOverlay";
import { demoMembers, type PartyMember } from "./demoMembers";
import { FriendPreviewOverlay } from "./FriendPreviewOverlay";

const partyTabs = ["PARTY", "FEED"] as const;
type PartyTab = (typeof partyTabs)[number];

export function PartyScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<PartyTab>("PARTY");
  const [members, setMembers] = useState(demoMembers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selected = members.find((member) => member.id === selectedId);

  function addFriend(name: string) {
    const id = `friend-${Date.now()}`;
    setMembers((current) => [
      ...current,
      {
        id,
        name,
        avatar: name.slice(0, 1).toUpperCase(),
        status: "Just joined",
        credit: 100,
        self: false,
        recent: [],
        likes: ["Food"],
        questStyle: "BALANCED",
        social: "Friends",
      },
    ]);
    setAdding(false);
  }

  return (
    <ScreenFrame
      eyebrow="FRIENDS ONLINE · 2"
      headerRight={
        <Pressable
          accessibilityLabel="Add a friend"
          accessibilityRole="button"
          onPress={() => setAdding(true)}
          style={styles.add}
        >
          <Text style={styles.addText}>+</Text>
        </Pressable>
      }
      title="Your Party"
    >
      <View accessibilityRole="tablist" style={styles.tabs}>
        {partyTabs.map((label) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === label }}
            key={label}
            onPress={() => setTab(label)}
            style={[styles.tab, tab === label && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, tab === label && styles.tabTextActive]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "PARTY" ? (
        <SquadPanel members={members} onSelect={setSelectedId} />
      ) : (
        <StoryPanel />
      )}

      {selected ? (
        <FriendPreviewOverlay
          member={selected}
          onAccount={() => undefined}
          onClose={() => setSelectedId(null)}
          onNotifications={() => undefined}
          onPreferences={() => {
            setSelectedId(null);
            router.push("/profile/preferences");
          }}
        />
      ) : null}

      {adding ? (
        <AddFriendOverlay onAdd={addFriend} onClose={() => setAdding(false)} />
      ) : null}
    </ScreenFrame>
  );
}

function SquadPanel({
  members,
  onSelect,
}: {
  members: PartyMember[];
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <HudCard>
        <StatusPill label="WEEKLY PARTY QUEST" />
        <Text style={styles.raidTitle}>Try three new places together</Text>
        <Text style={styles.meta}>2 of 3 complete · Everyone earns ◉ 75</Text>
      </HudCard>

      {members.map((member) => (
        <Pressable
          accessibilityHint="Opens a profile preview"
          accessibilityLabel={`${member.name}. ${member.credit} credit. ${member.status}`}
          accessibilityRole="button"
          key={member.id}
          onPress={() => onSelect(member.id)}
        >
          <HudCard style={styles.member}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{member.avatar}</Text>
            </View>
            <View style={styles.memberText}>
              <Text style={styles.name}>{member.name}</Text>
              <Text style={styles.meta}>{member.status}</Text>
            </View>
            <CoinAmount amount={member.credit} />
          </HudCard>
        </Pressable>
      ))}
      <Text style={styles.privacy}>
        Party presence is approximate. Exact live locations stay private by
        default.
      </Text>
    </>
  );
}

function StoryPanel() {
  return (
    <>
      <Text style={styles.storyLead}>
        Completions, challenges, and predictions land here so the party and the
        feed stay on one page.
      </Text>
      <FeedEventList events={demoFeed} />
    </>
  );
}

const styles = StyleSheet.create({
  add: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  addText: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: -2,
  },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tab: {
    alignItems: "center",
    borderColor: colors.brand,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  tabActive: { backgroundColor: colors.brand },
  tabText: { color: colors.inkInverse, fontSize: 11, fontWeight: "900" },
  tabTextActive: { color: colors.ink },
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
  storyLead: {
    color: colors.surface,
    fontSize: 13,
    lineHeight: 19,
  },
});
