export type HoldoutVariationType = 'status_quo' | 'all_shipped_variants' | null;

/**
 * Holds data about the variation a subject was assigned to.
 * @public
 */
export interface IAssignmentEvent {
  /**
   * An Eppo allocation key
   */
  allocation: string;

  /**
   * An Eppo experiment key
   */
  experiment: string;

  /**
   * An Eppo feature flag key
   */
  featureFlag: string;

  /**
   * The assigned variation
   */
  variation: string;

  /**
   * The entity or user that was assigned to a variation
   */
  subject: string;

  /**
   * The time the subject was exposed to the variation.
   */
  timestamp: string;

  /**
   * An Eppo holdout key
   */
  holdout: string | null;

  /**
   * The Eppo holdout variation for the assigned variation
   */
  holdoutVariation: HoldoutVariationType;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subjectAttributes: Record<string, any>;
}

/**
 * Implement this interface log variation assignments to your data warehouse.
 * @public
 */
export interface IAssignmentLogger {
  /**
   * Invoked when a subject is assigned to an experiment variation.
   * @param assignment holds the variation an experiment subject was assigned to
   * @public
   */
  logAssignment(assignment: IAssignmentEvent): void;
}
