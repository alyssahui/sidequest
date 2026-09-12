export type DomainEvent<TType extends string = string, TPayload = unknown> = {
  id: string;
  type: TType;
  version: 1;
  occurredAt: string;
  actorUserId?: string;
  partyId?: string;
  aggregateId: string;
  correlationId: string;
  payload: TPayload;
};

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export type FeedEvent = {
  id: string;
  type: string;
  occurredAt: string;
  actorDisplayName?: string;
  title: string;
  detail?: string;
  coinDelta?: number;
};
