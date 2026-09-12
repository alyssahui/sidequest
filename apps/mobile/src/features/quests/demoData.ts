export type QuestKind = "OWN" | "CHALLENGE" | "SYSTEM";
export type QuestStatus = "PENDING" | "ACTIVE" | "COMPLETE" | "FAILED";
export type QuestDirection = "INCOMING" | "OUTGOING" | "SELF";

export type QuestItem = {
  id: string;
  kind: QuestKind;
  status: QuestStatus;
  attention: boolean;
  direction: QuestDirection;
  escrowHeld: boolean;
  title: string;
  location: string;
  person: string;
  creatorUserId: string;
  recipientUserId: string;
  creatorName: string;
  creatorAvatar: string;
  description: string;
  dueAt: string;
  stake: number;
  serverVersion?: number;
};

export const DEMO_QUEST_BALANCE = 420;

export const QUEST_ACTORS = [
  { id: "user-zuri", name: "Zuri", avatar: "Z" },
  { id: "user-ben", name: "Etash", avatar: "E" },
  { id: "user-alyssa", name: "Alyssa", avatar: "A" },
  { id: "sidequest", name: "SideQuest", avatar: "S" },
] as const;

export function actorFor(id: string) {
  return (
    QUEST_ACTORS.find((actor) => actor.id === id) ?? {
      id,
      name: "Party member",
      avatar: "?",
    }
  );
}

function dueIn(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

function record(
  item: Omit<
    QuestItem,
    "attention" | "direction" | "person" | "creatorName" | "creatorAvatar"
  > &
    Partial<
      Pick<
        QuestItem,
        "attention" | "direction" | "person" | "creatorName" | "creatorAvatar"
      >
    >,
): QuestItem {
  const creator = actorFor(item.creatorUserId);
  const recipient = actorFor(item.recipientUserId);
  return {
    attention: false,
    direction: "SELF",
    person: recipient.name,
    creatorName: creator.name,
    creatorAvatar: creator.avatar,
    ...item,
  };
}

export function projectQuestForViewer(
  quest: QuestItem,
  viewerId: string,
): QuestItem | null {
  const isCreator = quest.creatorUserId === viewerId;
  const isRecipient = quest.recipientUserId === viewerId;
  if (!isCreator && !isRecipient) return null;

  const direction: QuestDirection =
    isCreator && isRecipient
      ? "SELF"
      : isCreator
        ? "OUTGOING"
        : "INCOMING";
  const creator = actorFor(quest.creatorUserId);
  const counterparty = actorFor(
    direction === "OUTGOING" ? quest.recipientUserId : quest.creatorUserId,
  );
  const listed =
    direction === "OUTGOING" && quest.kind === "CHALLENGE"
      ? counterparty
      : {
          name: isCreator ? "You" : creator.name,
          avatar: creator.avatar,
        };
  return {
    ...quest,
    direction,
    attention: direction === "INCOMING" && quest.status === "PENDING",
    creatorName: listed.name,
    creatorAvatar: listed.avatar,
    person: direction === "SELF" ? "You" : counterparty.name,
  };
}

export function questsForViewer(quests: QuestItem[], viewerId: string) {
  const unique = new Map<string, QuestItem>();
  for (const quest of quests) unique.set(quest.id, quest);
  return [...unique.values()]
    .map((quest) => projectQuestForViewer(quest, viewerId))
    .filter((quest): quest is QuestItem => quest !== null);
}

export const demoQuests: QuestItem[] = [
  record({
    id: "own-wean",
    kind: "OWN",
    status: "ACTIVE",
    escrowHeld: false,
    title: "Scavenge in Wean 6",
    location: "Wean 6",
    creatorUserId: "user-zuri",
    recipientUserId: "user-zuri",
    description: "Find something you have never noticed in the hallway.",
    dueAt: dueIn(12 * 60 * 60_000 + 30 * 60_000),
    stake: 25,
  }),
  record({
    id: "own-library",
    kind: "OWN",
    status: "ACTIVE",
    escrowHeld: false,
    title: "Return library books",
    location: "Hunt Library",
    creatorUserId: "user-zuri",
    recipientUserId: "user-zuri",
    description: "Get the overdue stack off your desk today.",
    dueAt: dueIn(8 * 60 * 60_000 + 10 * 60_000),
    stake: 10,
  }),
  record({
    id: "own-ben-faucet",
    kind: "OWN",
    status: "ACTIVE",
    escrowHeld: false,
    title: "Fix one dripping faucet",
    location: "Home",
    creatorUserId: "user-ben",
    recipientUserId: "user-ben",
    description: "Stop one source of wasted water today.",
    dueAt: dueIn(10 * 60 * 60_000),
    stake: 20,
  }),
  record({
    id: "own-alyssa-kit",
    kind: "OWN",
    status: "ACTIVE",
    escrowHeld: false,
    title: "Pack a 72-hour kit",
    location: "Home",
    creatorUserId: "user-alyssa",
    recipientUserId: "user-alyssa",
    description: "Put water, light, and a first-aid kit by the door.",
    dueAt: dueIn(9 * 60 * 60_000),
    stake: 15,
  }),
  record({
    id: "challenge-ben",
    kind: "CHALLENGE",
    status: "PENDING",
    escrowHeld: false,
    title: "Teach a tiny thing",
    location: "Campus",
    creatorUserId: "user-ben",
    recipientUserId: "user-zuri",
    description: "Teach one tiny skill before tonight.",
    dueAt: dueIn(58 * 60_000),
    stake: 25,
  }),
  record({
    id: "system-pastry",
    kind: "SYSTEM",
    status: "PENDING",
    escrowHeld: false,
    title: "Try a pastry you have never eaten",
    location: "Near campus bakery",
    creatorUserId: "sidequest",
    recipientUserId: "user-zuri",
    description: "Spawned SideQuest.",
    dueAt: dueIn(41 * 60_000),
    stake: 30,
  }),
];
