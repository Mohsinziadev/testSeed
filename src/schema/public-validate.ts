import type { Issue } from "../errors.js";
import type { Schema } from "./builder.js";
import { validateNode } from "./validate.js";

/** Check a value against a TestSeed schema. Returns every violation (empty array: valid). Never echoes the value. */
export function validate(schema: Schema<unknown>, value: unknown): Issue[] {
  return validateNode(schema.node, value);
}
