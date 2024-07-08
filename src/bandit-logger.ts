import { Attributes } from './types';

export interface IBanditEvent {
  timestamp: string;
  featureFlag: string;
  bandit: string;
  subject: string;
  action: string | null;
  actionProbability: number | null;
  optimalityGap: number | null;
  modelVersion: string;
  subjectNumericAttributes: Attributes;
  subjectCategoricalAttributes: Attributes;
  actionNumericAttributes: Attributes;
  actionCategoricalAttributes: Attributes;
  metaData?: Record<string, unknown>;
}

export interface IBanditLogger {
  logBanditAction(banditEvent: IBanditEvent): void;
}
