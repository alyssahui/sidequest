export type Coordinates = { latitude: number; longitude: number };
export type QuestStatus = "SPAWNED" | "ACCEPTED" | "IN_PROGRESS" | "VERIFIED" | "FAILED" | "EXPIRED" | "DISMISSED";
export type VerificationRequirement =
  | { type: "GPS"; target: Coordinates; radiusMeters: number; maxAccuracyMeters: number }
  | { type: "PHOTO"; prompt: string }
  | { type: "TIME"; notBefore?: string; deadline: string };
export type QuestTemplate = { id: string; title: string; description: string; category: string; tags: string[]; risk: "low" | "medium"; moderation: "approved"; social: "solo" | "friends" | "either"; reward: number; requirements: VerificationRequirement[]; area: "CMU" | "PITTSBURGH"; cooldownHours: number };
export type QuestInstance = { id: string; templateId: string; ownerUserId: string; partyId?: string; participantIds: string[]; title: string; description: string; reward: number; requirements: VerificationRequirement[]; status: QuestStatus; createdAt: string; acceptedAt?: string; startedAt?: string; expiresAt: string; resolvedAt?: string; version: number; reason?: string };
export type Evidence = { gps?: { coordinates: Coordinates; accuracyMeters: number; capturedAt: string }; photo?: { mediaRef: string }; submittedAt: string };
export type VerificationAttempt = { id: string; questId: string; evidence: Evidence; checks: { type: VerificationRequirement["type"]; passed: boolean; reason: string }[]; decision: "VERIFIED" | "FAILED" | "PENDING_REVIEW"; createdAt: string };
export type SpawnContext = { userId: string; now: Date; area: QuestTemplate["area"]; tags: string[]; social: "solo" | "friends" | "either"; nearbyMemberCount: number; activeCount: number; completedTemplateIds: string[] };
