import type {
  GpsEvidenceResult,
  LocationPrivacySummary,
  LocationSample,
  LocationSession,
  LocationSharingPreference,
  PartyPresenceSnapshot,
  StartLocationSessionRequest,
  SubmitLocationSampleResponse,
} from "@sidequest/contracts/location";

export type LocationApiOptions = {
  baseUrl: string;
  /** Injectable for tests; defaults to the platform fetch. */
  fetchImpl?: typeof fetch;
};

export class LocationApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "LocationApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Typed client for the location API.
 *
 * Errors are surfaced as codes, never parsed prose, so the UI branches on
 * `error.code` and the server stays free to reword its messages.
 */
export class LocationApi {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor({ baseUrl, fetchImpl }: LocationApiOptions) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#fetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async #request<T>(
    path: string,
    init: RequestInit & { expectedStatuses?: number[] } = {},
  ): Promise<T> {
    const { expectedStatuses, ...requestInit } = init;

    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...requestInit,
      headers: {
        "content-type": "application/json",
        ...(requestInit.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const acceptable = expectedStatuses ?? [];
    if (!response.ok && !acceptable.includes(response.status)) {
      const error = body.error as
        { code?: string; message?: string } | undefined;
      throw new LocationApiError(
        error?.code ?? "UNKNOWN",
        error?.message ?? "Location request failed.",
        response.status,
      );
    }

    return body as T;
  }

  async getConfig() {
    return this.#request<{
      arrival: {
        mode: string;
        maxAccuracyMeters: number;
        maxSampleAgeMs: number;
      };
      ingest: { maxAccuracyMeters: number; maxSampleAgeMs: number };
      session: { defaultDurationMs: number };
      retention: { rawSampleTtlMs: number };
    }>("/v1/location/config");
  }

  async startSession(
    request: StartLocationSessionRequest,
  ): Promise<LocationSession> {
    const body = await this.#request<{ session: LocationSession }>(
      "/v1/location/sessions",
      { method: "POST", body: JSON.stringify(request) },
    );
    return body.session;
  }

  async listSessions(): Promise<readonly LocationSession[]> {
    const body = await this.#request<{ sessions: LocationSession[] }>(
      "/v1/location/sessions",
    );
    return body.sessions;
  }

  async pauseSession(sessionId: string): Promise<LocationSession> {
    const body = await this.#request<{ session: LocationSession }>(
      `/v1/location/sessions/${encodeURIComponent(sessionId)}/pause`,
      { method: "POST" },
    );
    return body.session;
  }

  async resumeSession(sessionId: string): Promise<LocationSession> {
    const body = await this.#request<{ session: LocationSession }>(
      `/v1/location/sessions/${encodeURIComponent(sessionId)}/resume`,
      { method: "POST" },
    );
    return body.session;
  }

  async stopSession(sessionId: string): Promise<LocationSession> {
    const body = await this.#request<{ session: LocationSession }>(
      `/v1/location/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    );
    return body.session;
  }

  /**
   * Submits a reading.
   *
   * A rejection is a normal outcome, not an exception: 422 and 429 carry a
   * typed rejection the UI renders as guidance ("signal too weak", "move and
   * try again"), so they are expected statuses rather than thrown errors.
   */
  async submitSample(
    sessionId: string,
    sample: LocationSample,
    idempotencyKey?: string,
  ): Promise<SubmitLocationSampleResponse> {
    return this.#request<SubmitLocationSampleResponse>("/v1/location/samples", {
      method: "POST",
      expectedStatuses: [422, 429],
      ...(idempotencyKey
        ? { headers: { "idempotency-key": idempotencyKey } }
        : {}),
      body: JSON.stringify({ sessionId, sample }),
    });
  }

  async evaluateGpsEvidence(request: {
    questInstanceId: string;
    target: { latitude: number; longitude: number };
    radiusMeters: number;
    maxAccuracyMeters: number;
  }): Promise<GpsEvidenceResult> {
    const body = await this.#request<{ evidence: GpsEvidenceResult }>(
      "/v1/location/evidence/gps",
      { method: "POST", body: JSON.stringify(request) },
    );
    return body.evidence;
  }

  async getPartyPresence(partyId: string): Promise<PartyPresenceSnapshot> {
    const body = await this.#request<{ presence: PartyPresenceSnapshot }>(
      `/v1/location/party/${encodeURIComponent(partyId)}/presence`,
    );
    return body.presence;
  }

  async getPrivacy(): Promise<{
    summary: LocationPrivacySummary;
    preference: LocationSharingPreference;
  }> {
    return this.#request("/v1/location/me/privacy");
  }

  async updatePrivacy(
    patch: Partial<LocationSharingPreference>,
  ): Promise<LocationSharingPreference> {
    const body = await this.#request<{ preference: LocationSharingPreference }>(
      "/v1/location/me/privacy",
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    return body.preference;
  }

  async deleteMyLocationData(): Promise<{
    deletedSampleCount: number;
    stoppedSessionCount: number;
  }> {
    return this.#request("/v1/location/me/samples", { method: "DELETE" });
  }
}
