import { VariationType } from './interfaces';
import { getMD5Hash } from './obfuscation';

export enum EppoValueType {
  NullType,
  BoolType,
  NumericType,
  StringType,
  JSONType,
}

export type IValue = boolean | number | string;

export class EppoValue {
  public valueType: EppoValueType;
  public boolValue: boolean | undefined;
  public numericValue: number | undefined;
  public stringValue: string | undefined;
  public objectValue: object | undefined;

  private constructor(
    valueType: EppoValueType,
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

  static valueOf(value: boolean | number | string | object, valueType: VariationType): EppoValue {
    if (value == null) {
      return EppoValue.Null();
    }
    switch (valueType) {
      case VariationType.BOOLEAN:
        return EppoValue.Bool(value as boolean);
      case VariationType.NUMERIC:
        return EppoValue.Numeric(value as number);
      case VariationType.INTEGER:
        return EppoValue.Numeric(value as number);
      case VariationType.STRING:
        return EppoValue.String(value as string);
      case VariationType.JSON:
        return EppoValue.JSON(value as object);
      default:
        return EppoValue.String(value as string);
    }
  }

  toString(): string {
    switch (this.valueType) {
      case EppoValueType.NullType:
        return 'null';
      case EppoValueType.BoolType:
        return this.boolValue ? 'true' : 'false';
      case EppoValueType.NumericType:
        return this.numericValue ? this.numericValue.toString() : '0';
      case EppoValueType.StringType:
        return this.stringValue ?? '';
      case EppoValueType.JSONType:
        try {
          return JSON.stringify(this.objectValue) ?? '';
        } catch {
          return this.stringValue ?? '';
        }
    }
  }

  /**
   * Useful when storing or transmitting the entire value,
   * in particular the JsonType, is not desired.
   *
   * @returns MD5 hashed string of the value
   */
  toHashedString(): string {
    const value = this.toString();
    return getMD5Hash(value);
  }

  static Bool(value: boolean): EppoValue {
    return new EppoValue(EppoValueType.BoolType, value, undefined, undefined, undefined);
  }

  static Numeric(value: number): EppoValue {
    return new EppoValue(EppoValueType.NumericType, undefined, value, undefined, undefined);
  }

  static String(value: string): EppoValue {
    return new EppoValue(EppoValueType.StringType, undefined, undefined, value, undefined);
  }

  static JSON(value: string | object): EppoValue {
    return new EppoValue(
      EppoValueType.JSONType,
      undefined,
      undefined,
      undefined,
      typeof value === 'string' ? JSON.parse(value) : value,
    );
  }

  static Null(): EppoValue {
    return new EppoValue(EppoValueType.NullType, undefined, undefined, undefined, undefined);
  }
}
