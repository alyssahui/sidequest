export type QuestStyle = "CHILL" | "BALANCED" | "UNHINGED";

export type PreferenceState = {
  questStyle: QuestStyle;
  likes: string[];
};

export const ACTIVITY_OPTIONS = [
  "Food",
  "Hiking",
  "Photography",
  "Thrifting",
  "Weird stores",
  "Rock climbing",
  "Bakeries",
  "Coffee crawls",
  "Live music",
  "Museums",
  "Volunteering",
  "Study sessions",
  "Gym",
  "Board games",
  "Nightlife",
  "Cooking",
  "Art",
  "Sports",
  "Nature walks",
  "Karaoke",
  "Pottery",
  "Running",
  "Picnics",
  "Thrift flips",
  "Campus events",
  "Late-night snacks",
] as const;

const initial: PreferenceState = {
  questStyle: "BALANCED",
  likes: ["Food", "Photography", "Weird stores", "Hiking"],
};

let current: PreferenceState = {
  questStyle: initial.questStyle,
  likes: [...initial.likes],
};

export function getPreferences(): PreferenceState {
  return {
    questStyle: current.questStyle,
    likes: [...current.likes],
  };
}

export function savePreferences(next: PreferenceState) {
  current = {
    questStyle: next.questStyle,
    likes: [...next.likes],
  };
}
