import { IValue } from '../eppo_value';

export interface IShardRange {
  start: number;
  end: number;
}

export interface IVariation {
  name: string;
  typedValue: IValue;
  shardRange: IShardRange;
}
