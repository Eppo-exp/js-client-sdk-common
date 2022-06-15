import { Rule } from './rule';
import { IVariation } from './variation';

export interface IExperimentConfiguration {
  name: string;
  percentExposure: number;
  enabled: boolean;
  subjectShards: number;
  variations: IVariation[];
  overrides: Record<string, string>;
  rules?: Rule[];
}
