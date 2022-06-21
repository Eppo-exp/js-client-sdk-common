import { createHash } from 'crypto';

import { IShardRange } from './experiment/variation';

export function getShard(input: string, subjectShards: number): number {
  const hashOutput = createHash('md5').update(input).digest('hex');
  // get the first 4 bytes of the md5 hex string and parse it using base 16
  // (8 hex characters represent 4 bytes, e.g. 0xffffffff represents the max 4-byte integer)
  const intFromHash = parseInt(hashOutput.slice(0, 8), 16);
  return intFromHash % subjectShards;
}

export function isShardInRange(shard: number, range: IShardRange) {
  return shard >= range.start && shard < range.end;
}
