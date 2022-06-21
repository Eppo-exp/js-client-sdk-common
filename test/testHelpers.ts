import * as fs from 'fs';

import { IVariation } from '../src/experiment/variation';

export const TEST_DATA_DIR = './test/assignmentTestData/';

export interface IAssignmentTestCase {
  experiment: string;
  percentExposure: number;
  variations: IVariation[];
  subjects: string[];
  expectedAssignments: string[];
}

export function readAssignmentTestData(): IAssignmentTestCase[] {
  const testDataDir = './test/assignmentTestData/';
  const testCaseData: IAssignmentTestCase[] = [];
  const testCaseFiles = fs.readdirSync(testDataDir);
  testCaseFiles.forEach((file) => {
    const testCase = JSON.parse(fs.readFileSync(testDataDir + file, 'utf8'));
    testCaseData.push(testCase);
  });
  return testCaseData;
}
