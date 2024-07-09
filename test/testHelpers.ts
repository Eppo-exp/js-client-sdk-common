import * as fs from 'fs';

import { AttributeType, VariationType } from '../src';
import { IAssignmentDetails } from '../src/client/eppo-client';
import { IBanditParametersResponse, IUniversalFlagConfigResponse } from '../src/http-client';
import { ContextAttributes } from '../src/types';

export const TEST_DATA_DIR = './test/data/ufc/';
export const ASSIGNMENT_TEST_DATA_DIR = TEST_DATA_DIR + 'tests/';
export const BANDIT_TEST_DATA_DIR = TEST_DATA_DIR + 'bandit-tests/';
const MOCK_UFC_FILENAME = 'flags-v1';
export const MOCK_UFC_RESPONSE_FILE = `${MOCK_UFC_FILENAME}.json`;
export const MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE = `bandit-flags-v1.json`;
export const MOCK_BANDIT_MODELS_RESPONSE_FILE = `bandit-models-v1.json`;
export const OBFUSCATED_MOCK_UFC_RESPONSE_FILE = `${MOCK_UFC_FILENAME}-obfuscated.json`;
export interface SubjectTestCase {
  subjectKey: string;
  subjectAttributes: Record<string, AttributeType>;
  assignment: string | number | boolean | object;
  assignmentDetails: IAssignmentDetails<string | number | boolean | object>;
}

export interface IAssignmentTestCase {
  flag: string;
  variationType: VariationType;
  defaultValue: string | number | boolean | object;
  subjects: SubjectTestCase[];
}

export interface BanditTestCase {
  flag: string;
  defaultValue: string;
  subjects: BanditTestCaseSubject[];
}

interface BanditTestCaseSubject {
  subjectKey: string;
  subjectAttributes: ContextAttributes;
  actions: BanditTestCaseAction[];
  assignment: { variation: string; action: string | null };
}

interface BanditTestCaseAction extends ContextAttributes {
  actionKey: string;
}

export function readMockUFCResponse(
  filename: string,
): IUniversalFlagConfigResponse | IBanditParametersResponse {
  return JSON.parse(fs.readFileSync(TEST_DATA_DIR + filename, 'utf-8'));
}

export function testCasesByFileName<T>(testDirectory: string): Record<string, T> {
  const testCasesWithFileName: Array<T & { fileName: string }> = fs
    .readdirSync(testDirectory)
    .map((fileName) => ({
      ...JSON.parse(fs.readFileSync(testDirectory + fileName, 'utf8')),
      fileName,
    }));
  if (!testCasesWithFileName.length) {
    throw new Error('No test cases at ' + testDirectory);
  }
  const mappedTestCase: Record<string, T> = {};
  testCasesWithFileName.forEach((testCaseWithFileName) => {
    mappedTestCase[testCaseWithFileName.fileName] = testCaseWithFileName;
  });

  return mappedTestCase;
}

export function getTestAssignments(
  testCase: IAssignmentTestCase,
  assignmentFn: (
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: string | number | boolean | object,
  ) => never,
): { subject: SubjectTestCase; assignment: string | boolean | number | null | object }[] {
  const assignments: {
    subject: SubjectTestCase;
    assignment: string | boolean | number | null | object;
  }[] = [];
  for (const subject of testCase.subjects) {
    const assignment = assignmentFn(
      testCase.flag,
      subject.subjectKey,
      subject.subjectAttributes,
      testCase.defaultValue,
    );
    assignments.push({ subject, assignment });
  }
  return assignments;
}

export function getTestAssignmentDetails(
  testCase: IAssignmentTestCase,
  assignmentDetailsFn: (
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: string | number | boolean | object,
  ) => never,
): {
  subject: SubjectTestCase;
  assignmentDetails: IAssignmentDetails<string | boolean | number | object>;
}[] {
  return testCase.subjects.map((subject) => ({
    subject,
    assignmentDetails: assignmentDetailsFn(
      testCase.flag,
      subject.subjectKey,
      subject.subjectAttributes,
      testCase.defaultValue,
    ),
  }));
}

export function validateTestAssignments(
  assignments: {
    subject: SubjectTestCase;
    assignment: string | boolean | number | object | null;
  }[],
  flag: string,
) {
  for (const { subject, assignment } of assignments) {
    if (typeof assignment !== 'object') {
      // the expect works well for objects, but this comparison does not
      if (assignment !== subject.assignment) {
        throw new Error(
          `subject ${
            subject.subjectKey
          } was assigned ${assignment?.toString()} when expected ${subject.assignment?.toString()} for flag ${flag}`,
        );
      }
    }
    expect(subject.assignment).toEqual(assignment);
  }
}

export function validateTestAssignmentDetails(
  assignments: {
    subject: SubjectTestCase;
    assignmentDetails: IAssignmentDetails<string | boolean | number | object>;
  }[],
  flag: string,
) {
  for (const { subject, assignmentDetails } of assignments) {
    try {
      expect(assignmentDetails).toMatchObject({
        ...subject.assignmentDetails,
        configFetchedAt: expect.any(String),
        configPublishedAt: expect.any(String),
      });
    } catch (err) {
      err.message = `The assignment details for subject ${subject.subjectKey} did not match the expected value for flag ${flag}. ${err.message}`;
      throw err;
    }
  }
}
