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
  stakeCoins: number;
  status: ChallengeStatus;
  createdAt: string;
  expiresAt: string;
  questId?: string;
  resolvedAt?: string;
  version: number;
};
export interface SocialSafetyPort {
  canInteract(
    issuerUserId: string,
    recipientUserId: string,
  ): Promise<{ allowed: boolean; code?: "BLOCKED" | "MUTED" }>;
}
