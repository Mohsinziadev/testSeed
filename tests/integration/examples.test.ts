import { describe, expect, it } from "vitest";
import { run as api } from "../../examples/api/index.js";
import { run as basic } from "../../examples/basic/index.js";
import { run as relational } from "../../examples/relational/index.js";
import { run as schemaDriven } from "../../examples/schema-driven/index.js";

describe("examples run against the real implementation", () => {
  it("basic", () => {
    const r = basic();
    expect(r.users.map((u) => u.id)).toEqual([1, 2, 3]);
    expect(r.alex).toMatchObject({ name: "Alex Morgan", age: 32 });
    expect(r.admin.role).toBe("admin");
    expect(basic()).toEqual(r);
  });

  it("schema-driven: Zod agrees with every generated and edge value", () => {
    const r = schemaDriven();
    expect(r.allPassZod).toBe(true);
    expect(r.zodAgrees).toBe(true);
    expect(r.caseCount).toBeGreaterThan(20);
  });

  it("relational: integrity holds and items belong to real orders/products", () => {
    const d = relational();
    const orders = new Set(d.orders.map((o) => o.id));
    const products = new Set(d.products.map((p) => p.id));
    expect(d.items.length).toBeGreaterThanOrEqual(40);
    expect(d.items.every((i) => orders.has(i.orderId as number) && products.has(i.productId as number))).toBe(true);
    expect(d.orders.every((o) => d.items.some((i) => i.orderId === o.id))).toBe(true);
  });

  it("api: the example validator matches the schema on all boundary cases", () => {
    const r = api();
    expect(r.schemaAgrees).toBe(true);
    expect(r.disagreements).toEqual([]);
  });
});
