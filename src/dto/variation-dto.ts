import { IValue } from '../eppo_value';

export interface IShardRange {
  start: number;
  end: number;
}

export interface IVariation {
  name: string;
  value: string;
  typedValue: IValue;
  shardRange: IShardRange;
}
