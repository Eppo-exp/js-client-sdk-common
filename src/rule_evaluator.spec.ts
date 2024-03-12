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

    // input subject attribute is a string which is not a valid semver nor numeric
    // verify that is not parsed to a semver nor a numeric.
    expect(
      findMatchingRule(
        { version: '1.2.03' },
        [
          {
            allocationKey: 'test',
            conditions: [
              {
                operator: OperatorType.GTE,
                attribute: 'version',
                value: '1.2.0',
              },
            ],
          },
        ],
        false,
      ),
    ).toEqual(null);
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

  it('returns the rule for semver prerelease conditions', () => {
    /*
    https://semver.org/#spec-item-9

    A pre-release version MAY be denoted by appending a hyphen and a series of dot separated identifiers immediately following the patch version. 
    Identifiers MUST comprise only ASCII alphanumerics and hyphens [0-9A-Za-z-]. Identifiers MUST NOT be empty. 
    Numeric identifiers MUST NOT include leading zeroes. Pre-release versions have a lower precedence than the associated normal version. 
    A pre-release version indicates that the version is unstable and might not satisfy the intended compatibility requirements as denoted by its associated normal version. 
    Examples: 1.0.0-alpha, 1.0.0-alpha.1, 1.0.0-0.3.7, 1.0.0-x.7.z.92, 1.0.0-x-y-z.--.

    Pre-release versions have a lower precedence than the associated normal version.
    For example, 1.0.0-alpha < 1.0.0.
    */
    const extendedSemverRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.GT,
          attribute: 'version',
          value: '1.2.3-alpha',
        },
        {
          operator: OperatorType.LTE,
          attribute: 'version',
          value: '2.0.0',
        },
      ],
    };
    const rules = [extendedSemverRule];

    // is greater than the associated alpha version
    expect(findMatchingRule({ version: '1.2.3' }, rules, false)).toEqual(extendedSemverRule);

    // beta is greater than alpha (lexicographically)
    expect(findMatchingRule({ version: '1.2.3-beta' }, rules, false)).toEqual(extendedSemverRule);

    // 1.2.4 is greater than 1.2.3
    expect(findMatchingRule({ version: '1.2.4' }, rules, false)).toEqual(extendedSemverRule);
  });

  it('returns the rule for semver build numbers', () => {
    /*
    https://semver.org/#spec-item-10

    Build metadata MAY be denoted by appending a plus sign and a series of dot separated identifiers immediately following the patch or pre-release version. 
    Identifiers MUST comprise only ASCII alphanumerics and hyphens [0-9A-Za-z-]. Identifiers MUST NOT be empty. 
    Build metadata MUST be ignored when determining version precedence. 
    Thus two versions that differ only in the build metadata, have the same precedence. 
    
    Examples: 1.0.0-alpha+001, 1.0.0+20130313144700, 1.0.0-beta+exp.sha.5114f85, 1.0.0+21AF26D3----117B344092BD.
    */

    const extendedSemverRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.GT,
          attribute: 'version',
          value: '1.2.3+001',
        },
        {
          operator: OperatorType.LTE,
          attribute: 'version',
          value: '2.0.0',
        },
      ],
    };
    const rules = [extendedSemverRule];

    // build number is ignored therefore 1.2.3 is not greater than 1.2.3
    expect(findMatchingRule({ version: '1.2.3' }, rules, false)).toEqual(null);

    // build number is ignored therefore 1.2.3 is not greater than 1.2.3
    expect(findMatchingRule({ version: '1.2.3+500' }, rules, false)).toEqual(null);

    // 1.2.4 is greater than 1.2.3
    expect(findMatchingRule({ version: '1.2.4' }, rules, false)).toEqual(extendedSemverRule);
  });

  it('returns the rule for semver mixed prerelease and build numbers', () => {
    /*
    When a version in Semantic Versioning (SemVer) includes both pre-release identifiers and build metadata, 
    the version's precedence is determined first by the pre-release version, 
    with the build metadata being ignored in terms of precedence. 
    
    The format for such a version would look something like this: MAJOR.MINOR.PATCH-prerelease+build
    */
    const extendedSemverRule: IRule = {
      allocationKey: 'test',
      conditions: [
        {
          operator: OperatorType.GT,
          attribute: 'version',
          value: '1.2.3-beta+001',
        },
        {
          operator: OperatorType.LTE,
          attribute: 'version',
          value: '2.0.0',
        },
      ],
    };
    const rules = [extendedSemverRule];

    // gamma is greater than beta (lexicographically)
    expect(findMatchingRule({ version: '1.2.3-gamma' }, rules, false)).toEqual(extendedSemverRule);

    // 1.2.3 is greater than 1.2.3-beta; this is a stable release
    expect(findMatchingRule({ version: '1.2.3+500' }, rules, false)).toEqual(extendedSemverRule);

    // 1.2.4 is greater than 1.2.3
    expect(findMatchingRule({ version: '1.2.4' }, rules, false)).toEqual(extendedSemverRule);
  });

  it('returns null if there is no attribute for the condition', () => {
    const rules = [numericRule];
    expect(findMatchingRule({ unknown: 'test' }, rules, false)).toEqual(null);
  });

  it('returns the rule if it has no conditions', () => {
    const rules = [ruleWithEmptyConditions];
    expect(findMatchingRule({ totalSales: 101 }, rules, false)).toEqual(ruleWithEmptyConditions);
  });

  it('allows for a mix of numeric and string values', () => {
    const rules = [numericRule, ruleWithMatchesCondition];
    expect(findMatchingRule({ totalSales: 'stringValue' }, rules, false)).toEqual(null);
    expect(findMatchingRule({ totalSales: '20' }, rules, false)).toEqual(numericRule);
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
