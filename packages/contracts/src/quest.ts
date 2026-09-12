export type QuestCoordinates = { latitude: number; longitude: number };
export type QuestStatus =
  | "SPAWNED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "VERIFIED"
  | "FAILED"
  | "EXPIRED"
  | "DISMISSED";
export type VerificationDecision = "VERIFIED" | "FAILED" | "PENDING_REVIEW";
export type QuestCategory =
  | "reconnect"
  | "learn-teach"
  | "mutual-aid"
  | "community-cleanup"
  | "accessible-exploration"
  | "wellness"
  | "support-local";
export type VerificationRequirement =
  | {
      type: "GPS";
      target: QuestCoordinates;
      radiusMeters: number;
      maxAccuracyMeters: number;
    }
  | { type: "PHOTO"; prompt: string; review: "MANUAL_OR_DEMO" }
  | { type: "TIME"; notBefore?: string; deadline: string };
export type SpawnRules = {
  areas: string[];
  placeCategories: string[];
  allowedHours?: { start: number; end: number };
  social: "solo" | "friends" | "either";
  minimumNearbyMembers: number;
  cooldownHours: number;
};
export type SafetyMetadata = {
  risk: "LOW" | "MODERATE";
  minimumAge?: number;
  abilityNotes?: string;
  moderation: "APPROVED" | "REJECTED";
  flags: readonly string[];
};
export type QuestTemplate = {
  id: string;
  title: string;
  description: string;
  category: QuestCategory;
  tags: string[];
  safety: SafetyMetadata;
  spawnRules: SpawnRules;
  defaultRequirements: VerificationRequirement[];
  rewardRange: { min: number; max: number };
  version: number;
};
export type QuestBriefing = {
  explanation: string;
  objective: string;
  timeLabel: string;
  locationLabel: string;
  notes: string[];
};
export type QuestSource = {
  type: "SPAWN" | "CHALLENGE" | "WANT_NEED";
  sourceId?: string;
};
export type QuestInstance = {
  id: string;
  templateId: string;
  ownerUserId: string;
  partyId?: string;
  participantIds: string[];
  title: string;
  description: string;
  briefing: QuestBriefing;
  rewardCoins: number;
  requirements: VerificationRequirement[];
  source: QuestSource;
  status: QuestStatus;
  reasonForYou?: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  startedAt?: string;
  resolvedAt?: string;
  resolutionReason?: string;
  version: number;
};
export type GpsEvidence = {
  coordinates: QuestCoordinates;
  accuracyMeters: number;
  capturedAt: string;
  source: "device" | "demo";
  sessionId?: string;
};
export type PhotoEvidence = { mediaRef: string };
export type EvidenceSubmission = { gps?: GpsEvidence; photo?: PhotoEvidence };
export type VerificationCheck = {
  type: VerificationRequirement["type"];
  decision: VerificationDecision;
  code: string;
};
export type VerificationAttempt = {
  id: string;
  questId: string;
  submittedByUserId: string;
  submittedAt: string;
  evidence: EvidenceSubmission;
  checks: VerificationCheck[];
  decision: VerificationDecision;
  reasonCode: string;
  reviewer?: {
    type: "DEMO" | "MANUAL";
    reviewerId?: string;
    reviewedAt: string;
  };
  providerMetadata?: Record<string, string>;
};
export type WantNeedItem = {
  id: string;
  ownerUserId: string;
  kind: "WANT" | "NEED";
  text: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  convertedQuestId?: string;
  version: number;
};
export type QuestHistoryEntry = {
  templateId: string;
  status: QuestStatus;
  occurredAt: string;
};
export type SpawnContext = {
  userId: string;
  now: string;
  area: string;
  placeCategories: string[];
  preferenceTags: string[];
  socialPreference: "solo" | "friends" | "either";
  nearbyMemberCount: number;
  activeCount: number;
  spawnedCount: number;
  history: QuestHistoryEntry[];
};
export type QuestSuggestion = {
  template: QuestTemplate;
  score: number;
  reason: string;
};
export type ImpactSummary = {
  completedActions: number;
  categories: Partial<Record<QuestCategory, number>>;
};
export interface QuestGpsEvidenceService {
  evaluate(input: {
    /**
     * The reading the client submitted.
     *
     * An implementation backed by server-stored evidence should prefer its own
     * record and treat this as a fallback — a client can claim any position.
     */
    evidence: GpsEvidence;
    target: QuestCoordinates;
    radiusMeters: number;
    maxAccuracyMeters: number;
    serverNow: string;
    /** Who is claiming arrival. Optional so simple implementations can ignore it. */
    userId?: string;
    /** Which quest the claim is for. */
    questInstanceId?: string;
  }): Promise<{ accepted: boolean; code: string; distanceMeters?: number }>;
}
