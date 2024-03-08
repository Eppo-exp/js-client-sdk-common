import * as md5 from 'md5';

export function getMD5Hash(input: string): string {
  return md5(input);
}

function base64ToBytes(base64: string) {
  // Universal base64 decoding that works in Node.js and browsers.
  let raw;
  if (typeof window !== 'undefined' && 'atob' in window) {
    raw = atob(base64);
  } else {
    raw = Buffer.from(base64, 'base64').toString('binary');
  }

  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  // Universal base64 encoding that works in Node.js and browsers.
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  if (typeof window !== 'undefined' && 'btoa' in window) {
    return btoa(binary);
  } else {
    return Buffer.from(binary, 'binary').toString('base64');
  }
}

export function encodeBase64(input: string) {
  // Universal string to base64 encoding.
  let bytes;
  if (typeof TextEncoder !== 'undefined') {
    bytes = new TextEncoder().encode(input);
  } else {
    // For Node.js environment where TextEncoder might not be available.
    bytes = new Uint8Array(Buffer.from(input));
  }

  return bytesToBase64(bytes);
}

export function decodeBase64(input: string) {
  // Universal base64 to string decoding.
  const bytes = base64ToBytes(input);
  let result;
  if (typeof TextDecoder !== 'undefined') {
    result = new TextDecoder().decode(bytes);
  } else {
    // For Node.js environment where TextDecoder might not be available.
    result = Buffer.from(bytes).toString();
  }

  return result;
}
