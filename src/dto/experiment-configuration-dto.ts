import { IValue } from '../value';

import { IAllocation } from './allocation-dto';
import { IRule } from './rule-dto';

export interface IExperimentConfiguration {
  name: string;
  enabled: boolean;
  subjectShards: number;
  typedOverrides: Record<string, IValue>;
  allocations: Record<string, IAllocation>;
  rules: IRule[];
}
