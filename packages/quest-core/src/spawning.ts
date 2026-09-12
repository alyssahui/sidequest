import type {
  QuestSuggestion,
  QuestTemplate,
  SpawnContext,
} from "@sidequest/contracts";
const BANNED = new Set([
  "dangerous",
  "illegal",
  "coercive",
  "sexual",
  "hateful",
  "humiliating",
  "trespassing",
  "substance-pressure",
  "extreme-exertion",
  "distracted-driving",
]);
export class QuestSuggestionService {
  constructor(
    private readonly maxActive = 3,
    private readonly maxSpawned = 4,
  ) {}
  suggest(
    context: SpawnContext,
    templates: QuestTemplate[],
    limit = 3,
  ): QuestSuggestion[] {
    if (
      context.activeCount >= this.maxActive ||
      context.spawnedCount >= this.maxSpawned
    )
      return [];
    const now = new Date(context.now);
    const hour = now.getUTCHours();
    return templates
      .flatMap((template) => {
        const r = template.spawnRules;
        if (
          template.safety.moderation !== "APPROVED" ||
          template.safety.flags.some((f) => BANNED.has(f))
        )
          return [];
        if (
          !r.areas.includes(context.area) ||
          r.minimumNearbyMembers > context.nearbyMemberCount
        )
          return [];
        if (
          r.social !== "either" &&
          context.socialPreference !== "either" &&
          r.social !== context.socialPreference
        )
          return [];
        if (
          r.allowedHours &&
          (hour < r.allowedHours.start || hour >= r.allowedHours.end)
        )
          return [];
        const latest = context.history
          .filter((h) => h.templateId === template.id)
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
        if (
          latest &&
          now.getTime() - new Date(latest.occurredAt).getTime() <
            r.cooldownHours * 3600000
        )
          return [];
        const tagMatches = template.tags.filter((t) =>
          context.preferenceTags.includes(t),
        ).length;
        const placeMatches = r.placeCategories.filter((p) =>
          context.placeCategories.includes(p),
        ).length;
        const socialBonus = r.social === context.socialPreference ? 3 : 1;
        const score = tagMatches * 10 + placeMatches * 5 + socialBonus;
        return score > 0
          ? [
              {
                template,
                score,
                reason: [
                  tagMatches && `${tagMatches} interests`,
                  placeMatches && "near a matching place",
                  r.minimumNearbyMembers && "friends nearby",
                ]
                  .filter(Boolean)
                  .join(" · "),
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          b.score - a.score || a.template.id.localeCompare(b.template.id),
      )
      .slice(0, limit);
  }
}
