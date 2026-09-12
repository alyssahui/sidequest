import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radii, spacing } from "@sidequest/ui/theme";

import { ScreenFrame } from "../shell/ScreenFrame";
import { AddTaskOverlay } from "./AddTaskOverlay";
import { DEMO_QUEST_BALANCE, demoQuests, type QuestItem } from "./demoData";
import { QuestDetailOverlay } from "./QuestDetailOverlay";
import { QuestRow } from "./QuestRow";

export function QuestsScreen() {
  const [quests, setQuests] = useState<QuestItem[]>(demoQuests);
  const [balance, setBalance] = useState(DEMO_QUEST_BALANCE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const selected = quests.find((quest) => quest.id === selectedId);

  function close() {
    setSelectedId(null);
  }

  function accept() {
    if (!selected || selected.stake > balance) return;
    setBalance((current) => current - selected.stake);
    setQuests((current) =>
      current.map((quest) =>
        quest.id === selected.id
          ? {
              ...quest,
              attention: false,
              status: "ACTIVE",
              escrowHeld: true,
            }
          : quest,
      ),
    );
    close();
  }

  function decline() {
    if (!selected) return;
    setQuests((current) => current.filter((quest) => quest.id !== selected.id));
    close();
  }

  function complete() {
    if (!selected) return;
    if (selected.escrowHeld) {
      const payout =
        selected.kind === "OWN" ? selected.stake : selected.stake * 2;
      setBalance((current) => current + payout);
    }
    setQuests((current) =>
      current.map((quest) =>
        quest.id === selected.id
          ? { ...quest, status: "COMPLETE", attention: false }
          : quest,
      ),
    );
    close();
  }

  function fail() {
    if (!selected) return;
    setQuests((current) =>
      current.map((quest) =>
        quest.id === selected.id
          ? { ...quest, status: "FAILED", attention: false }
          : quest,
      ),
    );
    close();
  }

  function create(quest: QuestItem) {
    if (quest.stake > balance) return;
    setBalance((current) => current - quest.stake);
    setQuests((current) => [quest, ...current]);
    setAdding(false);
  }

  return (
    <ScreenFrame
      eyebrow="YOUR ADVENTURES"
      headerRight={
        <Pressable
          accessibilityLabel="Add a task or challenge a friend"
          accessibilityRole="button"
          onPress={() => setAdding(true)}
          style={styles.add}
        >
          <Text style={styles.addText}>+</Text>
        </Pressable>
      }
      title="QUESTS"
    >
      <Text style={styles.balance}>YOUR CREDIT · ◉ {balance}</Text>
      {quests.map((quest) => (
        <QuestRow
          key={quest.id}
          onPress={() => setSelectedId(quest.id)}
          quest={quest}
        />
      ))}
      {selected ? (
        <QuestDetailOverlay
          balance={balance}
          onAccept={accept}
          onClose={close}
          onComplete={complete}
          onDecline={decline}
          onFail={fail}
          quest={selected}
        />
      ) : null}
      {adding ? (
        <AddTaskOverlay
          balance={balance}
          onClose={() => setAdding(false)}
          onCreate={create}
        />
      ) : null}
    </ScreenFrame>
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
  balance: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
