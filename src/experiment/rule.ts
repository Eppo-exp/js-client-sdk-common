export type AttributeValueType = string | number;

export enum OperatorType {
  MATCHES = 'MATCHES',
  GTE = 'GTE',
  GT = 'GT',
  LTE = 'LTE',
  LT = 'LT',
}

export interface Condition {
  operator: OperatorType;
  attribute: string;
  value: AttributeValueType;
}

export interface Rule {
  conditions: Condition[];
}
