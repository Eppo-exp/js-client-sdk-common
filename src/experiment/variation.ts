export interface IShardRange {
  start: number;
  end: number;
}

export interface IVariation {
  name: string;
  shardRange: IShardRange;
}
