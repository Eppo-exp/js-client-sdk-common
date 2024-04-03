import * as fs from 'fs';

import { Flag } from '../src/interfaces';
import { encodeBase64, getMD5Hash } from '../src/obfuscation';
import { Rule } from '../src/rules';

import {
  MOCK_UFC_RESPONSE_FILE,
  OBFUSCATED_MOCK_UFC_RESPONSE_FILE,
  readMockUFCResponse,
  TEST_DATA_DIR,
} from './testHelpers';

function obfuscateRule(rule: Rule) {
  return {
    ...rule,
    conditions: rule.conditions.map((condition) => ({
      ...condition,
      attribute: getMD5Hash(condition.attribute),
      operator: getMD5Hash(condition.operator),
      value:
        ['ONE_OF', 'NOT_ONE_OF'].includes(condition.operator) && typeof condition.value === 'object'
          ? condition.value.map((value) => getMD5Hash(value.toLowerCase()))
          : encodeBase64(`${condition.value}`),
    })),
  };
}

function obfuscateFlag(flag: Flag) {
  return {
    ...flag,
    key: getMD5Hash(flag.key),
    allocations: flag.allocations.map((allocation) => ({
      ...allocation,
      rules: allocation.rules.map(obfuscateRule),
    })),
  };
}

export function generateObfuscatedMockRac() {
  const ufc = readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);
  const keys = Object.keys(ufc.flags);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flagsCopy: Record<string, any> = {};
  keys.forEach((key) => {
    flagsCopy[getMD5Hash(key)] = obfuscateFlag(ufc.flags[key]);
  });
  return { flags: flagsCopy };
}

const obfuscatedRacFilePath = TEST_DATA_DIR + OBFUSCATED_MOCK_UFC_RESPONSE_FILE;
const obfuscatedRac = generateObfuscatedMockRac();
fs.writeFileSync(obfuscatedRacFilePath, JSON.stringify(obfuscatedRac, null, 2));
