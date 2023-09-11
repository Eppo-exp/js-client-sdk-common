import { EppoValue } from './eppo_value';

/**
 * Implement this interface to override an assignment or receive a callback post assignment
 * @public
 */
export interface IAssignmentHooks {
  /**
   * Invoked before a subject is assigned to an experiment variation.
   *
   * @param flagKey key of the feature flag being used for assignment
   * @param subject id of subject being assigned
   * @returns variation to override for the given subject. If null is returned,
   * then the subject will be assigned with the default assignment logic.
   * @public
   */
  onPreAssignment(flagKey: string, subject: string): EppoValue | null;

  /**
   * Invoked after a subject is assigned. Useful for any post assignment logic needed which is specific
   * to a flag or allocation. Do not use this for logging assignments - use IAssignmentLogger instead.
   * @param flagKey key of the feature flag being used for assignment
   * @param subject id of subject being assigned
   * @param variation the assigned variation
   * @param allocationKey key of the allocation being used for assignment
   * @public
   */
  onPostAssignment(flagKey: string, subject: string, variation: EppoValue | null, allocationKey?: string | null): void;
}
