/**
 * Implement this interface to override an assignment or receive a callback post assignment
 * @public
 */
export interface IAssignmentHooks {
  /**
   * Invoked before a subject is assigned to an experiment variation.
   *
   * @param experimentKey key of the experiment being assigned
   * @param subject id of subject being assigned
   * @returns variation to override for the given subject. If null is returned,
   * then the subject will be assigned with the default assignment logic.
   * @public
   */
  onPreAssignment(experimentKey: string, subject: string): string | null;

  /**
   * Invoked after a subject is assigned. Useful for any post assignment logic needed which is specific
   * to an experiment/flag. Do not use this for logging assignments - use IAssignmentLogger instead.
   * @param experimentKey key of the experiment being assigned
   * @param subject id of subject being assigned
   * @param variation the assigned variation
   * @public
   */
  onPostAssignment(experimentKey: string, subject: string, variation: string): void;
}
