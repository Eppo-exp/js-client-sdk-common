export enum ValueType {
  NullType,
  BoolType,
  NumericType,
  StringType,
}

export type IValue = boolean | number | string | undefined;

export class Value {
  public valueType: ValueType;
  public boolValue: boolean | undefined;
  public numericValue: number | undefined;
  public stringValue: string | undefined;

  constructor(
    valueType: ValueType,
    boolValue: boolean | undefined,
    numericValue: number | undefined,
    stringValue: string | undefined,
  ) {
    this.valueType = valueType;
    this.boolValue = boolValue;
    this.numericValue = numericValue;
    this.stringValue = stringValue;
  }

  isNull(): boolean {
    return this.valueType === ValueType.NullType;
  }

  static Null(): Value {
    return new Value(ValueType.NullType, undefined, undefined, undefined);
  }

  static Bool(value: boolean): Value {
    return new Value(ValueType.BoolType, value, undefined, undefined);
  }

  static Numeric(value: number): Value {
    return new Value(ValueType.NumericType, undefined, value, undefined);
  }

  static String(value: string): Value {
    return new Value(ValueType.StringType, undefined, undefined, value);
  }
}
