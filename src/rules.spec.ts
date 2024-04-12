import { getMD5Hash } from './obfuscation';
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

    const ruleWithNullCondition: Rule = {
      conditions: [
        {
          operator: OperatorType.IS_NULL,
          attribute: 'country',
          value: true,
        },
      ],
    };

    const ruleWithNotNullCondition: Rule = {
      conditions: [
        {
          operator: OperatorType.IS_NULL,
          attribute: 'country',
          value: false,
        },
      ],
    };

    const semverRule: Rule = {
      conditions: [
        {
          operator: OperatorType.GTE,
          attribute: 'version',
          value: '1.2.5',
        },
        {
          operator: OperatorType.LTE,
          attribute: 'version',
          value: '2.4.2',
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
      version: '1.15.0',
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

    it('should return true for a rule with IS_NULL condition when subject attribute is null', () => {
      expect(matchesRule(ruleWithNullCondition, { country: null }, false)).toBe(true);
    });

    it('should return false for a rule with IS_NULL condition when subject attribute is not null', () => {
      expect(matchesRule(ruleWithNullCondition, { country: 'UK' }, false)).toBe(false);
    });

    it('should return true for a rule with IS_NULL condition when subject attribute is missing', () => {
      expect(matchesRule(ruleWithNullCondition, { age: 10 }, false)).toBe(true);
    });

    it('should return false for a rule with NOT IS_NULL condition when subject attribute is null', () => {
      expect(matchesRule(ruleWithNotNullCondition, { country: null }, false)).toBe(false);
    });

    it('should return true for a rule with NOT IS_NULL condition when subject attribute is not null', () => {
      expect(matchesRule(ruleWithNotNullCondition, { country: 'UK' }, false)).toBe(true);
    });

    it('should return false for a rule with NOT IS_NULL condition when subject attribute is missing', () => {
      expect(matchesRule(ruleWithNotNullCondition, { age: 10 }, false)).toBe(false);
    });

    it('should return true for a semver rule that matches the subject attributes', () => {
      expect(matchesRule(semverRule, subjectAttributes, false)).toBe(true);
    });

    it('should return false for a semver rule that does not match the subject attributes', () => {
      const failingAttributes = { version: '2.6.2' };
      expect(matchesRule(semverRule, failingAttributes, false)).toBe(false);
    });

    it('should return false for a semver rule that does not match the subject attributes', () => {
      const failingAttributes = { version: '1.0.6' };
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
            attribute: 'e909c2d7067ea37437cf97fe11d91bd0', // getMD5Hash('country')
            value: [
              'ada53304c5b9e4a839615b6e8f908eb6',
              'c2aadac2ca30ca8aadfbe331ae180d28',
              '4edfc924721abb774d5447bade86ea5d',
            ], // ['usa', 'canada', 'mexico'].map(getMD5Hash)
          },
        ],
      };

      const obfuscatedRuleWithNotOneOfCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.NOT_ONE_OF,
            attribute: 'e909c2d7067ea37437cf97fe11d91bd0', // getMD5Hash('country')
            value: [
              'ada53304c5b9e4a839615b6e8f908eb6',
              'c2aadac2ca30ca8aadfbe331ae180d28',
              '4edfc924721abb774d5447bade86ea5d',
            ], // ['usa', 'canada', 'mexico'].map(getMD5Hash)
          },
        ],
      };

      const obfuscatedRuleWithNullCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.IS_NULL,
            attribute: 'e909c2d7067ea37437cf97fe11d91bd0',
            value: 'b326b5062b2f0e69046810717534cb09',
          },
        ],
      };

      const obfuscatedRuleWithNotNullCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.IS_NULL,
            attribute: 'e909c2d7067ea37437cf97fe11d91bd0',
            value: '68934a3e9455fa72420237eb05902327',
          },
        ],
      };

      const obfuscatedRuleWithGTECondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.GTE,
            attribute: '7d637d275668ed6d41a9b97e6ad3a556', //getMD5Hash('age')
            value: 'MTg=', //encodeBase64('18')
          },
        ],
      };

      const obfuscatedRuleWithGTCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.GT,
            attribute: '7d637d275668ed6d41a9b97e6ad3a556', //getMD5Hash('age')
            value: 'MTg=', //encodeBase64('18')
          },
        ],
      };
      const obfuscatedRuleWithLTECondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.LTE,
            attribute: '7d637d275668ed6d41a9b97e6ad3a556', //getMD5Hash('age')
            value: 'MTg=', //encodeBase64('18')
          },
        ],
      };

      const obfuscatedRuleWithLTCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.LT,
            attribute: '7d637d275668ed6d41a9b97e6ad3a556', //getMD5Hash('age')
            value: 'MTg=', //encodeBase64('18')
          },
        ],
      };
      const obfuscatedRuleWithMatchesCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.MATCHES,
            attribute: '0c83f57c786a0b4a39efab23731c7ebc', // getMD5Hash('email')
            value: 'LitAZXhhbXBsZVwuY29tJA==', //encodeBase64('.+@example\\.com$')
          },
        ],
      };

      const obfuscatedRuleWithNotMatchesCondition: Rule = {
        conditions: [
          {
            operator: ObfuscatedOperatorType.NOT_MATCHES,
            attribute: '0c83f57c786a0b4a39efab23731c7ebc', // getMD5Hash('email')
            value: 'LitAZXhhbXBsZVwuY29tJA==', //encodeBase64('.+@example\\.com$')
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

      it('should return false for an obfuscated rule with NOT_ONE_OF condition when the subject attribute is null', () => {
        expect(matchesRule(obfuscatedRuleWithNotOneOfCondition, { country: null }, true)).toBe(
          false,
        );
      });

      it('should return true for a rule with IS_NULL condition when subject attribute is null', () => {
        expect(matchesRule(obfuscatedRuleWithNullCondition, { country: null }, false)).toBe(true);
      });

      it('should return false for a rule with IS_NULL condition when subject attribute is not null', () => {
        expect(matchesRule(obfuscatedRuleWithNullCondition, { country: 'UK' }, false)).toBe(false);
      });

      it('should return true for a rule with IS_NULL condition when subject attribute is missing', () => {
        expect(matchesRule(obfuscatedRuleWithNullCondition, { age: 10 }, false)).toBe(true);
      });

      it('should return false for a rule with NOT IS_NULL condition when subject attribute is null', () => {
        expect(matchesRule(obfuscatedRuleWithNotNullCondition, { country: null }, false)).toBe(
          false,
        );
      });

      it('should return true for a rule with NOT IS_NULL condition when subject attribute is not null', () => {
        expect(matchesRule(obfuscatedRuleWithNotNullCondition, { country: 'UK' }, false)).toBe(
          true,
        );
      });

      it('should return false for a rule with NOT IS_NULL condition when subject attribute is missing', () => {
        expect(matchesRule(obfuscatedRuleWithNotNullCondition, { age: 10 }, false)).toBe(false);
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
