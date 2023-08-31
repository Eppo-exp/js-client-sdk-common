export enum ValueType {
  NullType,
  BoolType,
  NumericType,
  StringType,
}

export type IValue = boolean | number | string | undefined;

export class EppoValue {
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

  static Bool(value: boolean): EppoValue {
    return new EppoValue(ValueType.BoolType, value, undefined, undefined);
  }

  static Numeric(value: number): EppoValue {
    return new EppoValue(ValueType.NumericType, undefined, value, undefined);
  }

  static String(value: string): EppoValue {
    return new EppoValue(ValueType.StringType, undefined, undefined, value);
  }
}
