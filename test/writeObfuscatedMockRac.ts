import * as fs from 'fs';

import {
  OBFUSCATED_MOCK_RAC_RESPONSE_FILE,
  TEST_DATA_DIR,
  generateObfuscatedMockRac,
} from './testHelpers';

const obfuscatedRacFilePath = TEST_DATA_DIR + OBFUSCATED_MOCK_RAC_RESPONSE_FILE;
const obfuscatedRac = generateObfuscatedMockRac();
fs.writeFileSync(obfuscatedRacFilePath, JSON.stringify(obfuscatedRac, null, 2));
