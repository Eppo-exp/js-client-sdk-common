import { BanditEvaluator } from './bandit-evaluator';
import {
  BanditCategoricalAttributeCoefficients,
  BanditModelData,
  BanditNumericAttributeCoefficients,
} from './interfaces';
import { Attributes } from './types';

describe('BanditEvaluator', () => {
  const banditEvaluator = new BanditEvaluator();

  describe('scoreActions', () => {
    // We don't want these methods part of the public interface, however it's handy to be able to test them individually
    const exposedEvaluator = banditEvaluator as unknown as {
      scoreActions: (
        subjectAttributes: Attributes,
        actions: Record<string, Attributes>,
        banditModel: BanditModelData,
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
        const score = exposedEvaluator.scoreNumericAttributes(
          numericCoefficients,
          subjectAttributes,
        );
        expect(score).toBe(expectedScore);
      });

      it('Handles missing and extraneous numeric attributes', () => {
        const subjectAttributes: Attributes = { age: 30, powerLevel: 9000 };
        const expectedScore = 30 * 2.0 + 0.3;
        const score = exposedEvaluator.scoreNumericAttributes(
          numericCoefficients,
          subjectAttributes,
        );
        expect(score).toBe(expectedScore);
      });

      it('Handles all numeric attributes missing', () => {
        const subjectAttributes: Attributes = {};
        const expectedScore = 0.5 + 0.3;
        const score = exposedEvaluator.scoreNumericAttributes(
          numericCoefficients,
          subjectAttributes,
        );
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
  });
});
