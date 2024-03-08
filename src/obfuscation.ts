import * as md5 from 'md5';
import { decode, encode } from 'universal-base64';

export function getMD5Hash(input: string): string {
  return md5(input);
}

export function encodeBase64(input: string) {
  return encode(input);
}

export function decodeBase64(input: string) {
  return decode(input);
}
