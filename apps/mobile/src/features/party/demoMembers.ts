export type PartyMember = {
  id: string;
  name: string;
  avatar: string;
  status: string;
  credit: number;
  self: boolean;
  recent: string[];
  likes: string[];
  questStyle: "CHILL" | "BALANCED" | "UNHINGED";
  social: string;
};

export const demoMembers: PartyMember[] = [
  {
    id: "zuri",
    name: "Zuri",
    avatar: "Z",
    status: "On a quest",
    credit: 420,
    self: true,
    recent: ["7 AM Run", "Scavenge in Wean 6"],
    likes: ["Food", "Photography", "Hiking"],
    questStyle: "BALANCED",
    social: "Friends",
  },
  {
    id: "alyssa",
    name: "Alyssa",
    avatar: "A",
    status: "Near campus",
    credit: 365,
    self: false,
    recent: ["Korean BBQ night", "Campus kindness"],
    likes: ["Food", "Thrifting", "Weird stores"],
    questStyle: "UNHINGED",
    social: "Either",
  },
  {
    id: "ben",
    name: "Etash",
    avatar: "E",
    status: "Location paused",
    credit: 290,
    self: false,
    recent: ["Gym before 9 PM"],
    likes: ["Hiking", "Rock climbing"],
    questStyle: "CHILL",
    social: "Solo",
  },
];
