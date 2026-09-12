import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";
import { ScreenFrame } from "../shell/ScreenFrame";
import { ChallengeCard } from "../challenges/ChallengeCard";
import {
  demoActive,
  demoChallenges,
  demoItems,
  demoNearby,
  type QuestSection,
} from "./demoData";
import { QuestStatePanel, type QuestViewState } from "./QuestStatePanel";
import { SpawnReveal } from "./SpawnReveal";
const sections: QuestSection[] = ["ACTIVE", "NEARBY", "CHALLENGES", "MY LIST"];
export function QuestsScreen() {
  const [section, setSection] = useState<QuestSection>("ACTIVE");
  const [state, setState] = useState<QuestViewState>("ready");
  const [reveal, setReveal] = useState<string>();
  const [items, setItems] = useState<
    { id: string; kind: "WANT" | "NEED"; text: string }[]
  >(demoItems.map((x) => ({ ...x })));
  const [draft, setDraft] = useState("");
  return (
    <ScreenFrame eyebrow="YOUR ADVENTURES · DEMO MODE" title="QUESTS">
      <View accessibilityRole="tablist" style={styles.tabs}>
        {sections.map((s) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: section === s }}
            key={s}
            onPress={() => {
              setSection(s);
              setState("ready");
            }}
            style={[styles.tab, section === s && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, section === s && styles.tabTextActive]}
            >
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
      <QuestStatePanel state={state} onAction={() => setState("ready")} />
      {state === "ready" && section === "ACTIVE" ? (
        <Active onVerify={() => setState("complete")} />
      ) : null}
      {state === "ready" && section === "NEARBY" ? (
        <>
          {reveal ? (
            <SpawnReveal
              title={demoNearby.find((q) => q.id === reveal)?.title ?? "Quest"}
              reason={
                demoNearby.find((q) => q.id === reveal)?.reason ?? "For you"
              }
              onAccept={() => {
                setReveal(undefined);
                setSection("ACTIVE");
              }}
              onDismiss={() => setReveal(undefined)}
            />
          ) : (
            demoNearby.map((q) => (
              <HudCard
                accessibilityLabel={`Nearby quest: ${q.title}`}
                key={q.id}
              >
                <Text style={styles.title}>{q.title}</Text>
                <Text style={styles.meta}>{q.meta}</Text>
                <Text style={styles.note}>{q.reason}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReveal(q.id)}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>REVEAL QUEST</Text>
                </Pressable>
              </HudCard>
            ))
          )}
        </>
      ) : null}
      {state === "ready" && section === "CHALLENGES"
        ? demoChallenges.map((c) => (
            <ChallengeCard
              key={c.id}
              {...c}
              onAccept={() => setSection("ACTIVE")}
              onDecline={() => setState("empty")}
            />
          ))
        : null}
      {state === "ready" && section === "MY LIST" ? (
        <>
          <HudCard accessibilityLabel="Add a want or need">
            <Text style={styles.title}>Questify your list</Text>
            <TextInput
              accessibilityLabel="New want or need"
              onChangeText={setDraft}
              placeholder="Something I want or need to do"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={draft}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (draft.trim()) {
                  setItems((x) => [
                    ...x,
                    {
                      id: `local-${x.length}`,
                      kind: "WANT",
                      text: draft.trim(),
                    },
                  ]);
                  setDraft("");
                }
              }}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>ADD ITEM</Text>
            </Pressable>
          </HudCard>
          {items.map((item) => (
            <HudCard key={item.id}>
              <StatusPill label={item.kind} />
              <Text style={styles.title}>{item.text}</Text>
              <View style={styles.itemActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReveal("cmu-teach")}
                  style={styles.small}
                >
                  <Text style={styles.smallText}>TURN INTO QUEST</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Remove ${item.text}`}
                  accessibilityRole="button"
                  onPress={() =>
                    setItems((x) => x.filter((i) => i.id !== item.id))
                  }
                  style={styles.small}
                >
                  <Text style={styles.smallText}>REMOVE</Text>
                </Pressable>
              </View>
            </HudCard>
          ))}
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => setState("offline")}
        style={styles.demo}
      >
        <Text style={styles.demoText}>PREVIEW OFFLINE STATE</Text>
      </Pressable>
    </ScreenFrame>
  );
}
function Active({ onVerify }: { onVerify: () => void }) {
  return (
    <HudCard accessibilityLabel={`Active quest: ${demoActive.title}`}>
      <View style={styles.row}>
        <StatusPill label="IN PROGRESS" />
        <CoinAmount amount={demoActive.reward} />
      </View>
      <Text style={styles.title}>{demoActive.title}</Text>
      <Text style={styles.meta}>
        {demoActive.deadline} · {demoActive.participants}
      </Text>
      <View style={styles.steps}>
        {demoActive.steps.map((step, i) => (
          <Text key={step} style={styles.note}>
            {i + 1}. {step}
          </Text>
        ))}
      </View>
      <Text style={styles.privacy}>
        GPS is checked only for this active quest. Photos require review and
        should not contain private documents.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onVerify}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>SIMULATE GPS + TIME</Text>
      </Pressable>
    </HudCard>
  );
}
const styles = StyleSheet.create({
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
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  meta: { color: colors.ink, marginTop: spacing.sm },
  note: { color: colors.muted, lineHeight: 21, marginTop: spacing.sm },
  privacy: {
    color: colors.brandDeep,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  steps: { marginTop: spacing.sm },
  primary: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  primaryText: { color: colors.inkInverse, fontWeight: "900" },
  input: {
    borderColor: colors.outline,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  itemActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  small: {
    alignItems: "center",
    borderColor: colors.brandDeep,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  smallText: { color: colors.brandDeep, fontSize: 11, fontWeight: "900" },
  demo: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  demoText: { color: colors.brand, fontSize: 11, fontWeight: "800" },
});
