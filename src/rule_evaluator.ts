/* eslint-disable @typescript-eslint/no-explicit-any */
import { Condition, OperatorType, IRule } from './dto/rule-dto';
import { decodeBase64, getMD5Hash } from './obfuscation';

export function findMatchingRule(
  subjectAttributes: Record<string, any>,
  rules: IRule[],
  obfuscated: boolean,
): IRule | null {
  for (const rule of rules) {
    if (matchesRule(subjectAttributes, rule, obfuscated)) {
      return rule;
    }
  }
  return null;
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
  if (value != null) {
    switch (condition.operator) {
      case OperatorType.GTE:
        return compareNumber(value, condition.value, (a, b) => a >= b);
      case OperatorType.GT:
        return compareNumber(value, condition.value, (a, b) => a > b);
      case OperatorType.LTE:
        return compareNumber(value, condition.value, (a, b) => a <= b);
      case OperatorType.LT:
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
  if (value != null) {
    switch (condition.operator) {
      case getMD5Hash(OperatorType.GTE):
        return compareNumber(value, Number(decodeBase64(condition.value)), (a, b) => a >= b);
      case getMD5Hash(OperatorType.GT):
        return compareNumber(value, Number(decodeBase64(condition.value)), (a, b) => a > b);
      case getMD5Hash(OperatorType.LTE):
        return compareNumber(value, Number(decodeBase64(condition.value)), (a, b) => a <= b);
      case getMD5Hash(OperatorType.LT):
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
) {
  return (
    typeof attributeValue === 'number' &&
    typeof conditionValue === 'number' &&
    compareFn(attributeValue, conditionValue)
  );
}
