import base64 = require('js-base64');
import * as md5 from 'md5';

export function getMD5Hash(input: string): string {
  return md5(input);
}

export function encodeBase64(input: string) {
  return base64.btoaPolyfill(input);
}

export function decodeBase64(input: string) {
  return base64.atobPolyfill(input);
}
