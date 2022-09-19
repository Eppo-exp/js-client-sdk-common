export interface IShardRange {
  start: number;
  end: number;
}

export interface IVariation {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  shardRange: IShardRange;
}
