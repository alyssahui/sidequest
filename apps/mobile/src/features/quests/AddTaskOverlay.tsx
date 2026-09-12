import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";
import { DEMO_USERS, useDemoSession } from "../demo/DemoSession";
import type { QuestItem } from "./demoData";

const stakes = [10, 25, 50];
type Mode = "OWN" | "CHALLENGE";
type QuestDesign = {
  title: string;
  description: string;
  impact: string;
  verificationPlan: string;
  suggestedStakeCoins: number;
  source: "grok" | "deterministic-fallback";
  model: string;
};

export function AddTaskOverlay({
  balance,
  onClose,
  onCreate,
}: {
  balance: number;
  onClose: () => void;
  onCreate: (quest: QuestItem) => void | Promise<void>;
}) {
  const { request, requestAudio, user } = useDemoSession();
  const friends = DEMO_USERS.filter((candidate) => candidate.id !== user.id);
  const [mode, setMode] = useState<Mode | null>(null);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [friend, setFriend] = useState(friends[0]?.name ?? "Ben");
  const [stake, setStake] = useState(25);
  const [design, setDesign] = useState<QuestDesign | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = Boolean(mode) && title.trim().length >= 3 && stake <= balance;
  const deadline = () => new Date(Date.now() + 24 * 3600_000).toISOString();

  async function askGrok() {
    const recipient = friends.find((candidate) => candidate.name === friend);
    setWorking("design");
    setError(null);
    try {
      const next = await request<QuestDesign>("/v1/grok/quest-design", {
        method: "POST",
        body: JSON.stringify({
          recipientUserId: recipient?.id,
          partyId: "party-demo",
          task: title,
          locationLabel: location,
          notes: description,
          deadline: deadline(),
        }),
      });
      setDesign(next);
      setTitle(next.title);
      setDescription(next.description);
      setStake(next.suggestedStakeCoins);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Grok design failed");
    } finally {
      setWorking(null);
    }
  }

  async function imagine() {
    setWorking("image");
    setError(null);
    try {
      const result = await request<{ url: string }>("/v1/grok/imagine", {
        method: "POST",
        body: JSON.stringify({ prompt: `${title}. ${description}` }),
      });
      setImageUrl(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Imagine failed");
    } finally {
      setWorking(null);
    }
  }

  async function speak() {
    setWorking("voice");
    setError(null);
    try {
      const blob = await requestAudio("/v1/grok/voice", {
        method: "POST",
        body: JSON.stringify({
          text: `${title}. ${description}. Why it matters: ${design?.impact ?? "Small local actions build community momentum."}`,
        }),
      });
      if (typeof Audio !== "undefined") {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.addEventListener("ended", () => URL.revokeObjectURL(url), {
          once: true,
        });
        await audio.play();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Voice failed");
    } finally {
      setWorking(null);
    }
  }

  async function submit() {
    if (!mode || !valid) return;
    setWorking("send");
    setError(null);
    try {
      await onCreate({
        id: `${mode.toLowerCase()}-${Date.now()}`,
        kind: mode,
        status: mode === "OWN" ? "ACTIVE" : "PENDING",
        attention: false,
        direction: mode === "OWN" ? "SELF" : "OUTGOING",
        escrowHeld: true,
        title: title.trim(),
        location: location.trim() || (mode === "OWN" ? "Your call" : "Campus"),
        person: mode === "OWN" ? "You" : friend,
        description:
          description.trim() ||
          (mode === "OWN"
            ? "A promise you put credit behind yourself."
            : `You challenged ${friend}. They can decline without penalty.`),
        timeLeft: "24 hrs",
        stake,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create quest",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close add task"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel="Create a task or challenge"
          style={styles.sheet}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.kicker}>NEW IMPACT MISSION</Text>
            <Text accessibilityRole="header" style={styles.title}>
              What should change?
            </Text>
            <Text style={styles.help}>
              Start with a human need. Grok turns it into a safe, measurable
              local action; a friend makes the commitment real.
            </Text>
            <View accessibilityRole="tablist" style={styles.row}>
              {(["OWN", "CHALLENGE"] as const).map((choice) => (
                <Pressable
                  key={choice}
                  onPress={() => setMode(choice)}
                  style={[
                    styles.mode,
                    mode === choice &&
                      (choice === "OWN" ? styles.yellow : styles.red),
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      mode === "CHALLENGE" &&
                        choice === "CHALLENGE" &&
                        styles.light,
                    ]}
                  >
                    {choice === "OWN" ? "QUEST" : "CHALLENGE"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {mode === "CHALLENGE" ? (
              <>
                <Text style={styles.label}>CHALLENGE PLAYER</Text>
                <View style={styles.row}>
                  {friends.map((candidate) => (
                    <Pressable
                      key={candidate.id}
                      onPress={() => setFriend(candidate.name)}
                      style={[
                        styles.chip,
                        friend === candidate.name && styles.selected,
                      ]}
                    >
                      <Text style={styles.chipText}>{candidate.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {mode ? (
              <>
                <TextInput
                  accessibilityLabel="Task title"
                  onChangeText={setTitle}
                  placeholder="e.g. Reduce food waste on our block"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={title}
                />
                <TextInput
                  accessibilityLabel="Task location"
                  onChangeText={setLocation}
                  placeholder="Where can this happen?"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={location}
                />
                <TextInput
                  accessibilityLabel="Task description"
                  multiline
                  onChangeText={setDescription}
                  placeholder="Context, constraints, or who this helps"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.multiline]}
                  value={description}
                />
                <View style={styles.grokBox}>
                  <Text style={styles.grokTitle}>
                    GROK MISSION INTELLIGENCE
                  </Text>
                  <Text style={styles.grokHelp}>
                    Reason about impact, safety, verification, and a fair
                    virtual-credit price.
                  </Text>
                  <Pressable
                    disabled={title.trim().length < 3 || Boolean(working)}
                    onPress={() => void askGrok()}
                    style={styles.grokButton}
                  >
                    <Text style={styles.grokButtonText}>
                      {working === "design"
                        ? "GROK IS REASONING…"
                        : "DESIGN + PRICE WITH GROK"}
                    </Text>
                  </Pressable>
                  {design ? (
                    <>
                      <Text style={styles.grokResult}>
                        {design.source === "grok"
                          ? "GROK LIVE"
                          : "SAFE FALLBACK"}{" "}
                        · ◉ {design.suggestedStakeCoins}
                        {"\n"}IMPACT: {design.impact}
                        {"\n"}VERIFY: {design.verificationPlan}
                      </Text>
                      <View style={styles.row}>
                        <Pressable
                          onPress={() => void speak()}
                          style={styles.mediaButton}
                        >
                          <Text style={styles.mediaText}>
                            {working === "voice"
                              ? "GENERATING…"
                              : "▶ VOICE BRIEFING"}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void imagine()}
                          style={styles.mediaButton}
                        >
                          <Text style={styles.mediaText}>
                            {working === "image"
                              ? "GENERATING…"
                              : "✦ IMAGINE CARD"}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  ) : null}
                  {imageUrl ? (
                    <Image
                      accessibilityLabel="Grok Imagine mission art"
                      source={{ uri: imageUrl }}
                      style={styles.image}
                    />
                  ) : null}
                  {error ? (
                    <Text accessibilityRole="alert" style={styles.error}>
                      {error}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.label}>
                  {mode === "OWN" ? "SELF-WAGER" : "SYMMETRIC WAGER"}
                </Text>
                <View style={styles.row}>
                  {[...new Set([...stakes, stake])]
                    .sort((a, b) => a - b)
                    .map((amount) => (
                      <Pressable
                        key={amount}
                        onPress={() => setStake(amount)}
                        style={[
                          styles.chip,
                          stake === amount && styles.selected,
                        ]}
                      >
                        <Text style={styles.chipText}>◉ {amount}</Text>
                      </Pressable>
                    ))}
                </View>
                <Text style={styles.help}>
                  {mode === "OWN"
                    ? "Finish and your stake returns; miss it and it is forfeited."
                    : `You and ${friend} each put up the same stake. Declining has no penalty.`}
                </Text>
                <Pressable
                  disabled={!valid || Boolean(working)}
                  onPress={() => void submit()}
                  style={[
                    styles.primary,
                    (!valid || Boolean(working)) && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryText}>
                    {stake > balance
                      ? "NOT ENOUGH CREDIT"
                      : working === "send"
                        ? "SENDING TO PARTY…"
                        : mode === "OWN"
                          ? "CREATE TASK"
                          : "SEND CHALLENGE"}
                  </Text>
                </Pressable>
              </>
            ) : null}
            <Pressable onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>CLOSE</Text>
            </Pressable>
          </ScrollView>
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
    maxHeight: "92%",
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  kicker: {
    color: colors.brandDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  help: { color: colors.muted, lineHeight: 20, marginTop: spacing.sm },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mode: {
    alignItems: "center",
    borderColor: colors.outline,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  yellow: { backgroundColor: colors.warning, borderColor: colors.warning },
  red: { backgroundColor: colors.brandDeep, borderColor: colors.brandDeep },
  modeText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  light: { color: colors.inkInverse },
  label: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  chip: {
    alignItems: "center",
    borderColor: colors.brandDeep,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  selected: { backgroundColor: colors.brand },
  chipText: { color: colors.ink, fontWeight: "900" },
  input: {
    borderColor: colors.outline,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  grokBox: {
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  grokTitle: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  grokHelp: {
    color: colors.surface,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  grokButton: {
    alignItems: "center",
    borderColor: colors.brand,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 44,
  },
  grokButtonText: { color: colors.brand, fontSize: 11, fontWeight: "900" },
  grokResult: {
    color: colors.surface,
    fontSize: 12,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  mediaButton: {
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  mediaText: { color: colors.surface, fontSize: 10, fontWeight: "900" },
  image: {
    borderRadius: radii.sm,
    height: 180,
    marginTop: spacing.md,
    width: "100%",
  },
  error: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  primary: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  disabled: { opacity: 0.45 },
  primaryText: { color: colors.inkInverse, fontWeight: "900" },
  close: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  closeText: { color: colors.ink, fontWeight: "800" },
});
