import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import type { Challenge } from "@sidequest/contracts";
import { colors, radii, spacing } from "@sidequest/ui/theme";

import { DEMO_USERS, useDemoSession } from "../demo/DemoSession";
import { ScreenFrame } from "../shell/ScreenFrame";
import { AddTaskOverlay } from "./AddTaskOverlay";
import {
  actorFor,
  demoQuests,
  questsForViewer,
  type QuestItem,
} from "./demoData";
import { useNow } from "./dueAt";
import { QuestDetailOverlay } from "./QuestDetailOverlay";
import { QuestRow } from "./QuestRow";

function toItem(challenge: Challenge): QuestItem {
  const issuer = actorFor(challenge.issuerUserId);
  const status =
    challenge.status === "PENDING"
      ? "PENDING"
      : challenge.status === "ACCEPTED"
        ? "ACTIVE"
        : challenge.status === "COMPLETED"
          ? "COMPLETE"
          : "FAILED";
  return {
    id: challenge.id,
    kind: "CHALLENGE",
    status,
    attention: false,
    direction: "INCOMING",
    escrowHeld: ["PENDING", "ACCEPTED"].includes(challenge.status),
    title: challenge.title,
    location: challenge.locationLabel?.trim() || "n/a",
    person: actorFor(challenge.recipientUserId).name,
    creatorUserId: challenge.issuerUserId,
    recipientUserId: challenge.recipientUserId,
    creatorName: issuer.name,
    creatorAvatar: issuer.avatar,
    description: challenge.description.trim(),
    dueAt: challenge.expiresAt,
    stake: challenge.stakeCoins,
    serverVersion: challenge.version,
  };
}

