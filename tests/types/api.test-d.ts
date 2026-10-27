import { describe, expectTypeOf, it } from "vitest";
import { createSeed, t } from "../../src/index.js";
import type { EdgeCase, Infer } from "../../src/index.js";

const seed = createSeed({ seed: 1 });

describe("type inference", () => {
  const user = seed.factory(
    {
      id: (_g, ctx) => ctx.sequence,
      name: (g) => g.person.fullName(),
      age: t.int({ min: 18, max: 80 }),
      role: "user" as string,
      tags: t.array(t.string()),
    },
    { traits: { admin: { role: "admin" }, minor: { age: 17 } } },
  );

  it("infers the built object type from functions, schemas and constants", () => {
    const u = seed.build(user);
    expectTypeOf(u).toEqualTypeOf<{ id: number; name: string; age: number; role: string; tags: string[] }>();
    expectTypeOf(seed.generate(user, 2)).toEqualTypeOf<{ id: number; name: string; age: number; role: string; tags: string[] }[]>();
  });

  it("checks overrides at compile time", () => {
    seed.build(user, { name: "Alex", age: 32 });
    // @ts-expect-error unknown field
    seed.build(user, { nme: "x" });
    // @ts-expect-error wrong value type
    seed.build(user, { age: "32" });
  });

  it("checks trait names at compile time", () => {
    seed.build(user, {}, { traits: ["admin"] });
    // @ts-expect-error unknown trait
    seed.build(user, {}, { traits: ["root"] });
  });

  it("checks trait field value types", () => {
    // @ts-expect-error role must be a string
    seed.factory({ role: "user" as string }, { traits: { bad: { role: 1 } } });
  });
});

describe("schema inference", () => {
  const schema = t.object({
    a: t.string(),
    b: t.int().optional(),
    c: t.enum(["x", "y"]).nullable(),
    d: t.array(t.object({ e: t.boolean() })),
    f: t.union([t.int(), t.literal("z")]),
    g: t.date(),
  });

  it("makes optional properties optional and keeps literals", () => {
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<{
      a: string;
      b?: number | undefined;
      c: "x" | "y" | null;
      d: { e: boolean }[];
      f: number | "z";
      g: Date;
    }>();
  });

  it("sample/generate/edgeCases are typed from the schema", () => {
    expectTypeOf(seed.sample(schema).c).toEqualTypeOf<"x" | "y" | null>();
    expectTypeOf(seed.generate(t.int(), 3)).toEqualTypeOf<number[]>();
    expectTypeOf(seed.edgeCases(t.int())).toEqualTypeOf<EdgeCase<number>[]>();
  });

  it("optional schemas are only accepted by t.object", () => {
    // @ts-expect-error an optional schema cannot be an array element
    t.array(t.string().optional());
  });
});

describe("dataset typing", () => {
  it("adds reference fields to rows", () => {
    const parent = seed.factory({ id: (_g, c) => c.sequence });
    const child = seed.factory({ title: "t" as string });
    const ds = seed.dataset({
      parents: { factory: parent, count: 1 },
      children: {
        factory: child,
        count: 1,
        refs: {
          parentId: { to: "parents" },
          optionalId: { to: "parents", nullable: 0.5 },
          many: { to: "parents", many: { min: 1, max: 2 } },
        },
      },
    });
    expectTypeOf(ds.parents[0]!.id).toEqualTypeOf<number>();
    expectTypeOf(ds.children[0]!.title).toEqualTypeOf<string>();
    expectTypeOf(ds.children[0]!.parentId).toEqualTypeOf<string | number>();
    expectTypeOf(ds.children[0]!.optionalId).toEqualTypeOf<string | number | null>();
    expectTypeOf(ds.children[0]!.many).toEqualTypeOf<(string | number)[]>();
  });
});

describe("edge case typing", () => {
  it("narrows on `valid`", () => {
    for (const c of seed.edgeCases(t.int())) {
      if (c.valid) expectTypeOf(c.value).toEqualTypeOf<number>();
      else expectTypeOf(c.value).toEqualTypeOf<unknown>();
    }
  });
});
