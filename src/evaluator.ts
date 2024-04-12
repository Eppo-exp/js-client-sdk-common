import { Flag, Shard, Range, Variation } from './interfaces';
import { Rule, matchesRule } from './rules';
import { MD5Sharder, Sharder } from './sharders';
import { SubjectAttributes } from './types';

export interface FlagEvaluation {
  flagKey: string;
  subjectKey: string;
  subjectAttributes: SubjectAttributes;
  allocationKey: string | null;
  variation: Variation | null;
  extraLogging: Record<string, string>;
  doLog: boolean;
}

export class Evaluator {
  sharder: Sharder;

  constructor(sharder?: Sharder) {
    this.sharder = sharder ?? new MD5Sharder();
  }

  evaluateFlag(
    flag: Flag,
    subjectKey: string,
    subjectAttributes: SubjectAttributes,
    obfuscated: boolean,
  ): FlagEvaluation {
    if (!flag.enabled) {
      return noneResult(flag.key, subjectKey, subjectAttributes);
    }

    const now = new Date();
    for (const allocation of flag.allocations) {
      if (allocation.startAt && now < new Date(allocation.startAt)) continue;
      if (allocation.endAt && now > new Date(allocation.endAt)) continue;

      if (matchesRules(allocation.rules, { id: subjectKey, ...subjectAttributes }, obfuscated)) {
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
              extraLogging: split.extraLogging ?? {},
              doLog: allocation.doLog,
            };
          }
        }
      }
    }

    return noneResult(flag.key, subjectKey, subjectAttributes);
  }

  matchesShard(shard: Shard, subjectKey: string, totalShards: number): boolean {
    const assignedShard = this.sharder.getShard(hashKey(shard.salt, subjectKey), totalShards);
    return shard.ranges.some((range) => isInShardRange(assignedShard, range));
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
  subjectAttributes: SubjectAttributes,
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

export function matchesRules(
  rules: Rule[],
  subjectAttributes: SubjectAttributes,
  obfuscated: boolean,
): boolean {
  return !rules.length || rules.some((rule) => matchesRule(rule, subjectAttributes, obfuscated));
}
