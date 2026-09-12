import type { ChallengeAssessment, ChallengeDraft } from "@sidequest/contracts";

export type GrokSource = "grok" | "deterministic-fallback";

export type GrokQuestDesign = {
  title: string;
  description: string;
  impact: string;
  verificationPlan: string;
  suggestedStakeCoins: number;
  source: GrokSource;
  model: string;
};

export type CrowdForecast = {
  completePercent: number;
  rationale: string;
  source: GrokSource;
  model: string;
};

const clampStake = (value: number) =>
  Math.max(5, Math.min(250, Math.round(value / 5) * 5));

export class GrokService {
  readonly model = process.env.XAI_TEXT_MODEL ?? "grok-4.20-reasoning-latest";

  get enabled() {
    return Boolean(process.env.XAI_API_KEY);
  }

  async designQuest(
    draft: ChallengeDraft,
    baseline: ChallengeAssessment,
  ): Promise<GrokQuestDesign> {
    const fallback: GrokQuestDesign = {
      title: baseline.title,
      description: baseline.description,
      impact: `Turns a ${baseline.category} goal into a small action that can be completed and verified today.`,
      verificationPlan: baseline.requirements
        .map((requirement) => requirement.type)
        .join(" + "),
      suggestedStakeCoins: baseline.suggestedStakeCoins,
      source: "deterministic-fallback",
      model: this.model,
    };
    if (!this.enabled) return fallback;

    try {
      const result = await this.structured<GrokQuestDesign>(
        "sidequest_design",
        {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "description",
            "impact",
            "verificationPlan",
            "suggestedStakeCoins",
          ],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            impact: { type: "string" },
            verificationPlan: { type: "string" },
            suggestedStakeCoins: { type: "integer", minimum: 5, maximum: 250 },
          },
        },
        `Design one safe, concrete, locally achievable quest from this request: ${JSON.stringify(draft)}. The quest must address education, sustainability, public health, accessibility, or community resilience. Price the virtual-credit stake by effort, time, social friction, and verifiability. Never require dangerous, illegal, invasive, or humiliating behavior. Keep title under 55 characters and each prose field under 180 characters.`,
      );
      return {
        ...result,
        suggestedStakeCoins: clampStake(result.suggestedStakeCoins),
        source: "grok",
        model: this.model,
      };
    } catch {
      return fallback;
    }
  }

  async forecastCrowd(prompt: string): Promise<CrowdForecast> {
    const fallback: CrowdForecast = {
      completePercent: 62,
      rationale:
        "Demo crowd weighs task difficulty, deadline, and normal follow-through rates.",
      source: "deterministic-fallback",
      model: this.model,
    };
    if (!this.enabled) return fallback;
    try {
      const result = await this.structured<{
        completePercent: number;
        rationale: string;
      }>(
        "crowd_forecast",
        {
          type: "object",
          additionalProperties: false,
          required: ["completePercent", "rationale"],
          properties: {
            completePercent: { type: "integer", minimum: 15, maximum: 85 },
            rationale: { type: "string" },
          },
        },
        `Estimate how a diverse synthetic crowd would predict this play-money quest market: ${JSON.stringify(prompt)}. Return a calibrated COMPLETE percentage and one short rationale. Do not claim real survey data.`,
      );
      return { ...result, source: "grok", model: this.model };
    } catch {
      return fallback;
    }
  }

  async createImage(prompt: string): Promise<{ url: string; model: string }> {
    const model = process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image-2.0";
    const response = await this.call("/images/generations", {
      model,
      aspect_ratio: "16:9",
      quality: "low",
      prompt: `Create a cinematic, hopeful SideQuest mission card with no text or logos. Show diverse people taking practical local action. Mission: ${prompt}`,
    });
    const body = (await response.json()) as { data?: { url?: string }[] };
    const url = body.data?.[0]?.url;
    if (!url) throw new Error("Grok Imagine returned no image");
    return { url, model };
  }

  async createVoice(text: string): Promise<ArrayBuffer> {
    const response = await this.call("/tts", {
      text: `[warmly] Your SideQuest briefing. ${text.slice(0, 1200)}`,
      voice_id: process.env.XAI_VOICE_ID ?? "eve",
      language: "en",
    });
    return response.arrayBuffer();
  }

  private async structured<T>(name: string, schema: object, prompt: string) {
    const response = await this.call("/chat/completions", {
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "You are the mission intelligence for SideQuest. Be ambitious about societal impact, conservative about safety, and concise.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name, strict: true, schema },
      },
    });
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Grok returned no content");
    return JSON.parse(content) as T;
  }

  private async call(path: string, body: object) {
    const key = process.env.XAI_API_KEY;
    if (!key) throw new Error("XAI_API_KEY is not configured");
    const response = await fetch(`https://api.x.ai/v1${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok)
      throw new Error(`xAI request failed (${response.status})`);
    return response;
  }
}
