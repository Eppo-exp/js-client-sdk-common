import { IHoldout } from './holdout-dto';
import { IVariation, IShardRange } from './variation-dto';

export interface IAllocation {
  trafficShards: IShardRange[];
  variations: IVariation[];
  statusQuoVariationKey: string | null;
  shippedVariationKey: string | null;
  holdouts: IHoldout[];
  layerKey: string | null;
}
