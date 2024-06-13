import {
  BanditCategoricalAttributeCoefficients,
  BanditModelData,
  BanditNumericAttributeCoefficients,
} from './interfaces';
import { Attributes } from './types';

export interface BanditEvaluation {
  flagKey: string;
  subjectKey: string;
  subjectAttributes: Attributes;
  actionKey: string;
  actionAttributes: Attributes;
  actionScore: number;
  actionWeight: number;
  gamma: number;
  optimalityGap: number;
}

export class BanditEvaluator {
  public evaluateBandit(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
    actions: Record<string, Attributes>, // TODO: option to specify if action attributes are numeric or categorical
    banditModel: BanditModelData,
  ): BanditEvaluation {
    const actionScores: Record<string, number> = this.scoreActions(
      subjectAttributes,
      actions,
      banditModel,
    );
    const actionWeights: Record<string, number> = this.weighActions(
      actionScores,
      banditModel.gamma,
      banditModel.actionProbabilityFloor,
    );
    const selectedActionKey: string = this.selectAction(flagKey, subjectKey, actionWeights);
    const optimalityGap = 0; // TODO: compute difference between selected and max

    return {
      flagKey,
      subjectKey,
      subjectAttributes,
      actionKey: selectedActionKey,
      actionAttributes: actions[selectedActionKey],
      actionScore: actionScores[selectedActionKey],
      actionWeight: actionWeights[selectedActionKey],
      gamma: banditModel.gamma,
      optimalityGap,
    };
  }

  private scoreActions(
    subjectAttributes: Attributes,
    actions: Record<string, Attributes>,
    banditModel: Pick<BanditModelData, 'coefficients' | 'defaultActionScore'>,
  ): Record<string, number> {
    const actionScores: Record<string, number> = {};
    Object.entries(actions).forEach(([actionKey, actionAttributes]) => {
      let score = banditModel.defaultActionScore;
      const coefficients = banditModel.coefficients[actionKey];
      if (coefficients) {
        score = coefficients.intercept;
        score += this.scoreNumericAttributes(
          coefficients.subjectNumericCoefficients,
          subjectAttributes,
        );
        score += this.scoreCategoricalAttributes(
          coefficients.subjectCategoricalCoefficients,
          subjectAttributes,
        );
        score += this.scoreNumericAttributes(
          coefficients.actionNumericCoefficients,
          actionAttributes,
        );
        score += this.scoreCategoricalAttributes(
          coefficients.actionCategoricalCoefficients,
          actionAttributes,
        );
      }
      actionScores[actionKey] = score;
    });
    return actionScores;
  }

  private scoreNumericAttributes(
    coefficients: BanditNumericAttributeCoefficients[],
    attributes: Attributes,
  ): number {
    return coefficients.reduce((score, numericCoefficients) => {
      const attributeValue = attributes[numericCoefficients.attributeKey];
      if (typeof attributeValue === 'number' && isFinite(attributeValue)) {
        score += attributeValue * numericCoefficients.coefficient;
      } else {
        score += numericCoefficients.missingValueCoefficient;
      }
      return score;
    }, 0);
  }

  private scoreCategoricalAttributes(
    coefficients: BanditCategoricalAttributeCoefficients[],
    attributes: Attributes,
  ): number {
    return coefficients.reduce((score, attributeCoefficients) => {
      const attributeValue = attributes[attributeCoefficients.attributeKey]?.toString();
      const applicableCoefficient =
        attributeValue && attributeCoefficients.valueCoefficients[attributeValue];

      score +=
        typeof applicableCoefficient === 'number'
          ? applicableCoefficient
          : attributeCoefficients.missingValueCoefficient;

      return score;
    }, 0);
  }

  private weighActions(
    actionScores: Record<string, number>,
    gamma: number,
    actionProbabilityFloor: number,
  ) {
    const actionWeights: Record<string, number> = {};
    Object.entries(actionScores).forEach(([actionKey, actionScore]) => {
      const weight = 0; // TODO: math
      actionWeights[actionKey] = weight;
    });
    return actionWeights;
  }

  private selectAction(
    flagKey: string,
    subjectKey: string,
    actionWeights: Record<string, number>,
  ): string {
    return Object.keys(actionWeights)[0]; // TODO: math
  }
}
