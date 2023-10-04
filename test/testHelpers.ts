import * as fs from 'fs';

import { IExperimentConfiguration } from '../src/dto/experiment-configuration-dto';
import { IVariation } from '../src/dto/variation-dto';
import { IValue } from '../src/eppo_value';
import { getMD5Hash, getBase64Hash } from '../src/obfuscation';

export const TEST_DATA_DIR = './test/data/';
export const ASSIGNMENT_TEST_DATA_DIR = TEST_DATA_DIR + 'assignment-v2/';
export const MOCK_RAC_RESPONSE_FILE = 'rac-experiments-v3.json';
export const OBFUSCATED_MOCK_RAC_RESPONSE_FILE = `obfuscated-${MOCK_RAC_RESPONSE_FILE}`;

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

export function readMockRacResponse(): Record<string, IExperimentConfiguration> {
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
        condition['operator'] = getMD5Hash(condition['operator']);
        condition['value'] =
          condition['operator'] in ['ONE_OF', 'NOT_ONE_OF']
            ? condition['value'].map((value: string) => getMD5Hash(value))
            : getBase64Hash(`${condition['value']}`);
        condition['attribute'] = getMD5Hash(condition['attribute']);
      }),
    );
  });
  return { flags: flagsCopy };
}

export function writeObfuscatedMockRacIfNotExists() {
  const obfuscatedRacFilePath = TEST_DATA_DIR + OBFUSCATED_MOCK_RAC_RESPONSE_FILE;
  try {
    fs.readFileSync(obfuscatedRacFilePath, 'utf8');
  } catch {
    const obfuscatedRac = generateObfuscatedMockRac();
    fs.writeFileSync(obfuscatedRacFilePath, JSON.stringify(obfuscatedRac, null, 2));
  }
}
