import { IShardRange } from './variation-dto';

export interface IHoldout {
  statusQuoShardRange: IShardRange;
  shippedShardRange: IShardRange | null;
  holdoutKey: string;
}
