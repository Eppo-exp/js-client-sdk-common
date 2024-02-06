import { OperatorType, IRule } from './dto/rule-dto';
import { findMatchingRule } from './rule_evaluator';

describe('findMatchingRule', () => {
  const ruleWithEmptyConditions: IRule = {
    allocationKey: 'test',
    conditions: [],
  };
  const numericRule: IRule = {
    allocationKey: 'test',
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
    allocationKey: 'test',
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
    allocationKey: 'test',
    conditions: [
      {
        operator: OperatorType.MATCHES,
        attribute: 'user_id',
        value: '[0-9]+',
      },
    ],
  };

  it('returns null if rules array is empty', () => {
    const rules: IRule[] = [];
    expect(findMatchingRule({ name: 'my-user' }, rules, false)).toEqual(null);
  });

  it('returns null if attributes do not match any rules', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ totalSales: 101 }, rules, false)).toEqual(null);
  });

  it('returns the rule if attributes match AND conditions', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ totalSales: 100 }, rules, false)).toEqual(numericRule);
  });

  it('returns the rule for semver conditions', () => {
    const rules = [semverRule];
    expect(findMatchingRule({ version: '1.1.0' }, rules, false)).toEqual(semverRule);
    expect(findMatchingRule({ version: '2.0.0' }, rules, false)).toEqual(semverRule);
    expect(findMatchingRule({ version: '2.1.0' }, rules, false)).toBeNull();
  });

  it('returns null if there is no attribute for the condition', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ unknown: 'test' }, rules, false)).toEqual(null);
  });

  it('returns the rule if it has no conditions', () => {
    const rules = [ruleWithEmptyConditions];
    expect(findMatchingRule({ totalSales: 101 }, rules, false)).toEqual(ruleWithEmptyConditions);
  });

  it('returns null if using numeric operator with string', () => {
    const rules = [numericRule, ruleWithMatchesCondition];
    expect(findMatchingRule({ totalSales: 'stringValue' }, rules, false)).toEqual(null);
    expect(findMatchingRule({ totalSales: '20' }, rules, false)).toEqual(null);
  });

  it('handles rule with matches operator', () => {
    const rules = [ruleWithMatchesCondition];
    expect(findMatchingRule({ user_id: '14' }, rules, false)).toEqual(ruleWithMatchesCondition);
    expect(findMatchingRule({ user_id: 14 }, rules, false)).toEqual(ruleWithMatchesCondition);
  });

  it('handles oneOf rule type with boolean', () => {
    const oneOfRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['true'],
          attribute: 'enabled',
        },
      ],
    };
    const notOneOfRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['true'],
          attribute: 'enabled',
        },
      ],
    };
    expect(findMatchingRule({ enabled: true }, [oneOfRule], false)).toEqual(oneOfRule);
    expect(findMatchingRule({ enabled: false }, [oneOfRule], false)).toEqual(null);
    expect(findMatchingRule({ enabled: true }, [notOneOfRule], false)).toEqual(null);
    expect(findMatchingRule({ enabled: false }, [notOneOfRule], false)).toEqual(notOneOfRule);
  });

  it('handles oneOf rule type with string', () => {
    const oneOfRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['user1', 'user2'],
          attribute: 'userId',
        },
      ],
    };
    const notOneOfRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['user14'],
          attribute: 'userId',
        },
      ],
    };
    expect(findMatchingRule({ userId: 'user1' }, [oneOfRule], false)).toEqual(oneOfRule);
    expect(findMatchingRule({ userId: 'user2' }, [oneOfRule], false)).toEqual(oneOfRule);
    expect(findMatchingRule({ userId: 'user3' }, [oneOfRule], false)).toEqual(null);
    expect(findMatchingRule({ userId: 'user14' }, [notOneOfRule], false)).toEqual(null);
    expect(findMatchingRule({ userId: 'user15' }, [notOneOfRule], false)).toEqual(notOneOfRule);
  });

  it('does case insensitive matching with oneOf operator', () => {
    const oneOfRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['CA', 'US'],
          attribute: 'country',
        },
      ],
    };
    expect(findMatchingRule({ country: 'us' }, [oneOfRule], false)).toEqual(oneOfRule);
    expect(findMatchingRule({ country: 'cA' }, [oneOfRule], false)).toEqual(oneOfRule);
  });

  it('does case insensitive matching with notOneOf operator', () => {
    const notOneOf: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['1.0.BB', '1Ab'],
          attribute: 'deviceType',
        },
      ],
    };
    expect(findMatchingRule({ deviceType: '1ab' }, [notOneOf], false)).toEqual(null);
  });

  it('handles oneOf rule with number', () => {
    const oneOfRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          value: ['1', '2'],
          attribute: 'userId',
        },
      ],
    };
    const notOneOfRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          value: ['14'],
          attribute: 'userId',
        },
      ],
    };
    expect(findMatchingRule({ userId: 1 }, [oneOfRule], false)).toEqual(oneOfRule);
    expect(findMatchingRule({ userId: '2' }, [oneOfRule], false)).toEqual(oneOfRule);
    expect(findMatchingRule({ userId: 3 }, [oneOfRule], false)).toEqual(null);
    expect(findMatchingRule({ userId: 14 }, [notOneOfRule], false)).toEqual(null);
    expect(findMatchingRule({ userId: '15' }, [notOneOfRule], false)).toEqual(notOneOfRule);
  });
});
