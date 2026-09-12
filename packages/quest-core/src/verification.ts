import type {
  Clock,
  QuestGpsEvidenceService,
  IdGenerator,
  VerificationAttempt,
  VerificationCheck,
  VerificationRequirement,
  EvidenceSubmission,
} from "@sidequest/contracts";
import { QuestError } from "./errors";
export interface PhotoReviewPort {
  inspectReference(
    mediaRef: string,
  ): Promise<{ safe: boolean; accepted?: boolean }>;
}
export class VerificationRegistry {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly gps: QuestGpsEvidenceService,
    private readonly photos: PhotoReviewPort,
  ) {}
  async evaluate(
    questId: string,
    userId: string,
    requirements: VerificationRequirement[],
    evidence: EvidenceSubmission,
  ): Promise<VerificationAttempt> {
    const now = this.clock.now().toISOString();
    const checks: VerificationCheck[] = [];
    for (const requirement of requirements) {
      if (requirement.type === "TIME") {
        const before = now <= requirement.deadline;
        const after = !requirement.notBefore || now >= requirement.notBefore;
        checks.push({
          type: "TIME",
          decision: before && after ? "VERIFIED" : "FAILED",
          code: !after ? "TOO_EARLY" : before ? "TIME_OK" : "DEADLINE_PASSED",
        });
        continue;
      }
      if (requirement.type === "GPS") {
        if (!evidence.gps) throw new QuestError("INVALID_EVIDENCE");
        const result = await this.gps.evaluate({
          evidence: evidence.gps,
          target: requirement.target,
          radiusMeters: requirement.radiusMeters,
          maxAccuracyMeters: requirement.maxAccuracyMeters,
          serverNow: now,
          userId,
          questInstanceId: questId,
        });
        checks.push({
          type: "GPS",
          decision: result.accepted ? "VERIFIED" : "FAILED",
          code: result.code,
        });
        continue;
      }
      if (!evidence.photo) throw new QuestError("INVALID_EVIDENCE");
      if (!/^media:\/\/[a-zA-Z0-9/_-]{1,180}$/.test(evidence.photo.mediaRef))
        throw new QuestError("PHOTO_REFERENCE_UNSAFE");
      const review = await this.photos.inspectReference(
        evidence.photo.mediaRef,
      );
      if (!review.safe) throw new QuestError("PHOTO_REFERENCE_UNSAFE");
      checks.push({
        type: "PHOTO",
        decision:
          review.accepted === true
            ? "VERIFIED"
            : review.accepted === false
              ? "FAILED"
              : "PENDING_REVIEW",
        code:
          review.accepted === true
            ? "PHOTO_DEMO_ACCEPTED"
            : review.accepted === false
              ? "PHOTO_REJECTED"
              : "PHOTO_REVIEW_REQUIRED",
      });
    }
    const decision = checks.some((c) => c.decision === "FAILED")
      ? "FAILED"
      : checks.some((c) => c.decision === "PENDING_REVIEW")
        ? "PENDING_REVIEW"
        : "VERIFIED";
    return {
      id: this.ids.next(),
      questId,
      submittedByUserId: userId,
      submittedAt: now,
      evidence: structuredClone(evidence),
      checks,
      decision,
      reasonCode:
        decision === "VERIFIED"
          ? "ALL_REQUIREMENTS_MET"
          : decision === "FAILED"
            ? "REQUIREMENT_FAILED"
            : "AWAITING_PHOTO_REVIEW",
    };
  }
}
export class DeterministicGpsEvidenceService implements QuestGpsEvidenceService {
  async evaluate({
    evidence,
    target,
    radiusMeters,
    maxAccuracyMeters,
    serverNow,
  }: Parameters<QuestGpsEvidenceService["evaluate"]>[0]) {
    if (
      evidence.accuracyMeters < 0 ||
      evidence.accuracyMeters > maxAccuracyMeters
    )
      return { accepted: false, code: "GPS_INACCURATE" };
    const age =
      new Date(serverNow).getTime() - new Date(evidence.capturedAt).getTime();
    if (!Number.isFinite(age) || age < -30_000 || age > 5 * 60_000)
      return { accepted: false, code: "GPS_STALE" };
    const d = distance(evidence.coordinates, target);
    return {
      accepted: d <= radiusMeters,
      code: d <= radiusMeters ? "GPS_OK" : "GPS_OUTSIDE_RADIUS",
      distanceMeters: Math.round(d),
    };
  }
}
export class DemoPhotoReview implements PhotoReviewPort {
  async inspectReference(ref: string) {
    return {
      safe: true,
      accepted: ref.startsWith("media://demo/") ? true : undefined,
    };
  }
}
function distance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const p = Math.PI / 180;
  const x =
    (b.longitude - a.longitude) *
    p *
    Math.cos(((a.latitude + b.latitude) * p) / 2);
  const y = (b.latitude - a.latitude) * p;
  return Math.sqrt(x * x + y * y) * 6371000;
}
