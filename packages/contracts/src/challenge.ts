export type ChallengeStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";
export type Challenge = {
  id: string;
  issuerUserId: string;
  recipientUserId: string;
  partyId: string;
  questTemplateId: string;
  title: string;
  description: string;
  category: import("./quest").QuestCategory;
  explanation: string;
  stakeCoins: number;
  status: ChallengeStatus;
  createdAt: string;
  expiresAt: string;
  questId?: string;
  resolvedAt?: string;
  progressPercent: number;
  lastNotice?: string;
  locationLabel?: string;
  version: number;
};
export type ChallengeDraft = {
  recipientUserId: string;
  partyId: string;
  task: string;
  locationLabel?: string;
  notes?: string;
  deadline: string;
  /** Optional AI-assessed stake used by the interactive demo. */
  stakeCoins?: number;
};
export type ChallengeAssessment = {
  title: string;
  description: string;
  category: import("./quest").QuestCategory;
  tags: string[];
  explanation: string;
  suggestedStakeCoins: number;
  requirements: import("./quest").VerificationRequirement[];
  safety: { accepted: boolean; reason: string };
};
export interface SocialSafetyPort {
  canInteract(
    issuerUserId: string,
    recipientUserId: string,
  ): Promise<{ allowed: boolean; code?: "BLOCKED" | "MUTED" }>;
}
