/* eslint-disable @typescript-eslint/no-explicit-any */
import { Condition, OperatorType, IRule } from './dto/rule-dto';

export function findMatchingRule(
  subjectAttributes: Record<string, any>,
  rules: IRule[],
): IRule | null {
  for (const rule of rules) {
    if (matchesRule(subjectAttributes, rule)) {
      return rule;
    }
  }
  return null;
}

function matchesRule(subjectAttributes: Record<string, any>, rule: IRule): boolean {
  const conditionEvaluations = evaluateRuleConditions(subjectAttributes, rule.conditions);
  return !conditionEvaluations.includes(false);
}

function evaluateRuleConditions(
  subjectAttributes: Record<string, any>,
  conditions: Condition[],
): boolean[] {
  return conditions.map((condition) => evaluateCondition(subjectAttributes, condition));
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
        return isOneOf(value, condition.value);
      case OperatorType.NOT_ONE_OF:
        return isNotOneOf(value, condition.value);
    }
  }
  return false;
}

function isOneOf(attributeValue: any, conditionValue: string[]) {
  return getMatchingStringValues(attributeValue.toString(), conditionValue).length > 0;
}

function isNotOneOf(attributeValue: any, conditionValue: string[]) {
  return getMatchingStringValues(attributeValue.toString(), conditionValue).length === 0;
}

function getMatchingStringValues(attributeValue: string, conditionValues: string[]): string[] {
  return conditionValues.filter((value) => value.toLowerCase() === attributeValue.toLowerCase());
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
