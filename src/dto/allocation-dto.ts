import { IHoldout } from './holdout-dto';
import { IVariation } from './variation-dto';

export interface IAllocation {
  percentExposure: number;
  variations: IVariation[];
  holdout: IHoldout;
}
