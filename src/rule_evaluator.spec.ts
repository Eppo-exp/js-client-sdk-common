import { OperatorType, Rule } from './rule';
import { matchesAnyRule } from './rule_evaluator';

describe('matchesAnyRule', () => {
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

  it('returns false if rules array is empty', () => {
    const rules: Rule[] = [];
    expect(matchesAnyRule({ name: 'my-user' }, rules)).toEqual(false);
  });

  it('returns false if attributes do not match any rules', () => {
    const rules = [numericRule];
    expect(matchesAnyRule({ totalSales: 101 }, rules)).toEqual(false);
  });

  it('returns true if attributes match AND conditions', () => {
    const rules = [numericRule];
    expect(matchesAnyRule({ totalSales: 100 }, rules)).toEqual(true);
  });

  it('returns false if there is no attribute for the condition', () => {
    const rules = [numericRule];
    expect(matchesAnyRule({ unknown: 'test' }, rules)).toEqual(false);
  });

  it('returns true if rules have no conditions', () => {
    const rules = [ruleWithEmptyConditions];
    expect(matchesAnyRule({ totalSales: 101 }, rules)).toEqual(true);
  });

  it('returns false if using numeric operator with string', () => {
    const rules = [numericRule, ruleWithMatchesCondition];
    expect(matchesAnyRule({ totalSales: 'stringValue' }, rules)).toEqual(false);
    expect(matchesAnyRule({ totalSales: '20' }, rules)).toEqual(false);
  });

  it('handles rule with matches operator', () => {
    const rules = [ruleWithMatchesCondition];
    expect(matchesAnyRule({ user_id: '14' }, rules)).toEqual(true);
    expect(matchesAnyRule({ user_id: 14 }, rules)).toEqual(true);
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
    expect(matchesAnyRule({ enabled: true }, [oneOfRule])).toEqual(true);
    expect(matchesAnyRule({ enabled: false }, [oneOfRule])).toEqual(false);
    expect(matchesAnyRule({ enabled: true }, [notOneOfRule])).toEqual(false);
    expect(matchesAnyRule({ enabled: false }, [notOneOfRule])).toEqual(true);
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
    expect(matchesAnyRule({ userId: 'user1' }, [oneOfRule])).toEqual(true);
    expect(matchesAnyRule({ userId: 'user2' }, [oneOfRule])).toEqual(true);
    expect(matchesAnyRule({ userId: 'user3' }, [oneOfRule])).toEqual(false);
    expect(matchesAnyRule({ userId: 'user14' }, [notOneOfRule])).toEqual(false);
    expect(matchesAnyRule({ userId: 'user15' }, [notOneOfRule])).toEqual(true);
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
    expect(matchesAnyRule({ userId: 1 }, [oneOfRule])).toEqual(true);
    expect(matchesAnyRule({ userId: '2' }, [oneOfRule])).toEqual(true);
    expect(matchesAnyRule({ userId: 3 }, [oneOfRule])).toEqual(false);
    expect(matchesAnyRule({ userId: 14 }, [notOneOfRule])).toEqual(false);
    expect(matchesAnyRule({ userId: '15' }, [notOneOfRule])).toEqual(true);
  });
});
