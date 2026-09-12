import type { PhotoReviewPort } from "@sidequest/quest-core";

export function createCvPhotoReview(options: {
  endpoint?: string;
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  resolveMedia?: (mediaRef: string) => string | undefined;
  grokApiKey?: string;
  grokModel?: string;
}): PhotoReviewPort {
  const fetcher = options.fetcher ?? fetch;
  return {
    async inspectReference(mediaRef, prompt) {
      const imageData = options.resolveMedia?.(mediaRef);
      if (!options.endpoint && options.grokApiKey && imageData) {
        try {
          const response = await fetcher(
            "https://api.x.ai/v1/chat/completions",
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${options.grokApiKey}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: options.grokModel ?? "grok-4.6",
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a cautious photo-verification assistant. Return JSON only.",
                  },
                  {
                    role: "user",
                    content: [
                      {
                        type: "image_url",
                        image_url: { url: imageData, detail: "low" },
                      },
                      {
                        type: "text",
                        text: `Does this image plausibly show the required evidence? Requirement: ${prompt ?? "a safe quest completion photo"}. Return {\"match\":boolean,\"confidence\":number}. Do not identify people or make a final approval decision.`,
                      },
                    ],
                  },
                ],
                response_format: { type: "json_object" },
              }),
              signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
            },
          );
          if (!response.ok) throw new Error("Grok vision unavailable");
          const body = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const result = JSON.parse(
            body.choices?.[0]?.message?.content ?? "",
          ) as { match?: boolean; confidence?: number };
          if (
            typeof result.match !== "boolean" ||
            typeof result.confidence !== "number"
          )
            throw new Error("Invalid Grok vision result");
          if (result.confidence < 0.72)
            return {
              safe: true,
              recommendation: "REVIEW",
              code: "GROK_PHOTO_LOW_CONFIDENCE",
            };
          return result.match
            ? {
                safe: true,
                recommendation: "MATCH",
                code: "GROK_PHOTO_MATCH_AWAITING_REVIEW",
              }
            : {
                safe: true,
                recommendation: "RETAKE",
                code: "GROK_PHOTO_RETAKE_SUGGESTED",
              };
        } catch {
          return {
            safe: true,
            recommendation: "REVIEW",
            code: "GROK_PHOTO_SERVICE_UNAVAILABLE",
          };
        }
      }
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
          body: JSON.stringify({
            mediaRef,
            imageData,
            expectedEvidence: prompt,
          }),
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
