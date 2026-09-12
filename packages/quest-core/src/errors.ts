export type QuestErrorCode =
  | "NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "INVALID_TRANSITION"
  | "EXPIRED"
  | "VERSION_CONFLICT"
  | "INVALID_EVIDENCE"
  | "PHOTO_REFERENCE_UNSAFE"
  | "PENDING_REVIEW"
  | "INVALID_CHALLENGE"
  | "INSUFFICIENT_BALANCE"
  | "SOCIAL_INTERACTION_BLOCKED"
  | "ACTIVE_CAP_REACHED"
  | "IDEMPOTENCY_CONFLICT";
export class QuestError extends Error {
  constructor(
    readonly code: QuestErrorCode,
    message = code,
  ) {
    super(message);
    this.name = "QuestError";
  }
}
