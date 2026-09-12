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
  description: string;
  timeLeft: string;
  stake: number;
};

export const DEMO_QUEST_BALANCE = 420;

export const demoQuests: QuestItem[] = [
  {
    id: "own-wean",
    kind: "OWN",
    status: "ACTIVE",
    attention: false,
    direction: "SELF",
    escrowHeld: false,
    title: "Scavenge in Wean 6",
    location: "Wean 6",
    person: "You",
    description: "Find something you have never noticed in the hallway.",
    timeLeft: "12 hrs 30 mins",
    stake: 25,
  },
  {
    id: "own-library",
    kind: "OWN",
    status: "ACTIVE",
    attention: false,
    direction: "SELF",
    escrowHeld: false,
    title: "Return library books",
    location: "Hunt Library",
    person: "You",
    description: "Get the overdue stack off your desk today.",
    timeLeft: "8 hrs 10 mins",
    stake: 10,
  },
  {
    id: "challenge-ben",
    kind: "CHALLENGE",
    status: "PENDING",
    attention: true,
    direction: "INCOMING",
    escrowHeld: false,
    title: "Teach a tiny thing",
    location: "Campus",
    person: "Ben",
    description: "Ben challenged you to teach one tiny skill before tonight.",
    timeLeft: "58 min",
    stake: 25,
  },
  {
    id: "system-pastry",
    kind: "SYSTEM",
    status: "PENDING",
    attention: true,
    direction: "INCOMING",
    escrowHeld: false,
    title: "Try a pastry you have never eaten",
    location: "Near campus bakery",
    person: "SideQuest",
    description: "A spawned SideQuest. Accept only if it fits your day.",
    timeLeft: "41 min",
    stake: 30,
  },
];
