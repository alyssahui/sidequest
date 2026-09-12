import type { FastifyInstance } from "fastify";

import type {
  Clock,
  EventPublisher,
  IdGenerator,
  PartyMembershipPort,
} from "@sidequest/contracts";
import type { GpsEvidenceService } from "@sidequest/contracts/location";
import {
  assertPolicyInvariants,
  defaultLocationPolicy,
  type LocationPolicy,
} from "@sidequest/location";

import { InMemoryLocationRepository } from "./inMemoryRepository";
import { PostgisLocationRepository, type SqlClient } from "./postgisRepository";
import type { LocationRepository } from "./repository";
import { registerLocationRoutes } from "./routes";
import { LocationService, type LocationAuditEvent } from "./service";

export type LocationModuleOptions = {
  events: EventPublisher;
  memberships: PartyMembershipPort;
  clock: Clock;
  ids: IdGenerator;
  /** Supply a PostGIS client to persist; omit for the deterministic demo store. */
  sql?: SqlClient;
  repository?: LocationRepository;
  policy?: LocationPolicy;
  audit?: (event: LocationAuditEvent) => void;
  /** Runs the retention sweep on an interval. Off in tests. */
  startRetentionSweep?: boolean;
};

export type LocationModule = {
  service: LocationService;
  /**
   * The seam the quest module consumes. Typed as the contract interface so the
   * quest branch depends on the contract, not on this class.
   */
  gpsEvidence: GpsEvidenceService;
  repository: LocationRepository;
  /** Stops the retention timer. Always call this when closing the app. */
  stop(): void;
};

/**
 * Builds the location module and registers its routes.
 *
 * Storage is chosen here and nowhere else: with a `sql` client the module uses
 * PostGIS, and without one it uses the in-memory store, which is what lets the
 * whole feature demo with no credentials.
 */
export function registerLocationModule(
  app: FastifyInstance,
  options: LocationModuleOptions,
): LocationModule {
  const policy = options.policy ?? defaultLocationPolicy;
  // Fail at startup rather than producing quietly nonsensical verdicts later.
  assertPolicyInvariants(policy);

  const repository =
    options.repository ??
    (options.sql
      ? new PostgisLocationRepository(options.sql)
      : new InMemoryLocationRepository());

  const service = new LocationService({
    repository,
    events: options.events,
    memberships: options.memberships,
    clock: options.clock,
    ids: options.ids,
    policy,
    ...(options.audit ? { audit: options.audit } : {}),
  });

  app.register(async (instance) => {
    await registerLocationRoutes(instance, { service });
  });

  let sweepTimer: ReturnType<typeof setInterval> | undefined;
  if (options.startRetentionSweep) {
    sweepTimer = setInterval(() => {
      void service.sweepExpiredSamples().catch((error: unknown) => {
        // Never log the error object raw: a driver error can echo row values.
        app.log?.error?.(
          { module: "location", failure: "retention-sweep" },
          error instanceof Error ? error.message : "unknown error",
        );
      });
    }, policy.retention.sweepIntervalMs);
    // Do not hold the process open just to run a cleanup timer.
    sweepTimer.unref?.();
  }

  return {
    service,
    gpsEvidence: service,
    repository,
    stop() {
      if (sweepTimer) clearInterval(sweepTimer);
    },
  };
}

export { InMemoryLocationRepository } from "./inMemoryRepository";
export { PostgisLocationRepository, type SqlClient } from "./postgisRepository";
export {
  defaultSharingPreference,
  type LocationRepository,
  type PresenceCandidate,
  type StoredSample,
} from "./repository";
export {
  LocationService,
  LocationServiceError,
  type LocationAuditEvent,
} from "./service";
