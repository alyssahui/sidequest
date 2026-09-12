import type {
  ChallengeAssessment,
  ChallengeDraft,
  QuestBriefing,
  QuestCategory,
  QuestTemplate,
  VerificationRequirement,
} from "@sidequest/contracts";

const unsafe =
  /\b(kill|weapon|steal|trespass|naked|drug|alcohol pressure|drive while|humiliat|hate)\b/i;
const categories: { category: QuestCategory; match: RegExp; tags: string[] }[] =
  [
    {
      category: "community-cleanup",
      match: /clean|trash|litter|recycle/i,
      tags: ["community", "outdoors"],
    },
    {
      category: "reconnect",
      match: /friend|call|message|reconnect|family/i,
      tags: ["friends", "kindness"],
    },
    {
      category: "learn-teach",
      match: /learn|teach|study|read|book|class/i,
      tags: ["learning"],
    },
    {
      category: "mutual-aid",
      match: /help|donate|volunteer|support/i,
      tags: ["community", "kindness"],
    },
    {
      category: "wellness",
      match: /walk|run|rest|gym|outside|wellness/i,
      tags: ["wellness"],
    },
    {
      category: "support-local",
      match: /shop|cafe|restaurant|local|food/i,
      tags: ["local"],
    },
  ];
const categoryLabel = (category: QuestCategory) =>
  category.replaceAll("-", " ");

export class QuestContentService {
  briefing(
    template: QuestTemplate,
    expiresAt: string,
    locationLabel?: string,
    sourceNote?: string,
  ): QuestBriefing {
    const category = categoryLabel(template.category);
    return {
      explanation: `⚡ This ${category} mission turns “${template.title}” into a clear, verifiable win. Complete it your way, stay safe, and skip it without penalty if the moment is not right.`,
      objective: template.description,
      timeLabel: `Finish before ${new Date(expiresAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET`,
      locationLabel:
        locationLabel ??
        (template.spawnRules.areas.length
          ? template.spawnRules.areas.join(" / ")
          : "Anywhere appropriate and public"),
      notes: [
        sourceNote,
        template.safety.abilityNotes,
        "Use only the listed evidence; never include private documents or messages.",
      ].filter((value): value is string => Boolean(value)),
    };
  }

  assessChallenge(draft: ChallengeDraft): ChallengeAssessment {
    const task = draft.task.trim().replace(/\s+/g, " ");
    const deadlineMs = new Date(draft.deadline).getTime();
    const deadlineValid =
      Number.isFinite(deadlineMs) && deadlineMs > Date.now();
    const unsafeTask =
      task.length < 4 ||
      task.length > 180 ||
      unsafe.test(task) ||
      !deadlineValid;
    const matched = categories.find((entry) => entry.match.test(task));
    const category = matched?.category ?? "learn-teach";
    const hours = deadlineValid
      ? Math.max(1, (deadlineMs - Date.now()) / 3_600_000)
      : 24;
    const effort = Math.min(4, Math.max(1, Math.ceil(task.length / 45)));
    const urgency = hours <= 2 ? 2 : hours <= 24 ? 1 : 0;
    const locationBonus = draft.locationLabel?.trim() ? 1 : 0;
    const suggestedStakeCoins = Math.min(
      100,
      10 + effort * 5 + urgency * 5 + locationBonus * 5,
    );
    const requirements: VerificationRequirement[] = [
      {
        type: "PHOTO",
        prompt: `Show safe proof that you completed: ${task}`,
        review: "MANUAL_OR_DEMO",
      },
      { type: "TIME", deadline: draft.deadline },
    ];
    return {
      title: task.length > 56 ? `${task.slice(0, 53)}…` : task,
      description: `${task}${draft.locationLabel ? ` at ${draft.locationLabel}` : ""}.${draft.notes?.trim() ? ` Field note: ${draft.notes.trim()}` : ""}`,
      category,
      tags: matched?.tags ?? ["challenge"],
      explanation: `🔥 Challenge calibrated! This reads as a ${categoryLabel(category)} quest. The ${suggestedStakeCoins}-coin barter reflects the task detail, deadline pressure, and location commitment—both players stake the same amount.`,
      suggestedStakeCoins,
      requirements,
      safety: {
        accepted: !unsafeTask,
        reason: unsafeTask
          ? "Task or deadline is invalid, unsafe, too short, or too detailed."
          : "Curated safety checks passed.",
      },
    };
  }
}
