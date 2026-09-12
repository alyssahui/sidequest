export type ChallengeStatus =
  "PENDING" | "ACCEPTED" | "DECLINED" | "COMPLETED" | "FAILED" | "EXPIRED";
export type Challenge = {
  id: string;
  issuerUserId: string;
  recipientUserId: string;
  partyId: string;
  questTemplateId: string;
  stake: number;
  status: ChallengeStatus;
  expiresAt: string;
  questId?: string;
  version: number;
};
