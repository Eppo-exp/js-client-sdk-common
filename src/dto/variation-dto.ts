import { IValue } from '../eppo_value';

export interface IShardRange {
  start: number;
  end: number;
}

export interface IVariation {
  variationKey: string;
  name: string;
  value: string;
  typedValue: IValue;
  shardRange: IShardRange;
}
