import {
  AllocationEvaluation,
  AllocationEvaluationCode,
  FlagEvaluationDetails,
  FlagEvaluationDetailsBuilder,
} from './flag-evaluation-details';
import { Flag, Shard, Range, Variation, Allocation, Split } from './interfaces';
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
  flagEvaluationDetails: FlagEvaluationDetails;
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
    configFetchedAt: string,
    configPublishedAt: string,
  ): FlagEvaluation {
    const flagEvaluationDetailsBuilder = new FlagEvaluationDetailsBuilder(
      flag.allocations,
      configFetchedAt,
      configPublishedAt,
    );

    if (!flag.enabled) {
      return noneResult(
        flag.key,
        subjectKey,
        subjectAttributes,
        flagEvaluationDetailsBuilder.buildForNoneResult(
          'FLAG_UNRECOGNIZED_OR_DISABLED',
          `Unrecognized or disabled flag: ${flag.key}`,
        ),
      );
    }

    const now = new Date();
    const unmatchedAllocations: Array<AllocationEvaluation> = [];
    for (let i = 0; i < flag.allocations.length; i++) {
      const allocation = flag.allocations[i];
      const addUnmatchedAllocation = (code: AllocationEvaluationCode) => {
        unmatchedAllocations.push({
          key: allocation.key,
          allocationEvaluationCode: code,
          orderPosition: i,
        });
      };

      if (allocation.startAt && now < new Date(allocation.startAt)) {
        addUnmatchedAllocation(AllocationEvaluationCode.BEFORE_START_TIME);
        continue;
      }
      if (allocation.endAt && now > new Date(allocation.endAt)) {
        addUnmatchedAllocation(AllocationEvaluationCode.AFTER_END_TIME);
        continue;
      }
      const { matched, matchedRule } = matchesRules(
        allocation?.rules ?? [],
        { id: subjectKey, ...subjectAttributes },
        obfuscated,
      );
      if (matched) {
        for (const split of allocation.splits) {
          if (
            split.shards.every((shard) => this.matchesShard(shard, subjectKey, flag.totalShards))
          ) {
            const variation = flag.variations[split.variationKey];
            const flagEvaluationDetails = flagEvaluationDetailsBuilder
              .setMatch(i, variation, allocation, matchedRule, unmatchedAllocations)
              .build(
                'MATCH',
                this.getMatchedEvaluationDetailsMessage(allocation, split, subjectKey),
              );
            return {
              flagKey: flag.key,
              subjectKey,
              subjectAttributes,
              allocationKey: allocation.key,
              variation,
              extraLogging: split.extraLogging ?? {},
              doLog: allocation.doLog,
              flagEvaluationDetails,
            };
          }
        }
        // matched, but does not fall within split range
        addUnmatchedAllocation(AllocationEvaluationCode.TRAFFIC_EXPOSURE_MISS);
      } else {
        addUnmatchedAllocation(AllocationEvaluationCode.FAILING_RULE);
      }
    }
    return noneResult(
      flag.key,
      subjectKey,
      subjectAttributes,
      flagEvaluationDetailsBuilder
        .setNoMatchFound(unmatchedAllocations)
        .build(
          'DEFAULT_ALLOCATION_NULL',
          'No allocations matched. Falling back to "Default Allocation", serving NULL',
        ),
    );
  }

  matchesShard(shard: Shard, subjectKey: string, totalShards: number): boolean {
    const assignedShard = this.sharder.getShard(hashKey(shard.salt, subjectKey), totalShards);
    return shard.ranges.some((range) => isInShardRange(assignedShard, range));
  }

  private getMatchedEvaluationDetailsMessage = (
    allocation: Allocation,
    split: Split,
    subjectKey: string,
  ): string => {
    const hasDefinedRules = !!allocation.rules?.length;
    const isExperiment = allocation.splits.length > 1;
    const isPartialRollout = split.shards.length > 1;
    const isExperimentOrPartialRollout = isExperiment || isPartialRollout;

    if (hasDefinedRules && isExperimentOrPartialRollout) {
      return `Supplied attributes match rules defined in allocation "${allocation.key}" and ${subjectKey} belongs to the range of traffic assigned to "${split.variationKey}".`;
    }
    if (hasDefinedRules && !isExperimentOrPartialRollout) {
      return `Supplied attributes match rules defined in allocation "${allocation.key}".`;
    }
    return `${subjectKey} belongs to the range of traffic assigned to "${split.variationKey}" defined in allocation "${allocation.key}".`;
  };
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
  flagEvaluationDetails: FlagEvaluationDetails,
): FlagEvaluation {
  return {
    flagKey,
    subjectKey,
    subjectAttributes,
    allocationKey: null,
    variation: null,
    extraLogging: {},
    doLog: false,
    flagEvaluationDetails,
  };
}

export function matchesRules(
  rules: Rule[],
  subjectAttributes: SubjectAttributes,
  obfuscated: boolean,
): { matched: boolean; matchedRule: Rule | null } {
  if (!rules.length) {
    return {
      matched: true,
      matchedRule: null,
    };
  }
  let matchedRule: Rule | null = null;
  const hasMatch = rules.some((rule) => {
    const matched = matchesRule(rule, subjectAttributes, obfuscated);
    if (matched) {
      matchedRule = rule;
    }
    return matched;
  });
  return hasMatch
    ? {
        matched: true,
        matchedRule,
      }
    : {
        matched: false,
        matchedRule: null,
      };
}
