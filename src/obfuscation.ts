import * as md5 from 'md5';

export function getMD5Hash(input: string): string {
  return md5(input);
}

export function encodeBase64Hash(input: string): string {
  return Buffer.from(input).toString('base64');
}

export function decodeBase64Hash(input: string): string {
  return Buffer.from(input, 'base64').toString('utf8');
}
