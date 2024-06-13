import { BanditEvaluator } from './bandit-evaluator';
import {
  BanditCategoricalAttributeCoefficients,
  BanditModelData,
  BanditNumericAttributeCoefficients,
} from './interfaces';
import { Attributes } from './types';

describe('BanditEvaluator', () => {
  const banditEvaluator = new BanditEvaluator();

  // We don't want these methods part of the public interface, however it's handy to be able to test them individually
  const exposedEvaluator = banditEvaluator as unknown as {
    scoreActions: (
      subjectAttributes: Attributes,
      actions: Record<string, Attributes>,
      banditModel: Pick<BanditModelData, 'coefficients' | 'defaultActionScore'>,
    ) => Record<string, number>;
    scoreNumericAttributes: (
      coefficients: BanditNumericAttributeCoefficients[],
      attributes: Attributes,
    ) => number;
    scoreCategoricalAttributes: (
      coefficients: BanditCategoricalAttributeCoefficients[],
      attributes: Attributes,
    ) => number;
  };

  describe('scoreNumericAttributes', () => {
    const numericCoefficients: BanditNumericAttributeCoefficients[] = [
      { attributeKey: 'age', coefficient: 2.0, missingValueCoefficient: 0.5 },
      { attributeKey: 'height', coefficient: 1.5, missingValueCoefficient: 0.3 },
    ];

    it('Scores numeric attributes', () => {
      const subjectAttributes: Attributes = { age: 30, height: 170 };
      const expectedScore = 30 * 2.0 + 170 * 1.5;
      const score = exposedEvaluator.scoreNumericAttributes(numericCoefficients, subjectAttributes);
      expect(score).toBe(expectedScore);
    });

    it('Handles missing and extraneous numeric attributes', () => {
      const subjectAttributes: Attributes = { age: 30, powerLevel: 9000 };
      const expectedScore = 30 * 2.0 + 0.3;
      const score = exposedEvaluator.scoreNumericAttributes(numericCoefficients, subjectAttributes);
      expect(score).toBe(expectedScore);
    });

    it('Handles all numeric attributes missing', () => {
      const subjectAttributes: Attributes = {};
      const expectedScore = 0.5 + 0.3;
      const score = exposedEvaluator.scoreNumericAttributes(numericCoefficients, subjectAttributes);
      expect(score).toBe(expectedScore);
    });

    it('Handles negative numeric coefficients', () => {
      const negativeNumericCoefficients: BanditNumericAttributeCoefficients[] = [
        { attributeKey: 'age', coefficient: -2.0, missingValueCoefficient: 0.5 },
        { attributeKey: 'height', coefficient: -1.5, missingValueCoefficient: 0.3 },
      ];
      const subjectAttributes: Attributes = { age: 30, height: 170 };
      const expectedScore = 30 * -2.0 + 170 * -1.5;
      const score = exposedEvaluator.scoreNumericAttributes(
        negativeNumericCoefficients,
        subjectAttributes,
      );
      expect(score).toBe(expectedScore);
    });
  });

  describe('scoreCategoricalAttributes', () => {
    const categoricalCoefficients: BanditCategoricalAttributeCoefficients[] = [
      {
        attributeKey: 'color',
        missingValueCoefficient: 0.2,
        valueCoefficients: {
          red: 1.0,
          blue: 0.5,
        },
      },
      {
        attributeKey: 'size',
        missingValueCoefficient: 0.3,
        valueCoefficients: { large: 2.0, small: 1.0 },
      },
    ];

    it('Scores categorical coefficients', () => {
      const subjectAttributes: Attributes = { color: 'blue', size: 'large' };
      const expectedScore = 0.5 + 2.0;
      const score = exposedEvaluator.scoreCategoricalAttributes(
        categoricalCoefficients,
        subjectAttributes,
      );
      expect(score).toBe(expectedScore);
    });

    it('Handles missing, extraneous, and unrecognized categorical coefficients', () => {
      const subjectAttributes: Attributes = { color: 'red', size: 'zero', state: 'CO' };
      const expectedScore = 1 + 0.3;
      const score = exposedEvaluator.scoreCategoricalAttributes(
        categoricalCoefficients,
        subjectAttributes,
      );
      expect(score).toBe(expectedScore);
    });

    it('Handles all categorical attributes missing', () => {
      const subjectAttributes: Attributes = {};
      const expectedScore = 0.2 + 0.3;
      const score = exposedEvaluator.scoreCategoricalAttributes(
        categoricalCoefficients,
        subjectAttributes,
      );
      expect(score).toBe(expectedScore);
    });

    it('Handles negative numeric coefficients', () => {
      const negativeCategoricalCoefficients: BanditCategoricalAttributeCoefficients[] = [
        {
          attributeKey: 'color',
          missingValueCoefficient: -0.2,
          valueCoefficients: {
            red: -1.0,
            blue: -0.5,
          },
        },
        {
          attributeKey: 'size',
          missingValueCoefficient: -0.3,
          valueCoefficients: { large: -2.0, small: -1.0 },
        },
      ];
      const subjectAttributes: Attributes = { color: 'blue', size: 'small' };
      const expectedScore = -0.5 + -1.0;
      const score = exposedEvaluator.scoreCategoricalAttributes(
        negativeCategoricalCoefficients,
        subjectAttributes,
      );
      expect(score).toBe(expectedScore);
    });
  });

  describe('scoreActions', () => {
    const modelData: Pick<BanditModelData, 'coefficients' | 'defaultActionScore'> = {
      defaultActionScore: 1.23,
      coefficients: {
        action1: {
          actionKey: 'action1',
          intercept: 0.5,
          subjectNumericCoefficients: [
            { attributeKey: 'age', coefficient: 0.1, missingValueCoefficient: 0.0 },
          ],
          subjectCategoricalCoefficients: [
            {
              attributeKey: 'location',
              missingValueCoefficient: 0.0,
              valueCoefficients: { US: 0.2 },
            },
          ],
          actionNumericCoefficients: [
            { attributeKey: 'price', coefficient: 0.05, missingValueCoefficient: 0.0 },
          ],
          actionCategoricalCoefficients: [
            {
              attributeKey: 'category',
              missingValueCoefficient: 0.0,
              valueCoefficients: { A: 0.3 },
            },
          ],
        },
        action2: {
          actionKey: 'action2',
          intercept: 0.3,
          subjectNumericCoefficients: [
            { attributeKey: 'age', coefficient: 0.2, missingValueCoefficient: 0.3 },
          ],
          subjectCategoricalCoefficients: [
            {
              attributeKey: 'color',
              missingValueCoefficient: 0.6,
              valueCoefficients: { red: 0.4 },
            },
          ],
          actionNumericCoefficients: [
            { attributeKey: 'price', coefficient: -0.1, missingValueCoefficient: 0.0 },
          ],
          actionCategoricalCoefficients: [
            {
              attributeKey: 'category',
              missingValueCoefficient: -0.2,
              valueCoefficients: { B: 0.4 },
            },
          ],
        },
      },
    };

    it('scores each action', () => {
      const subjectAttributes: Attributes = { age: 30, location: 'US' };
      const actions: Record<string, Attributes> = {
        action1: { price: 25, category: 'A' },
        action2: { price: 50, category: 'B' },
        action99: { price: 100, category: 'C' },
      };
      const actionScores = exposedEvaluator.scoreActions(subjectAttributes, actions, modelData);
      expect(Object.keys(actionScores)).toHaveLength(3);
      expect(actionScores.action1).toBe(0.5 + 30 * 0.1 + 0.2 + 25 * 0.05 + 0.3);
      expect(actionScores.action2).toBe(0.3 + 30 * 0.2 + 0.6 + -0.1 * 50 + 0.4);
      expect(actionScores.action99).toBe(1.23); // Default score
    });
  });
});
