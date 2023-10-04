import { createHash } from 'crypto';

export function getMD5Hash(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

export function getBase64Hash(input: string): string {
  return Buffer.from(input).toString('base64');
}