export function QuestsScreen() {
  const now = useNow();
  const { request, user } = useDemoSession();
  const [localQuests, setLocalQuests] = useState<QuestItem[]>(demoQuests);
  const [sharedQuests, setSharedQuests] = useState<QuestItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [sync, setSync] = useState("Connecting…");
  const localCreditDelta = useRef(0);
  const quests = useMemo(
    () => questsForViewer([...localQuests, ...sharedQuests], user.id),
    [localQuests, sharedQuests, user.id],
  );
  const activeQuests = useMemo(
    () => quests.filter((quest) => quest.direction !== "OUTGOING"),
    [quests],
  );
  const placedQuests = useMemo(
    () => quests.filter((quest) => quest.direction === "OUTGOING"),
    [quests],
  );
  const selected = quests.find((quest) => quest.id === selectedId);

  const refresh = useCallback(async () => {
    try {
      const [challengeResult, economy] = await Promise.all([
        request<{ incoming: Challenge[]; outgoing: Challenge[] }>(
          "/v1/challenges",
        ),
        request<{ balance: number }>("/v1/economy/me"),
      ]);
      setSharedQuests(
        [...challengeResult.incoming, ...challengeResult.outgoing].map(toItem),
      );
      setBalance(Math.max(0, economy.balance + localCreditDelta.current));
      setSync("Shared with your party · refreshes every 3 seconds");
    } catch (error) {
      setSync(error instanceof Error ? error.message : "API unavailable");
    }
  }, [request, user.id]);

  useEffect(() => {
    setSelectedId(null);
    localCreditDelta.current = 0;
    void refresh();
    const timer = setInterval(() => void refresh(), 3_000);
    return () => clearInterval(timer);
  }, [refresh]);

  function close() {
    setSelectedId(null);
  }

  async function respond(accept: boolean) {
    if (!selected) return;
    if (!selected.serverVersion) {
      if (accept) {
        if (selected.stake > balance) return;
        setLocalQuests((current) =>
          current.map((quest) =>
            quest.id === selected.id
              ? {
                  ...quest,
                  status: "ACTIVE",
                  attention: false,
                  escrowHeld: true,
                }
              : quest,
          ),
        );
      } else {
        setLocalQuests((current) =>
          current.filter((quest) => quest.id !== selected.id),
        );
      }
      close();
      return;
    }
    await request(`/v1/challenges/${selected.id}/respond`, {
      method: "POST",
      headers: { "idempotency-key": `respond-${user.id}-${Date.now()}` },
      body: JSON.stringify({ accept, expectedVersion: selected.serverVersion }),
    });
    close();
    await refresh();
  }

  function completeLocal() {
    if (
      !selected ||
      selected.status === "COMPLETE" ||
      selected.status === "FAILED"
    )
      return;
    setBalance((current) => current + selected.stake);
    localCreditDelta.current += selected.stake;
    setLocalQuests((current) =>
      current.map((quest) =>
        quest.id === selected.id
          ? { ...quest, status: "COMPLETE", attention: false }
          : quest,
      ),
    );
    close();
  }

  async function resolve(completed: boolean) {
    if (!selected?.serverVersion) {
      if (completed) completeLocal();
      else failLocal();
      return;
    }
    await request(`/v1/demo/challenges/${selected.id}/resolve`, {
      method: "POST",
      headers: { "idempotency-key": `resolve-${user.id}-${Date.now()}` },
      body: JSON.stringify({ completed }),
    });
    close();
    await refresh();
  }

  function failLocal() {
    if (
      !selected ||
      selected.status === "COMPLETE" ||
      selected.status === "FAILED"
    )
      return;
    setBalance((current) => Math.max(0, current - selected.stake));
    localCreditDelta.current -= selected.stake;
    setLocalQuests((current) =>
      current.map((quest) =>
        quest.id === selected.id
          ? { ...quest, status: "FAILED", attention: false }
          : quest,
      ),
    );
    close();
  }

  async function create(quest: QuestItem) {
    if (quest.stake > balance) return;
    if (quest.kind === "CHALLENGE") {
      const recipient = DEMO_USERS.find(
        (candidate) => candidate.name === quest.person,
      );
      if (!recipient) throw new Error("Choose a demo party member");
      await request<Challenge>("/v1/challenges/custom", {
        method: "POST",
        headers: { "idempotency-key": `challenge-${user.id}-${Date.now()}` },
        body: JSON.stringify({
          recipientUserId: recipient.id,
          partyId: "party-demo",
          task: quest.title,
          locationLabel: quest.location,
          notes: quest.description,
          deadline: quest.dueAt,
          stakeCoins: quest.stake,
        }),
      });
      await refresh();
    } else {
      setLocalQuests((current) => [quest, ...current]);
    }
    setAdding(false);
  }

  return (
    <ScreenFrame
      eyebrow="HUMAN ACTION · GROK MISSION INTELLIGENCE"
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
      <Text style={styles.sync}>{sync}</Text>
      {activeQuests.map((quest) => (
        <QuestRow
          key={quest.id}
          now={now}
          onPress={() => setSelectedId(quest.id)}
          quest={quest}
        />
      ))}
      <Text accessibilityRole="header" style={styles.placed}>
        Placed by you
      </Text>
      {placedQuests.length ? (
        placedQuests.map((quest) => (
          <QuestRow
            key={quest.id}
            now={now}
            onPress={() => setSelectedId(quest.id)}
            quest={quest}
          />
        ))
      ) : (
        <Text style={styles.placedEmpty}>
          Challenges you send to friends land here.
        </Text>
      )}
      {selected ? (
        <QuestDetailOverlay
          balance={balance}
          onAccept={() => void respond(true)}
          now={now}
          onClose={close}
          onComplete={() => void resolve(true)}
          onDecline={() => void respond(false)}
          onFail={() => void resolve(false)}
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
  sync: { color: colors.brand, fontSize: 10, marginTop: -6 },
  placed: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginTop: spacing.sm,
    textTransform: "uppercase",
  },
  placedEmpty: { color: colors.surface, fontSize: 13 },
});
