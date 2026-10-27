/** Internal schema representation shared by the builder, JSON Schema import, generation, validation and edge cases. */

export type StringFormat = "email" | "uuid" | "url";

export interface StringNode {
  readonly kind: "string";
  readonly minLength: number;
  readonly maxLength: number | undefined;
  readonly format: StringFormat | undefined;
}
export interface NumberNode {
  readonly kind: "number";
  readonly integer: boolean;
  readonly min: number | undefined;
  readonly max: number | undefined;
}
export interface BooleanNode {
  readonly kind: "boolean";
}
export interface NullNode {
  readonly kind: "null";
}
export type LiteralValue = string | number | boolean | null;
export interface LiteralNode {
  readonly kind: "literal";
  readonly value: LiteralValue;
}
export interface EnumNode {
  readonly kind: "enum";
  readonly values: readonly (string | number)[];
}
export interface DateNode {
  readonly kind: "date";
  readonly min: number;
  readonly max: number;
  /** true: ISO-8601 UTC string. false: `Date` instance. */
  readonly iso: boolean;
}
export interface ArrayNode {
  readonly kind: "array";
  readonly item: Node;
  readonly minItems: number;
  readonly maxItems: number | undefined;
  readonly unique: boolean;
}
export interface Prop {
  readonly key: string;
  readonly node: Node;
  readonly optional: boolean;
}
export interface ObjectNode {
  readonly kind: "object";
  readonly props: readonly Prop[];
  /** When true, keys that are not declared are a violation. */
  readonly strict: boolean;
}
export interface NullableNode {
  readonly kind: "nullable";
  readonly inner: Node;
}
export interface UnionNode {
  readonly kind: "union";
  readonly options: readonly Node[];
}

export type Node =
  StringNode | NumberNode | BooleanNode | NullNode | LiteralNode | EnumNode | DateNode | ArrayNode | ObjectNode | NullableNode | UnionNode;

/** Safety limits applied to generation. */
export interface Limits {
  /** Max records for in-memory generation (generate, dataset). Default 1,000,000. */
  readonly maxCount: number;
  /** Max length of any generated array. Default 10,000. */
  readonly maxArrayLength: number;
  /** Max length (code points) of any generated string. Default 100,000. */
  readonly maxStringLength: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxCount: 1_000_000,
  maxArrayLength: 10_000,
  maxStringLength: 100_000,
};

/** Probability that an optional property is present / a nullable value is non-null. */
export const OPTIONAL_PRESENT_PROBABILITY = 0.8;
export const NULL_PROBABILITY = 0.15;
