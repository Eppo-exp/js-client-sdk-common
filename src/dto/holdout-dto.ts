import { IShardRange } from './variation-dto';

interface IHoldoutKey {
  statusQuoShardRange: IShardRange;
  shippedShardRange: IShardRange | null;
  holdoutKey: string;
}

export interface IHoldout {
  statusQuo: string;
  shipped: string | null;
  percentExposure: number;
  keys: IHoldoutKey[];
}
