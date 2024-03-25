import { OperatorType, IRule } from './dto/rule-dto';
import { matchesRule } from './rule_evaluator';

describe('matchesRule', () => {
  const ruleWithEmptyConditions: IRule = {
    conditions: [],
  };
  const numericRule: IRule = {
    conditions: [
      {
        operator: OperatorType.GTE,
        attribute: 'totalSales',
        value: 10,
      },
      {
        operator: OperatorType.LTE,
        attribute: 'totalSales',
        value: 100,
      },
    ],
  };
  const semverRule: IRule = {
    conditions: [
      {
        operator: OperatorType.GTE,
        attribute: 'version',
        value: '1.0.0',
      },
      {
        operator: OperatorType.LTE,
        attribute: 'version',
        value: '2.0.0',
      },
    ],
  };
  const ruleWithMatchesCondition: IRule = {
    conditions: [
      {
        operator: OperatorType.MATCHES,
        attribute: 'user_id',
        value: '[0-9]+',
      },
    ],
  };

  const subjectAttributes = {
    totalSales: 50,
    version: '1.5.0',
    user_id: '12345',
  };

  it('should return true for a rule with empty conditions', () => {
    expect(matchesRule(ruleWithEmptyConditions, subjectAttributes, false)).toBe(true);
  });

  it('should return true for a numeric rule that matches the subject attributes', () => {
    expect(matchesRule(numericRule, subjectAttributes, false)).toBe(true);
  });

  it('should return false for a numeric rule that does not match the subject attributes', () => {
    const failingAttributes = { totalSales: 101 };
    expect(matchesRule(numericRule, failingAttributes, false)).toBe(false);
  });

  it('should return true for a semver rule that matches the subject attributes', () => {
    expect(matchesRule(semverRule, subjectAttributes, false)).toBe(true);
  });

  it('should return false for a semver rule that does not match the subject attributes', () => {
    const failingAttributes = { version: '2.1.0' };
    expect(matchesRule(semverRule, failingAttributes, false)).toBe(false);
  });

  it('should return true for a rule with matches condition that matches the subject attributes', () => {
    expect(matchesRule(ruleWithMatchesCondition, subjectAttributes, false)).toBe(true);
  });

  it('should return false for a rule with matches condition that does not match the subject attributes', () => {
    const failingAttributes = { user_id: 'abcde' };
    expect(matchesRule(ruleWithMatchesCondition, failingAttributes, false)).toBe(false);
  });
});
