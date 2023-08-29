import { IValue } from '../value';

export interface IShardRange {
  start: number;
  end: number;
}

export interface IVariation {
  name: string;
  typedValue: IValue;
  shardRange: IShardRange;
}
