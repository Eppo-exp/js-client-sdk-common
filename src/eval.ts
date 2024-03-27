import { Flag, Shard, Range, Variation, Allocation, Split } from './interfaces';
import { matchesRule } from './rule_evaluator';
import { Sharder } from './sharders';

export interface FlagEvaluation {
  flagKey: string;
  subjectKey: string;
  subjectAttributes: Record<string, string | number | boolean>;
  allocationKey: string | null;
  variation: Variation | null;
  extraLogging: Record<string, string>;
  doLog: boolean;
}

export class Evaluator {
  sharder: Sharder; // Assuming a Sharder type exists, replace 'any' with 'Sharder' when available

  constructor(sharder: Sharder) {
    this.sharder = sharder;
  }

  evaluateFlag(
    flag: Flag,
    subjectKey: string,
    subjectAttributes: Record<string, string | number | boolean>,
    obfuscated: boolean,
  ): FlagEvaluation {
    if (!flag.enabled) {
      return noneResult(flag.key, subjectKey, subjectAttributes);
    }

    const now = new Date();
    for (const allocation of flag.allocations) {
      if (allocation.startAt && now < allocation.startAt) continue;
      if (allocation.endAt && now > allocation.endAt) continue;

      if (
        !allocation.rules.length ||
        allocation.rules.some((rule) =>
          matchesRule(rule, { id: subjectKey, ...subjectAttributes }, obfuscated),
        )
      ) {
        for (const split of allocation.splits) {
          if (
            split.shards.every((shard) => this.matchesShard(shard, subjectKey, flag.totalShards))
          ) {
            return {
              flagKey: flag.key,
              subjectKey,
              subjectAttributes,
              allocationKey: allocation.key,
              variation: flag.variations[split.variationKey],
              extraLogging: split.extraLogging,
              doLog: allocation.doLog,
            };
          }
        }
      }
    }

    return noneResult(flag.key, subjectKey, subjectAttributes);
  }

  matchesShard(shard: Shard, subjectKey: string, totalShards: number): boolean {
    const h = this.sharder.getShard(hashKey(shard.salt, subjectKey), totalShards);
    return shard.ranges.some((range) => isInShardRange(h, range));
  }
}

export function isInShardRange(shard: number, range: Range): boolean {
  return range.start <= shard && shard < range.end;
}

export function hashKey(salt: string, subjectKey: string): string {
  return `${salt}-${subjectKey}`;
}

export function noneResult(
  flagKey: string,
  subjectKey: string,
  subjectAttributes: Record<string, string | number | boolean>,
): FlagEvaluation {
  return {
    flagKey,
    subjectKey,
    subjectAttributes,
    allocationKey: null,
    variation: null,
    extraLogging: {},
    doLog: false,
  };
}