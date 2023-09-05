import * as fs from 'fs';

import { IExperimentConfiguration } from '../src/dto/experiment-configuration-dto';
import { IVariation } from '../src/dto/variation-dto';
import { IValue } from '../src/eppo_value';

export const TEST_DATA_DIR = './test/data/';
export const ASSIGNMENT_TEST_DATA_DIR = TEST_DATA_DIR + 'assignment-v2/';
export const MOCK_RAC_RESPONSE_FILE = 'rac-experiments-v3.json';

export enum ValueTestType {
  BoolType = 'boolean',
  NumericType = 'numeric',
  StringType = 'string',
}

export interface IAssignmentTestCase {
  experiment: string;
  valueType: ValueTestType;
  percentExposure: number;
  variations: IVariation[];
  subjects: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subjectsWithAttributes: { subjectKey: string; subjectAttributes: Record<string, any> }[];
  expectedAssignments: IValue[];
}

export function readMockRacResponse(): Record<string, IExperimentConfiguration> {
  return JSON.parse(fs.readFileSync(TEST_DATA_DIR + MOCK_RAC_RESPONSE_FILE, 'utf-8'));
}

export function readAssignmentTestData(): IAssignmentTestCase[] {
  const testCaseData: IAssignmentTestCase[] = [];
  const testCaseFiles = fs.readdirSync(ASSIGNMENT_TEST_DATA_DIR);
  testCaseFiles.forEach((file) => {
    const testCase = JSON.parse(fs.readFileSync(ASSIGNMENT_TEST_DATA_DIR + file, 'utf8'));
    testCaseData.push(testCase);
  });
  return testCaseData;
}
