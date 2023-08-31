import { IAllocation } from './allocation-dto';
import { IRule } from './rule-dto';

export interface IExperimentConfiguration {
  name: string;
  enabled: boolean;
  subjectShards: number;
  typedOverrides: Record<string, string>;
  allocations: Record<string, IAllocation>;
  rules: IRule[];
}
