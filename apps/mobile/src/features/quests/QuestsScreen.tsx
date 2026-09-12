import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import type { Challenge, QuestInstance } from "@sidequest/contracts";
import { colors, radii } from "@sidequest/ui/theme";

import { DEMO_USERS, useDemoSession } from "../demo/DemoSession";
import { ScreenFrame } from "../shell/ScreenFrame";
import { AddTaskOverlay } from "./AddTaskOverlay";
import { demoQuests, type QuestItem } from "./demoData";
import { QuestDetailOverlay } from "./QuestDetailOverlay";
import { QuestRow } from "./QuestRow";

const person = (id: string) =>
  DEMO_USERS.find((user) => user.id === id)?.name ?? "Party member";

function toItem(challenge: Challenge, viewerId: string): QuestItem {
  const incoming = challenge.recipientUserId === viewerId;
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
    attention: incoming && challenge.status === "PENDING",
    direction: incoming ? "INCOMING" : "OUTGOING",
    escrowHeld: ["PENDING", "ACCEPTED"].includes(challenge.status),
    title: challenge.title,
    location: "Community mission",
    person: person(
      incoming ? challenge.issuerUserId : challenge.recipientUserId,
    ),
    description:
      `${challenge.description} ${challenge.lastNotice ?? ""}`.trim(),
    timeLeft: challenge.status === "PENDING" ? "24 hrs" : challenge.status,
    stake: challenge.stakeCoins,
    serverVersion: challenge.version,
    ...(challenge.questId ? { serverQuestId: challenge.questId } : {}),
  };
}

function photoTestItem(quest: QuestInstance): QuestItem {
  return {
    id: quest.id,
    serverQuestId: quest.id,
    serverVersion: quest.version,
    kind: "OWN",
    status: "ACTIVE",
    attention: true,
    direction: "SELF",
    escrowHeld: false,
    title: "PHOTO TEST · " + quest.title,
    location: "Anywhere safe",
    person: "You",
    description:
      "Upload a photo now. Grok checks whether it plausibly fits the evidence prompt; final review stays human-controlled.",
    timeLeft: "24 hrs",
    stake: 0,
  };
}

export function QuestsScreen() {
  const { request, user } = useDemoSession();
  const [localQuests, setLocalQuests] = useState<QuestItem[]>(demoQuests);
  const [sharedQuests, setSharedQuests] = useState<QuestItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [photoTest, setPhotoTest] = useState<QuestItem | null>(null);
  const [sync, setSync] = useState("Connecting…");
  const quests = useMemo(
    () => [...(photoTest ? [photoTest] : []), ...sharedQuests, ...localQuests],
    [localQuests, photoTest, sharedQuests],
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
        [...challengeResult.incoming, ...challengeResult.outgoing].map(
          (challenge) => toItem(challenge, user.id),
        ),
      );
      setBalance(economy.balance);
      setSync("Shared with your party · refreshes every 3 seconds");
    } catch (error) {
      setSync(error instanceof Error ? error.message : "API unavailable");
    }
  }, [request, user.id]);

  useEffect(() => {
    setSelectedId(null);
    void refresh();
    // Demo-only notification placeholder. Real PWA push belongs in a service
    // worker `push` handler; polling must never continue in a hidden tab.
    let timer: ReturnType<typeof setInterval> | null = null;
    const reconcile = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        if (timer) clearInterval(timer);
        timer = null;
        return;
      }
      void refresh();
      if (!timer) timer = setInterval(() => void refresh(), 3_000);
    };
    reconcile();
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", reconcile);
    return () => {
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", reconcile);
    };
  }, [refresh]);

  function close() {
    setSelectedId(null);
  }

  async function startPhotoTest() {
    const result = await request<{ quest: QuestInstance }>(
      "/v1/demo/photo-test",
      { method: "POST" },
    );
    const item = photoTestItem(result.quest);
    setPhotoTest(item);
    setSelectedId(item.id);
  }

  async function respond(accept: boolean) {
    if (!selected) return;
    if (!selected.serverVersion) {
      if (accept) {
        if (selected.stake > balance) return;
        setBalance((current) => current - selected.stake);
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

  async function cancel() {
    if (!selected?.serverVersion) return;
    await request(`/v1/challenges/${selected.id}/cancel`, {
      method: "POST",
      headers: { "idempotency-key": `cancel-${user.id}-${Date.now()}` },
      body: JSON.stringify({ expectedVersion: selected.serverVersion }),
    });
    close();
    await refresh();
  }

  function completeLocal() {
    if (!selected) return;
    if (selected.escrowHeld) setBalance((current) => current + selected.stake);
    setLocalQuests((current) =>
      current.map((quest) =>
        quest.id === selected.id ? { ...quest, status: "COMPLETE" } : quest,
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
    if (!selected) return;
    setLocalQuests((current) =>
      current.map((quest) =>
        quest.id === selected.id ? { ...quest, status: "FAILED" } : quest,
      ),
    );
    close();
  }

  async function create(quest: QuestItem) {
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
          deadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
          stakeCoins: quest.stake,
        }),
      });
      await refresh();
    } else {
      setBalance((current) => current - quest.stake);
      setLocalQuests((current) => [quest, ...current]);
    }
    setAdding(false);
  }

  return (
    <ScreenFrame
      eyebrow="HUMAN ACTION · GROK MISSION INTELLIGENCE"
      headerRight={
        <>
          <Pressable
            accessibilityLabel="Start photo verification test"
            accessibilityRole="button"
            onPress={() => void startPhotoTest()}
            style={styles.photoTest}
          >
            <Text style={styles.photoTestText}>📸 TEST</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Add a task or challenge a friend"
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            style={styles.add}
          >
            <Text style={styles.addText}>+</Text>
          </Pressable>
        </>
      }
      title="QUESTS"
    >
      <Text style={styles.balance}>YOUR CREDIT · ◉ {balance}</Text>
      <Text style={styles.sync}>{sync}</Text>
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
          onAccept={() => void respond(true)}
          onClose={close}
          onCancel={() => void cancel()}
          onComplete={() => void resolve(true)}
          onDecline={() => void respond(false)}
          onFail={() => void resolve(false)}
          onUploadPhoto={async (dataUrl) => {
            if (!selected.serverQuestId)
              throw new Error(
                "Accept this challenge before submitting evidence.",
              );
            const uploaded = await request<{ mediaRef: string }>(
              "/v1/media/photos",
              {
                method: "POST",
                body: JSON.stringify({ dataUrl }),
              },
            );
            await request(`/v1/quests/${selected.serverQuestId}/evidence`, {
              method: "POST",
              headers: {
                "idempotency-key": `photo-${selected.id}-${Date.now()}`,
              },
              body: JSON.stringify({
                expectedVersion: selected.serverVersion ?? 1,
                evidence: { photo: { mediaRef: uploaded.mediaRef } },
              }),
            });
            await refresh();
          }}
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
  photoTest: {
    alignItems: "center",
    borderColor: colors.brand,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 10,
  },
  photoTestText: { color: colors.brand, fontSize: 10, fontWeight: "900" },
  balance: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  sync: { color: colors.brand, fontSize: 10, marginTop: -6 },
});
