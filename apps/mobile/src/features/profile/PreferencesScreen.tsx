import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing } from "@sidequest/ui/theme";

import { ScreenFrame } from "../shell/ScreenFrame";
import {
  ACTIVITY_OPTIONS,
  getPreferences,
  savePreferences,
  type QuestStyle,
} from "./preferencesStore";

const stylesScale: QuestStyle[] = ["CHILL", "BALANCED", "UNHINGED"];

export function PreferencesScreen() {
  const router = useRouter();
  const starting = getPreferences();
  const [questStyle, setQuestStyle] = useState<QuestStyle>(starting.questStyle);
  const [likes, setLikes] = useState<string[]>(starting.likes);
  const [other, setOther] = useState("");

  function toggle(activity: string) {
    setLikes((current) =>
      current.includes(activity)
        ? current.filter((item) => item !== activity)
        : [...current, activity],
    );
  }

  function addOther() {
    const next = other.trim();
    if (next.length < 2) return;
    setLikes((current) =>
      current.includes(next) ? current : [...current, next],
    );
    setOther("");
  }

  const extras = likes.filter(
    (like) =>
      !ACTIVITY_OPTIONS.some(
        (option) => option.toLowerCase() === like.toLowerCase(),
      ),
  );

  return (
    <ScreenFrame eyebrow="PLAYER SETUP" title="Preferences">
      <Text style={styles.help}>
        Tune quest style and pick the activities SideQuest should lean on. Add
        anything missing with Other.
      </Text>

      <Text style={styles.label}>QUEST STYLE</Text>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {stylesScale.map((option) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: questStyle === option }}
            key={option}
            onPress={() => setQuestStyle(option)}
            style={[
              styles.choice,
              questStyle === option && styles.choiceActive,
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                questStyle === option && styles.choiceTextActive,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>I LIKE TO DO</Text>
      <View style={styles.wrap}>
        {ACTIVITY_OPTIONS.map((activity) => {
          const on = likes.includes(activity);
          return (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              key={activity}
              onPress={() => toggle(activity)}
            >
              <View style={on ? undefined : styles.offPill}>
                <StatusPill label={activity.toUpperCase()} />
              </View>
            </Pressable>
          );
        })}
        {extras.map((activity) => (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: true }}
            key={activity}
            onPress={() => toggle(activity)}
          >
            <StatusPill label={activity.toUpperCase()} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>OTHER</Text>
      <View style={styles.otherRow}>
        <TextInput
          accessibilityLabel="Other activity"
          onChangeText={setOther}
          onSubmitEditing={addOther}
          placeholder="Other…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={other}
        />
        <Pressable
          accessibilityRole="button"
          onPress={addOther}
          style={styles.add}
        >
          <Text style={styles.addText}>ADD</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          savePreferences({ questStyle, likes });
          router.back();
        }}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>SAVE PREFERENCES</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.close}
      >
        <Text style={styles.closeText}>BACK TO PROFILE</Text>
      </Pressable>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  help: { color: colors.surface, lineHeight: 21 },
  label: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: {
    alignItems: "center",
    borderColor: colors.brand,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  choiceActive: { backgroundColor: colors.brand },
  choiceText: { color: colors.inkInverse, fontSize: 11, fontWeight: "900" },
  choiceTextActive: { color: colors.ink },
  offPill: { opacity: 0.35 },
  otherRow: { flexDirection: "row", gap: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  add: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 72,
    paddingHorizontal: spacing.md,
  },
  addText: { color: colors.inkInverse, fontWeight: "900" },
  primary: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryText: { color: colors.ink, fontWeight: "900" },
  close: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  closeText: { color: colors.surface, fontWeight: "800" },
});
