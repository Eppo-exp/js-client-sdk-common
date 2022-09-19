import { OperatorType, Rule } from './dto/rule-dto';
import { findMatchingRule } from './rule_evaluator';

describe('findMatchingRule', () => {
  const ruleWithEmptyConditions: Rule = {
    conditions: [],
  };
  const numericRule: Rule = {
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
  const ruleWithMatchesCondition: Rule = {
    conditions: [
      {
        operator: OperatorType.MATCHES,
        attribute: 'user_id',
        value: '[0-9]+',
      },
    ],
  };

  it('returns null if rules array is empty', () => {
    const rules: Rule[] = [];
    expect(findMatchingRule({ name: 'my-user' }, rules)).toEqual(null);
  });

  it('returns null if attributes do not match any rules', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ totalSales: 101 }, rules)).toEqual(null);
  });

  it('returns the rule if attributes match AND conditions', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ totalSales: 100 }, rules)).toEqual(numericRule);
  });

  it('returns null if there is no attribute for the condition', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ unknown: 'test' }, rules)).toEqual(null);
  });

  it('returns the rule if it has no conditions', () => {
    const rules = [ruleWithEmptyConditions];
    expect(findMatchingRule({ totalSales: 101 }, rules)).toEqual(ruleWithEmptyConditions);
  });

  it('returns null if using numeric operator with string', () => {
    const rules = [numericRule, ruleWithMatchesCondition];
    expect(findMatchingRule({ totalSales: 'stringValue' }, rules)).toEqual(null);
    expect(findMatchingRule({ totalSales: '20' }, rules)).toEqual(null);
  });

  it('handles rule with matches operator', () => {
    const rules = [ruleWithMatchesCondition];
    expect(findMatchingRule({ user_id: '14' }, rules)).toEqual(ruleWithMatchesCondition);
    expect(findMatchingRule({ user_id: 14 }, rules)).toEqual(ruleWithMatchesCondition);
  });

  it('handles oneOf rule type with boolean', () => {
    const oneOfRule: Rule = {
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['true'],
          attribute: 'enabled',
        },
      ],
    };
    const notOneOfRule: Rule = {
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['true'],
          attribute: 'enabled',
        },
      ],
    };
    expect(findMatchingRule({ enabled: true }, [oneOfRule])).toEqual(oneOfRule);
    expect(findMatchingRule({ enabled: false }, [oneOfRule])).toEqual(null);
    expect(findMatchingRule({ enabled: true }, [notOneOfRule])).toEqual(null);
    expect(findMatchingRule({ enabled: false }, [notOneOfRule])).toEqual(notOneOfRule);
  });

  it('handles oneOf rule type with string', () => {
    const oneOfRule: Rule = {
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['user1', 'user2'],
          attribute: 'userId',
        },
      ],
    };
    const notOneOfRule: Rule = {
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['user14'],
          attribute: 'userId',
        },
      ],
    };
    expect(findMatchingRule({ userId: 'user1' }, [oneOfRule])).toEqual(oneOfRule);
    expect(findMatchingRule({ userId: 'user2' }, [oneOfRule])).toEqual(oneOfRule);
    expect(findMatchingRule({ userId: 'user3' }, [oneOfRule])).toEqual(null);
    expect(findMatchingRule({ userId: 'user14' }, [notOneOfRule])).toEqual(null);
    expect(findMatchingRule({ userId: 'user15' }, [notOneOfRule])).toEqual(notOneOfRule);
  });

  it('does case insensitive matching with oneOf operator', () => {
    const oneOfRule: Rule = {
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['CA', 'US'],
          attribute: 'country',
        },
      ],
    };
    expect(findMatchingRule({ country: 'us' }, [oneOfRule])).toEqual(oneOfRule);
    expect(findMatchingRule({ country: 'cA' }, [oneOfRule])).toEqual(oneOfRule);
  });

  it('does case insensitive matching with notOneOf operator', () => {
    const notOneOf: Rule = {
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['1.0.BB', '1Ab'],
          attribute: 'deviceType',
        },
      ],
    };
    expect(findMatchingRule({ deviceType: '1ab' }, [notOneOf])).toEqual(null);
  });

  it('handles oneOf rule with number', () => {
    const oneOfRule: Rule = {
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['1', '2'],
          attribute: 'userId',
        },
      ],
    };
    const notOneOfRule: Rule = {
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['14'],
          attribute: 'userId',
        },
      ],
    };
    expect(findMatchingRule({ userId: 1 }, [oneOfRule])).toEqual(oneOfRule);
    expect(findMatchingRule({ userId: '2' }, [oneOfRule])).toEqual(oneOfRule);
    expect(findMatchingRule({ userId: 3 }, [oneOfRule])).toEqual(null);
    expect(findMatchingRule({ userId: 14 }, [notOneOfRule])).toEqual(null);
    expect(findMatchingRule({ userId: '15' }, [notOneOfRule])).toEqual(notOneOfRule);
  });
});
