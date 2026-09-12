export type RequestPrincipal = {
  userId: string;
  partyIds: readonly string[];
};

export interface AuthPort {
  resolve(accessToken?: string): Promise<RequestPrincipal | null>;
}

export interface PartyMembershipPort {
  isMember(userId: string, partyId: string): Promise<boolean>;
}

export type EconomyOperation = {
  operationId: string;
  userId: string;
  amount: number;
  reason: string;
  relatedEntityId?: string;
};

export type EconomyOperationResult = {
  operationId: string;
  applied: boolean;
  balance: number;
};

export interface EconomyPort {
  apply(operation: EconomyOperation): Promise<EconomyOperationResult>;
  balanceFor(userId: string): Promise<number>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
