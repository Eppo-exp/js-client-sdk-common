export enum ValueType {
  NullType,
  BoolType,
  NumericType,
  StringType,
  JSONType,
}

export type IValue = boolean | number | string | undefined;

export class EppoValue {
  public valueType: ValueType;
  public boolValue: boolean | undefined;
  public numericValue: number | undefined;
  public stringValue: string | undefined;
  public objectValue: object | undefined;

  private constructor(
    valueType: ValueType,
    boolValue: boolean | undefined,
    numericValue: number | undefined,
    stringValue: string | undefined,
    objectValue: object | undefined,
  ) {
    this.valueType = valueType;
    this.boolValue = boolValue;
    this.numericValue = numericValue;
    this.stringValue = stringValue;
    this.objectValue = objectValue;
  }

  static generateEppoValue(
    expectedValueType?: ValueType,
    value?: string,
    typedValue?: boolean | number | string | object,
  ): EppoValue {
    if (value != null && typedValue != null) {
      switch (expectedValueType) {
        case ValueType.BoolType:
          return EppoValue.Bool(typedValue as boolean);
        case ValueType.NumericType:
          return EppoValue.Numeric(typedValue as number);
        case ValueType.StringType:
          return EppoValue.String(typedValue as string);
        case ValueType.JSONType:
          return EppoValue.JSON(value, typedValue as object);
        default:
          return EppoValue.String(value as string);
      }
    }
    return EppoValue.Null();
  }

  toString(): string {
    switch (this.valueType) {
      case ValueType.NullType:
        return 'null';
      case ValueType.BoolType:
        return this.boolValue ? 'true' : 'false';
      case ValueType.NumericType:
        return this.numericValue ? this.numericValue.toString() : '0';
      case ValueType.StringType:
        return this.stringValue ?? '';
      case ValueType.JSONType:
        try {
          return JSON.stringify(this.objectValue) ?? '';
        } catch {
          return this.stringValue ?? '';
        }
    }
  }

  isExpectedType(): boolean {
    switch (this.valueType) {
      case ValueType.BoolType:
        return typeof this.boolValue === 'boolean';
      case ValueType.NumericType:
        return typeof this.numericValue === 'number';
      case ValueType.StringType:
        return typeof this.stringValue === 'string';
      case ValueType.JSONType:
        try {
          return (
            typeof this.objectValue === 'object' &&
            typeof this.stringValue === 'string' &&
            JSON.stringify(JSON.parse(this.stringValue)) === JSON.stringify(this.objectValue)
          );
        } catch {
          return false;
        }
      case ValueType.NullType:
        return false;
    }
  }

  isNullType(): boolean {
    return this.valueType === ValueType.NullType;
  }

  static Bool(value: boolean): EppoValue {
    return new EppoValue(ValueType.BoolType, value, undefined, undefined, undefined);
  }

  static Numeric(value: number): EppoValue {
    return new EppoValue(ValueType.NumericType, undefined, value, undefined, undefined);
  }

  static String(value: string): EppoValue {
    return new EppoValue(ValueType.StringType, undefined, undefined, value, undefined);
  }

  static JSON(value: string, typedValue: object): EppoValue {
    return new EppoValue(ValueType.JSONType, undefined, undefined, value, typedValue);
  }

  static Null(): EppoValue {
    return new EppoValue(ValueType.NullType, undefined, undefined, undefined, undefined);
  }
}
