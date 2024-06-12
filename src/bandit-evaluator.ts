import { BanditModelData } from './interfaces';
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
    actions: Record<string, Attributes>,
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

  private scoreActions(subjectAttributes: Attributes, actions: Record<string, Attributes>, banditModel: BanditModelData): Record<string, number> {
    const actionScores: Record<string, number> = {};
    Object.entries(actions).forEach(([actionKey, actionAttributes]) => {
      const score = 0; // TODO: math
      actionScores[actionKey] = score;
    });
    return actionScores;
  }

  private weighActions(actionScores: Record<string, number>, gamma: number, actionProbabilityFloor: number) {
    const actionWeights: Record<string, number> = {};
    Object.entries(actionScores).forEach(([actionKey, actionScore]) => {
      const weight = 0; // TODO: math
      actionWeights[actionKey] = weight;
    });
    return actionWeights;
  }

  private selectAction(flagKey: string, subjectKey: string, actionWeights: Record<string, number>): string {
    return Object.keys(actionWeights)[0]; // TODO: math
  }
}