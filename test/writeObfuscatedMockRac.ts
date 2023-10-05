import * as fs from 'fs';

import { encodeBase64Hash, getMD5Hash } from '../src/obfuscation';

import {
  MOCK_RAC_RESPONSE_FILE,
  OBFUSCATED_MOCK_RAC_RESPONSE_FILE,
  TEST_DATA_DIR,
  readMockRacResponse,
} from './testHelpers';

export function generateObfuscatedMockRac() {
  const rac = readMockRacResponse(MOCK_RAC_RESPONSE_FILE);
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

const obfuscatedRacFilePath = TEST_DATA_DIR + OBFUSCATED_MOCK_RAC_RESPONSE_FILE;
const obfuscatedRac = generateObfuscatedMockRac();
fs.writeFileSync(obfuscatedRacFilePath, JSON.stringify(obfuscatedRac, null, 2));
