import { IFlagEvaluationDetails } from './flag-evaluation-details-builder';

export class FlagEvaluationError extends Error {
  flagEvaluationDetails: IFlagEvaluationDetails | undefined;
}
