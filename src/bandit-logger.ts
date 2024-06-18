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

/**
 * Implement this interface log variation assignments to your data warehouse.
 * @public
 */
export interface IBanditLogger {
  /**
   * Invoked when a subject is assigned to an experiment variation.
   * @param assignment holds the variation an experiment subject was assigned to
   * @public
   */
  logBanditAction(assignment: IBanditEvent): void;
}
