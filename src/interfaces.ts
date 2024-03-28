import { getMD5Hash } from './obfuscation';

export enum VariationType {
  STRING = 'string',
  INTEGER = 'integer',
  NUMERIC = 'numeric',
  BOOLEAN = 'boolean',
  JSON = 'json',
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
  rules: Rule[];
  startAt?: Date;
  endAt?: Date;
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

export enum OperatorType {
  MATCHES = 'MATCHES',
  NOT_MATCHES = 'NOT_MATCHES',
  GTE = 'GTE',
  GT = 'GT',
  LTE = 'LTE',
  LT = 'LT',
  ONE_OF = 'ONE_OF',
  NOT_ONE_OF = 'NOT_ONE_OF',
}

export enum OperatorValueType {
  PLAIN_STRING = 'PLAIN_STRING',
  STRING_ARRAY = 'STRING_ARRAY',
  SEM_VER = 'SEM_VER',
  NUMERIC = 'NUMERIC',
}

interface MatchesCondition {
  operator: OperatorType.MATCHES;
  attribute: string;
  value: string;
}

interface NotMatchesCondition {
  operator: OperatorType.NOT_MATCHES;
  attribute: string;
  value: string;
}

interface OneOfCondition {
  operator: OperatorType.ONE_OF;
  attribute: string;
  value: string[];
}

interface NotOneOfCondition {
  operator: OperatorType.NOT_ONE_OF;
  attribute: string;
  value: string[];
}

interface SemVerCondition {
  operator: OperatorType.GTE | OperatorType.GT | OperatorType.LTE | OperatorType.LT;
  attribute: string;
  value: string;
}

interface NumericCondition {
  operator: OperatorType.GTE | OperatorType.GT | OperatorType.LTE | OperatorType.LT;
  attribute: string;
  value: number;
}

export type Condition =
  | MatchesCondition
  | NotMatchesCondition
  | OneOfCondition
  | NotOneOfCondition
  | SemVerCondition
  | NumericCondition;

export interface Rule {
  conditions: Condition[];
}
