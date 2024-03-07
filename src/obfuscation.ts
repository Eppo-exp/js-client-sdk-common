import * as md5 from 'md5';

export function getMD5Hash(input: string): string {
  return md5(input);
}

function base64ToBytes(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString);
}

export function encodeBase64(input: string): string {
  return bytesToBase64(new TextEncoder().encode(input));
}

export function decodeBase64(input: string): string {
  return new TextDecoder().decode(base64ToBytes(input));
}
