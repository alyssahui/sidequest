import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import type { PartyMember } from "./demoMembers";

type Props = {
  member: PartyMember;
  onClose: () => void;
  onAccount?: () => void;
  onPreferences?: () => void;
  onNotifications?: () => void;
};

export function FriendPreviewOverlay({
  member,
  onClose,
  onAccount,
  onPreferences,
  onNotifications,
}: Props) {
  const [note, setNote] = useState<string | null>(null);
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close friend preview"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel={`${member.name} profile preview`}
          style={styles.sheet}
        >
          <Text style={styles.kicker}>
            {member.self ? "YOUR PROFILE" : "PARTY MEMBER"}
          </Text>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{member.avatar}</Text>
            </View>
            <View style={styles.grow}>
              <Text accessibilityRole="header" style={styles.title}>
                {member.name}
              </Text>
              <Text style={styles.meta}>{member.status}</Text>
            </View>
            <CoinAmount amount={member.credit} />
          </View>

          <Text style={styles.label}>CREDIT</Text>
          <Text style={styles.body}>◉ {member.credit} available</Text>

          <Text style={styles.label}>RECENTLY COMPLETED</Text>
          {member.recent.map((item) => (
            <HudCard key={item} style={styles.recent}>
              <Text style={styles.recentText}>{item}</Text>
            </HudCard>
          ))}

          <Text style={styles.label}>PREFERENCES</Text>
          <Text style={styles.body}>
            Quest style {member.questStyle} · Social {member.social}
          </Text>
          <View style={styles.tags}>
            {member.likes.map((like) => (
              <StatusPill key={like} label={like.toUpperCase()} />
            ))}
          </View>

          {member.self ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setNote("Account settings are coming soon.");
                  onAccount?.();
                }}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>ACCOUNT</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onPreferences}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>SET PREFERENCES</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setNote("Notification settings are coming soon.");
                  onNotifications?.();
                }}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>NOTIFICATIONS</Text>
              </Pressable>
            </View>
          ) : null}

          {note ? <Text style={styles.placeholder}>{note}</Text> : null}

          {member.self && !note ? (
            <Text style={styles.placeholder}>
              Account and notifications are placeholders for the demo.
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
  identity: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: { color: colors.inkInverse, fontSize: 20, fontWeight: "900" },
  grow: { flex: 1 },
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
  },
  meta: { color: colors.muted, marginTop: 2 },
  label: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  body: { color: colors.muted, lineHeight: 20 },
  recent: { paddingVertical: spacing.sm },
  recentText: { color: colors.ink, fontWeight: "800" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  primary: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 48,
  },
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
  placeholder: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  close: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  closeText: { color: colors.ink, fontWeight: "800" },
});
