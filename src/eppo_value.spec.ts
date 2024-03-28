import { EppoValue } from './eppo_value';

describe('EppoValue toHashedString function', () => {
  it('is NullType', () => {
    const myInstance = EppoValue.Null();
    expect(myInstance.toHashedString()).toBe('37a6259cc0c1dae299a7866489dff0bd');
  });

  it('is JsonType', () => {
    const myInstance = EppoValue.JSON({ hello: 'world' });
    expect(myInstance.toHashedString()).toBe('fbc24bcc7a1794758fc1327fcfebdaf6');
  });
});

describe('EppoValue toString function', () => {
  it('should return "null" when valueType is NullType', () => {
    const myInstance = EppoValue.Null();
    expect(myInstance.toString()).toBe('null');
  });

  it('should return "true" when valueType is BoolType and boolValue is true', () => {
    const myInstance = EppoValue.Bool(true);
    expect(myInstance.toString()).toBe('true');
  });

  it('should return "false" when valueType is BoolType and boolValue is false', () => {
    const myInstance = EppoValue.Bool(false);
    expect(myInstance.toString()).toBe('false');
  });

  it('should return "42" when valueType is NumericType and numericValue is 42', () => {
    const myInstance = EppoValue.Numeric(42);
    expect(myInstance.toString()).toBe('42');
  });

  it('should return "hello" when valueType is StringType and stringValue is "hello"', () => {
    const myInstance = EppoValue.String('hello');
    expect(myInstance.toString()).toBe('hello');
  });
});
