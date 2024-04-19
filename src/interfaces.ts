import { Rule } from './rules';

export enum VariationType {
  STRING = 'STRING',
  INTEGER = 'INTEGER',
  NUMERIC = 'NUMERIC',
  BOOLEAN = 'BOOLEAN',
  JSON = 'JSON',
}

export interface Variation {
  key: string;
  value: string | number | boolean;
}

export interface Range {
  start: number;
  end: number;
}

export interface Shard {
  salt: string;
  ranges: Range[];
}

export interface Split {
  shards: Shard[];
  variationKey: string;
  extraLogging?: Record<string, string>;
}

export interface Allocation {
  key: string;
  rules?: Rule[];
  startAt?: string; // ISO 8601
  endAt?: string; // ISO 8601
  splits: Split[];
  doLog: boolean;
}

export interface Flag {
  key: string;
  enabled: boolean;
  variationType: VariationType;
  variations: Record<string, Variation>;
  allocations: Allocation[];
  totalShards: number;
}

export interface ObfuscatedFlag {
  key: string;
  enabled: boolean;
  variationType: VariationType;
  variations: Record<string, ObfuscatedVariation>;
  allocations: ObfuscatedAllocation[];
  totalShards: number;
}

export interface ObfuscatedVariation {
  key: string;
  value: string;
}

export interface ObfuscatedAllocation {
  key: string;
  rules?: Rule[];
  startAt?: string; // ISO 8601
  endAt?: string; // ISO 8601
  splits: ObfuscatedSplit[];
  doLog: boolean;
}

export interface ObfuscatedSplit {
  shards: ObfuscatedShard[];
  variationKey: string;
  extraLogging?: string;
}

export interface ObfuscatedShard {
  salt: string;
  ranges: Range[];
}
