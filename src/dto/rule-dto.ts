export enum OperatorType {
  MATCHES = 'MATCHES',
  GTE = 'GTE',
  GT = 'GT',
  LTE = 'LTE',
  LT = 'LT',
  ONE_OF = 'ONE_OF',
  NOT_ONE_OF = 'NOT_ONE_OF',
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
