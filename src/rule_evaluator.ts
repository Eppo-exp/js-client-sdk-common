/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  valid as validSemver,
  gt as semverGt,
  lt as semverLt,
  gte as semverGte,
  lte as semverLte,
} from 'semver';

import { Condition, OperatorType, IRule, OperatorValueType } from './dto/rule-dto';
import { decodeBase64, getMD5Hash } from './obfuscation';

export function findMatchingRules(
  subjectAttributes: Record<string, any>,
  rules: IRule[],
  obfuscated: boolean,
): IRule[] {
  const matchingRules = [];
  for (const rule of rules) {
    if (matchesRule(subjectAttributes, rule, obfuscated)) {
      matching_rules.append(rule);
    }
  }
  return matchingRules;
}

function matchesRule(
  subjectAttributes: Record<string, any>,
  rule: IRule,
  obfuscated: boolean,
): boolean {
  const conditionEvaluations = evaluateRuleConditions(
    subjectAttributes,
    rule.conditions,
    obfuscated,
  );
  return !conditionEvaluations.includes(false);
}

function evaluateRuleConditions(
  subjectAttributes: Record<string, any>,
  conditions: Condition[],
  obfuscated: boolean,
): boolean[] {
  return conditions.map((condition) =>
    obfuscated
      ? evaluateObfuscatedCondition(subjectAttributes, condition)
      : evaluateCondition(subjectAttributes, condition),
  );
}

function evaluateCondition(subjectAttributes: Record<string, any>, condition: Condition): boolean {
  const value = subjectAttributes[condition.attribute];

  const conditionValueType = targetingRuleConditionValuesTypesFromValues(condition.value);

  if (value != null) {
    switch (condition.operator) {
      case OperatorType.GTE:
        if (conditionValueType === OperatorValueType.SEM_VER) {
          return compareSemVer(value, condition.value, semverGte);
        }
        return compareNumber(value, condition.value, (a, b) => a >= b);
      case OperatorType.GT:
        if (conditionValueType === OperatorValueType.SEM_VER) {
          return compareSemVer(value, condition.value, semverGt);
        }
        return compareNumber(value, condition.value, (a, b) => a > b);
      case OperatorType.LTE:
        if (conditionValueType === OperatorValueType.SEM_VER) {
          return compareSemVer(value, condition.value, semverLte);
        }
        return compareNumber(value, condition.value, (a, b) => a <= b);
      case OperatorType.LT:
        if (conditionValueType === OperatorValueType.SEM_VER) {
          return compareSemVer(value, condition.value, semverLt);
        }
        return compareNumber(value, condition.value, (a, b) => a < b);
      case OperatorType.MATCHES:
        return new RegExp(condition.value as string).test(value as string);
      case OperatorType.ONE_OF:
        return isOneOf(
          value.toString().toLowerCase(),
          condition.value.map((value: string) => value.toLowerCase()),
        );
      case OperatorType.NOT_ONE_OF:
        return isNotOneOf(
          value.toString().toLowerCase(),
          condition.value.map((value: string) => value.toLowerCase()),
        );
    }
  }
  return false;
}

function evaluateObfuscatedCondition(
  subjectAttributes: Record<string, any>,
  condition: Condition,
): boolean {
  const hashedSubjectAttributes: Record<string, any> = Object.entries(subjectAttributes).reduce(
    (accum, [key, val]) => ({ [getMD5Hash(key)]: val, ...accum }),
    {},
  );
  const value = hashedSubjectAttributes[condition.attribute];
  const conditionValueType = targetingRuleConditionValuesTypesFromValues(value);

  if (value != null) {
    switch (condition.operator) {
      case getMD5Hash(OperatorType.GTE):
        if (conditionValueType === OperatorValueType.SEM_VER) {
          return compareSemVer(value, decodeBase64(condition.value), semverGte);
        }
        return compareNumber(value, Number(decodeBase64(condition.value)), (a, b) => a >= b);
      case getMD5Hash(OperatorType.GT):
        if (conditionValueType === OperatorValueType.SEM_VER) {
          return compareSemVer(value, decodeBase64(condition.value), semverGt);
        }
        return compareNumber(value, Number(decodeBase64(condition.value)), (a, b) => a > b);
      case getMD5Hash(OperatorType.LTE):
        if (conditionValueType === OperatorValueType.SEM_VER) {
          return compareSemVer(value, decodeBase64(condition.value), semverLte);
        }
        return compareNumber(value, Number(decodeBase64(condition.value)), (a, b) => a <= b);
      case getMD5Hash(OperatorType.LT):
        if (conditionValueType === OperatorValueType.SEM_VER) {
          return compareSemVer(value, decodeBase64(condition.value), semverLt);
        }
        return compareNumber(value, Number(decodeBase64(condition.value)), (a, b) => a < b);
      case getMD5Hash(OperatorType.MATCHES):
        return new RegExp(decodeBase64(condition.value)).test(value as string);
      case getMD5Hash(OperatorType.ONE_OF):
        return isOneOf(getMD5Hash(value.toString().toLowerCase()), condition.value);
      case getMD5Hash(OperatorType.NOT_ONE_OF):
        return isNotOneOf(getMD5Hash(value.toString().toLowerCase()), condition.value);
    }
  }
  return false;
}

function isOneOf(attributeValue: string, conditionValue: string[]) {
  return getMatchingStringValues(attributeValue, conditionValue).length > 0;
}

function isNotOneOf(attributeValue: string, conditionValue: string[]) {
  return getMatchingStringValues(attributeValue, conditionValue).length === 0;
}

function getMatchingStringValues(attributeValue: string, conditionValues: string[]): string[] {
  return conditionValues.filter((value) => value === attributeValue);
}

function compareNumber(
  attributeValue: any,
  conditionValue: any,
  compareFn: (a: number, b: number) => boolean,
): boolean {
  return (
    typeof attributeValue === 'number' &&
    typeof conditionValue === 'number' &&
    compareFn(attributeValue, conditionValue)
  );
}

function compareSemVer(
  attributeValue: any,
  conditionValue: any,
  compareFn: (a: string, b: string) => boolean,
): boolean {
  return (
    !!validSemver(attributeValue) &&
    !!validSemver(conditionValue) &&
    compareFn(attributeValue, conditionValue)
  );
}

function targetingRuleConditionValuesTypesFromValues(
  value: number | string | string[],
): OperatorValueType {
  // Check if input is a number
  if (typeof value === 'number') {
    return OperatorValueType.NUMERIC;
  }

  if (Array.isArray(value)) {
    return OperatorValueType.STRING_ARRAY;
  }

  // Check if input is a string that represents a SemVer
  if (validSemver(value)) {
    return OperatorValueType.SEM_VER;
  }

  // Check if input is a string that represents a number
  if (!isNaN(Number(value))) {
    return OperatorValueType.NUMERIC;
  }

  // If none of the above, it's a general string
  return OperatorValueType.PLAIN_STRING;
}
