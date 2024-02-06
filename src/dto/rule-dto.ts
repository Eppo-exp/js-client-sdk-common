export enum OperatorType {
  MATCHES = 'MATCHES',
  GTE = 'GTE',
  GT = 'GT',
  LTE = 'LTE',
  LT = 'LT',
  ONE_OF = 'ONE_OF',
  NOT_ONE_OF = 'NOT_ONE_OF',
}

export enum OperatorValueType {
  PLAIN_STRING = 'PLAIN_STRING',
  STRING_ARRAY = 'STRING_ARRAY',
  SEM_VER = 'SEM_VER',
  NUMERIC = 'NUMERIC',
}

export interface Condition {
  operator: OperatorType;
  attribute: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

export interface IRule {
  allocationKey: string;
  conditions: Condition[];
}
