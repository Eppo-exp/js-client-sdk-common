import { IHoldout } from './holdout-dto';
import { IVariation } from './variation-dto';

export interface IAllocation {
  percentExposure: number;
  variations: IVariation[];
  statusQuoVariationKey: string | null;
  shippedVariationKey: string | null;
  holdouts: IHoldout[];
}
