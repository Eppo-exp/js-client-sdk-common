import { Condition, OperatorType, Rule, AttributeValueType } from './rule';

export function matchesAnyRule(
  subjectAttributes: Record<string, AttributeValueType>,
  rules: Rule[],
): boolean {
  for (const rule of rules) {
    if (matchesRule(subjectAttributes, rule)) {
      return true;
    }
  }
  return false;
}

function matchesRule(subjectAttributes: Record<string, AttributeValueType>, rule: Rule): boolean {
  const conditionEvaluations = evaluateRuleConditions(subjectAttributes, rule.conditions);
  return !conditionEvaluations.includes(false);
}

function evaluateRuleConditions(
  subjectAttributes: Record<string, AttributeValueType>,
  conditions: Condition[],
): boolean[] {
  return conditions.map((condition) => evaluateCondition(subjectAttributes, condition));
}

function evaluateCondition(
  subjectAttributes: Record<string, AttributeValueType>,
  condition: Condition,
): boolean {
  const value = subjectAttributes[condition.attribute];
  if (value) {
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
    }
  }
  return false;
}

function compareNumber(
  attributeValue: AttributeValueType,
  conditionValue: AttributeValueType,
  compareFn: (a: number, b: number) => boolean,
) {
  return (
    typeof attributeValue === 'number' &&
    typeof conditionValue === 'number' &&
    compareFn(attributeValue, conditionValue)
  );
}
