import { createHash } from 'crypto';

export function getMD5Hash(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

export function encodeBase64Hash(input: string): string {
  return Buffer.from(input).toString('base64');
}

export function decodeBase64Hash(input: string): string {
  return Buffer.from(input, 'base64').toString('utf8');
}
