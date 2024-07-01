export type ValueType = string | number | boolean | JSON;
export type AttributeType = string | number | boolean;
export type ConditionValueType = AttributeType | AttributeType[];
export type Attributes = { [key: string]: AttributeType };
export type BanditSubjectAttributes = Attributes | ContextAttributes;
export type ContextAttributes = {
  numericAttributes: Attributes;
  categoricalAttributes: Attributes;
};
export type BanditActions =
  | string[]
  | Record<string, Attributes>
  | Record<string, ContextAttributes>;
