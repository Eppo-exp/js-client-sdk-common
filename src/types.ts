export type ValueType = string | number | boolean | JSON;
export type AttributeType = string | number | boolean;
export type ConditionValueType = AttributeType | AttributeType[];
export type Attributes = { [key: string]: AttributeType };
