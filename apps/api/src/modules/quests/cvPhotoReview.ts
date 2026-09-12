import type { PhotoReviewPort } from "@sidequest/quest-core";

export function createCvPhotoReview(options: {
  endpoint?: string;
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): PhotoReviewPort {
  const fetcher = options.fetcher ?? fetch;
  return {
    async inspectReference(mediaRef, prompt) {
      if (!options.endpoint || !options.apiKey)
        return {
          safe: true,
          recommendation: "REVIEW",
          code: "PHOTO_MANUAL_REVIEW",
        };
      try {
        const response = await fetcher(options.endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ mediaRef, expectedEvidence: prompt }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
        });
        if (!response.ok) throw new Error("CV unavailable");
        const body = (await response.json()) as {
          match?: boolean;
          confidence?: number;
        };
        if (
          typeof body.match !== "boolean" ||
          typeof body.confidence !== "number"
        )
          throw new Error("Invalid CV response");
        if (body.confidence < 0.72)
          return {
            safe: true,
            recommendation: "REVIEW",
            code: "PHOTO_LOW_CONFIDENCE",
          };
        return body.match
          ? {
              safe: true,
              recommendation: "MATCH",
              code: "PHOTO_MATCH_AWAITING_REVIEW",
            }
          : {
              safe: true,
              recommendation: "RETAKE",
              code: "PHOTO_RETAKE_SUGGESTED",
            };
      } catch {
        return {
          safe: true,
          recommendation: "REVIEW",
          code: "PHOTO_SERVICE_UNAVAILABLE",
        };
      }
    },
  };
}
