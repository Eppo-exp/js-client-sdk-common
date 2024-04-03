import { encodeBase64, getMD5Hash } from './obfuscation';
import { ObfuscatedOperatorType, OperatorType, Rule, matchesRule } from './rules';

describe('rules', () => {
  describe('Operators', () => {
    it('ObfuscatedOperatorTypes should match hashed OperatorTypes', () => {
      expect(ObfuscatedOperatorType.GTE).toBe(getMD5Hash(OperatorType.GTE));
      expect(ObfuscatedOperatorType.LTE).toBe(getMD5Hash(OperatorType.LTE));
      expect(ObfuscatedOperatorType.LT).toBe(getMD5Hash(OperatorType.LT));
      expect(ObfuscatedOperatorType.ONE_OF).toBe(getMD5Hash(OperatorType.ONE_OF));
      expect(ObfuscatedOperatorType.NOT_ONE_OF).toBe(getMD5Hash(OperatorType.NOT_ONE_OF));
      expect(ObfuscatedOperatorType.MATCHES).toBe(getMD5Hash(OperatorType.MATCHES));
      expect(ObfuscatedOperatorType.NOT_MATCHES).toBe(getMD5Hash(OperatorType.NOT_MATCHES));
    });
  });

  describe('matchesRule | standard rules', () => {
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
    const ruleWithOneOfCondition: Rule = {
      conditions: [
        {
          operator: OperatorType.ONE_OF,
          attribute: 'country',
          value: ['Canada', 'Mexico', 'USA'],
        },
      ],
    };

    const ruleWithNotOneOfCondition: Rule = {
      conditions: [
        {
          operator: OperatorType.NOT_ONE_OF,
          attribute: 'country',
          value: ['Canada', 'Mexico', 'USA'],
        },
      ],
    };

    const semverRule: Rule = {
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
    const ruleWithMatchesCondition: Rule = {
      conditions: [
        {
          operator: OperatorType.MATCHES,
          attribute: 'user_id',
          value: '\\d+',
        },
      ],
    };
    const ruleWithNotMatchesCondition: Rule = {
      conditions: [
        {
          operator: OperatorType.NOT_MATCHES,
          attribute: 'user_id',
          value: '[0-9]+',
        },
      ],
    };
    const subjectAttributes = {
      totalSales: 50,
      version: '1.5.0',
      user_id: '12345',
      country: 'USA',
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

    it('should return true for a rule with ONE_OF condition that matches the subject attributes', () => {
      expect(matchesRule(ruleWithOneOfCondition, { country: 'USA' }, false)).toBe(true);
    });

    it('should return false for a rule with ONE_OF condition that does not match the subject attributes', () => {
      expect(matchesRule(ruleWithOneOfCondition, { country: 'UK' }, false)).toBe(false);
    });

    it('should return false for a rule with ONE_OF condition when subject attribute is missing', () => {
      expect(matchesRule(ruleWithOneOfCondition, { age: 10 }, false)).toBe(false);
    });

    it('should return false for a rule with ONE_OF condition when subject attribute is null', () => {
      expect(matchesRule(ruleWithOneOfCondition, { country: null }, false)).toBe(false);
    });

    it('should return false for a rule with NOT_ONE_OF condition that matches the subject attributes', () => {
      expect(matchesRule(ruleWithNotOneOfCondition, { country: 'USA' }, false)).toBe(false);
    });

    it('should return true for a rule with NOT_ONE_OF condition that does not match the subject attributes', () => {
      expect(matchesRule(ruleWithNotOneOfCondition, { country: 'UK' }, false)).toBe(true);
    });

    it('should return false for a rule with NOT_ONE_OF condition when subject attribute is missing', () => {
      expect(matchesRule(ruleWithNotOneOfCondition, { age: 10 }, false)).toBe(false);
    });

    it('should return false for a rule with NOT_ONE_OF condition when subject attribute is null', () => {
      expect(matchesRule(ruleWithNotOneOfCondition, { country: null }, false)).toBe(false);
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

    it('should return true for a rule with not_matches condition that matches the subject attributes', () => {
      expect(matchesRule(ruleWithNotMatchesCondition, subjectAttributes, false)).toBe(false);
    });
  });

  describe('matchesRule | obfuscated rules', () => {
    describe('matchesRule with obfuscated conditions', () => {
      const obfuscatedRuleWithOneOfCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.ONE_OF,
            attribute: getMD5Hash('country'),
            value: ['usa', 'canada', 'mexico'].map(getMD5Hash),
          },
        ],
      };

      const obfuscatedRuleWithNotOneOfCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.NOT_ONE_OF,
            attribute: getMD5Hash('country'),
            value: ['usa', 'canada', 'mexico'].map(getMD5Hash),
          },
        ],
      };

      const obfuscatedRuleWithGTECondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.GTE,
            attribute: getMD5Hash('age'),
            value: encodeBase64('18'),
          },
        ],
      };

      const obfuscatedRuleWithGTCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.GT,
            attribute: getMD5Hash('age'),
            value: encodeBase64('18'),
          },
        ],
      };
      const obfuscatedRuleWithLTECondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.LTE,
            attribute: getMD5Hash('age'),
            value: encodeBase64('18'),
          },
        ],
      };

      const obfuscatedRuleWithLTCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.LT,
            attribute: getMD5Hash('age'),
            value: encodeBase64('18'),
          },
        ],
      };
      const obfuscatedRuleWithMatchesCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.MATCHES,
            attribute: getMD5Hash('email'),
            value: encodeBase64('.+@example\\.com$'),
          },
        ],
      };

      const obfuscatedRuleWithNotMatchesCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.NOT_MATCHES,
            attribute: getMD5Hash('email'),
            value: encodeBase64('.+@example\\.com$'),
          },
        ],
      };

      it('should return true for an obfuscated rule with ONE_OF condition that matches the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithOneOfCondition, { country: 'USA' }, true)).toBe(true);
      });

      it('should return false for an obfuscated rule with ONE_OF condition that does not match the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithOneOfCondition, { country: 'UK' }, true)).toBe(false);
      });

      it('should return true for an obfuscated rule with NOT_ONE_OF condition that does not match the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithNotOneOfCondition, { country: 'UK' }, true)).toBe(
          true,
        );
      });

      it('should return false for an obfuscated rule with NOT_ONE_OF condition that matches the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithNotOneOfCondition, { country: 'USA' }, true)).toBe(
          false,
        );
      });

      it('should return true for an obfuscated rule with GTE condition that matches the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithGTECondition, { age: 18 }, true)).toBe(true);
      });

      it('should return false for an obfuscated rule with GTE condition that does not match the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithGTECondition, { age: 17 }, true)).toBe(false);
      });

      it('should return true for an obfuscated rule with GT condition that matches the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithGTCondition, { age: 19 }, true)).toBe(true);
      });

      it('should return false for an obfuscated rule with GT condition that does not match the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithGTCondition, { age: 18 }, true)).toBe(false);
      });

      it('should return true for an obfuscated rule with LTE condition that matches the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithLTECondition, { age: 18 }, true)).toBe(true);
      });

      it('should return false for an obfuscated rule with LTE condition that does not match the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithLTECondition, { age: 19 }, true)).toBe(false);
      });

      it('should return true for an obfuscated rule with LT condition that matches the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithLTCondition, { age: 17 }, true)).toBe(true);
      });

      it('should return false for an obfuscated rule with LT condition that does not match the subject attributes', () => {
        expect(matchesRule(obfuscatedRuleWithLTCondition, { age: 18 }, true)).toBe(false);
      });

      it('should return true for an obfuscated rule with MATCHES condition that matches the subject attributes', () => {
        expect(
          matchesRule(obfuscatedRuleWithMatchesCondition, { email: 'user@example.com' }, true),
        ).toBe(true);
      });

      it('should return false for an obfuscated rule with MATCHES condition that does not match the subject attributes', () => {
        expect(
          matchesRule(
            obfuscatedRuleWithMatchesCondition,
            { email: 'user@anotherdomain.com' },
            true,
          ),
        ).toBe(false);
      });

      it('should return true for an obfuscated rule with NOT_MATCHES condition that does not match the subject attributes', () => {
        expect(
          matchesRule(
            obfuscatedRuleWithNotMatchesCondition,
            { email: 'user@anotherdomain.com' },
            true,
          ),
        ).toBe(true);
      });

      it('should return false for an obfuscated rule with NOT_MATCHES condition that matches the subject attributes', () => {
        expect(
          matchesRule(obfuscatedRuleWithNotMatchesCondition, { email: 'user@example.com' }, true),
        ).toBe(false);
      });

      it('should return false for an obfuscated rule with NOT_MATCHES condition when subject attribute is missing', () => {
        expect(matchesRule(obfuscatedRuleWithNotMatchesCondition, { age: 30 }, true)).toBe(false);
      });
    });
  });
});
