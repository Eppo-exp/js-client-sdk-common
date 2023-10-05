import * as fs from 'fs';

import { IExperimentConfiguration } from '../src/dto/experiment-configuration-dto';
import { IVariation } from '../src/dto/variation-dto';
import { IValue } from '../src/eppo_value';
import { getMD5Hash, encodeBase64Hash } from '../src/obfuscation';

export const TEST_DATA_DIR = './test/data/';
export const ASSIGNMENT_TEST_DATA_DIR = TEST_DATA_DIR + 'assignment-v2/';
const MOCK_RAC_FILENAME = 'rac-experiments-v3';
export const MOCK_RAC_RESPONSE_FILE = `${MOCK_RAC_FILENAME}.json`;
export const OBFUSCATED_MOCK_RAC_RESPONSE_FILE = `${MOCK_RAC_FILENAME}-obfuscated.json`;

export enum ValueTestType {
  BoolType = 'boolean',
  NumericType = 'numeric',
  StringType = 'string',
  JSONType = 'json',
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

export function readMockRacResponse(): { flags: Record<string, IExperimentConfiguration> } {
  return JSON.parse(fs.readFileSync(TEST_DATA_DIR + MOCK_RAC_RESPONSE_FILE, 'utf-8'));
}

export function readMockObfuscatedRacResponse(): {
  flags: Record<string, IExperimentConfiguration>;
} {
  return JSON.parse(fs.readFileSync(TEST_DATA_DIR + OBFUSCATED_MOCK_RAC_RESPONSE_FILE, 'utf-8'));
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

export function generateObfuscatedMockRac() {
  const rac = readMockRacResponse();
  const keys = Object.keys(rac.flags);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flagsCopy: Record<string, any> = {};
  keys.forEach((key) => {
    flagsCopy[getMD5Hash(key)] = rac.flags[key];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flagsCopy[getMD5Hash(key)].rules?.forEach((rule: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rule.conditions.forEach((condition: any) => {
        condition['value'] = ['ONE_OF', 'NOT_ONE_OF'].includes(condition['operator'])
          ? condition['value'].map((value: string) => getMD5Hash(value.toLowerCase()))
          : encodeBase64Hash(`${condition['value']}`);
        condition['operator'] = getMD5Hash(condition['operator']);
        condition['attribute'] = getMD5Hash(condition['attribute']);
      }),
    );
  });
  return { flags: flagsCopy };
}
