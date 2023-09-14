import { IAllocation } from './allocation-dto';
import { IRule } from './rule-dto';

export interface IExperimentConfiguration {
  name: string;
  enabled: boolean;
  subjectShards: number;
  overrides: Record<string, string>;
  typedOverrides: Record<string, number | boolean | string | object>;
  allocations: Record<string, IAllocation>;
  rules: IRule[];
}
