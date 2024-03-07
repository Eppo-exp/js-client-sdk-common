import { decodeBase64, encodeBase64 } from './obfuscation';

describe('obfuscation', () => {
  it('encodes strings to base64', () => {
    expect(encodeBase64('5.0')).toEqual('NS4w');
  });

  it('decodes base64 to string', () => {
    expect(Number(decodeBase64('NS4w'))).toEqual(5);
  });

  it('encodes/decodes regex', () => {
    const regexes = [
      '.*@example.com',
      '.*@.*.com',
      '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
      '^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$', '\b(?:\d{1,3}\.){3}\d{1,3}\b',
      '\b\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])\b', '\b(?:\d[ -]*?){13,16}\b'
    ];

    regexes.forEach((regex) => {
      expect(decodeBase64(encodeBase64(regex))).toEqual(regex);
    })
  });
});
