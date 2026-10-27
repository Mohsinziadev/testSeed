import { describe, expect, it } from "vitest";
import { ALGORITHM_VERSION, createSeed, t } from "../../src/index.js";

/**
 * Golden outputs pin the seeded algorithm. If one of these fails you changed seeded output:
 * that is a breaking change (see docs/API-DESIGN.md, "Reproducibility guarantee") and requires
 * bumping ALGORITHM_VERSION and the major version (minor while 0.x).
 */
describe("golden output (algorithm v1)", () => {
  it("algorithm version", () => {
    expect(ALGORITHM_VERSION).toBe(1);
  });

  it("ad-hoc generators", () => {
    const s = createSeed({ seed: 42 });
    expect({
      name: s.person.fullName(),
      email: s.internet.email(),
      int: s.number.int({ min: 1, max: 1000 }),
      uuid: s.uuid(),
      iso: s.date.iso(),
      phone: s.phone.number(),
      addr: s.location.address(),
    }).toMatchInlineSnapshot(`
      {
        "addr": {
          "city": "Springfield",
          "country": "Japan",
          "postalCode": "50937",
          "region": "West",
          "street": "825 Willow Drive",
        },
        "email": "liam_4515@example.net",
        "int": 36,
        "iso": "2003-04-03T03:44:35.266Z",
        "name": "Jade Zhang",
        "phone": "+1-502-555-0173",
        "uuid": "df03268f-b361-4e8e-b4e4-dbcc2837957a",
      }
    `);
  });

  it("factory records", () => {
    const s = createSeed({ seed: "golden" });
    const f = s.factory(
      { id: (_g, c) => c.sequence, name: (g) => g.person.fullName(), age: t.int({ min: 18, max: 80 }) },
      { name: "user" },
    );
    expect(s.generate(f, 3)).toMatchInlineSnapshot(`
      [
        {
          "age": 57,
          "id": 1,
          "name": "Nia Novak",
        },
        {
          "age": 54,
          "id": 2,
          "name": "Amara Haddad",
        },
        {
          "age": 33,
          "id": 3,
          "name": "Elena Davies",
        },
      ]
    `);
  });

  it("schema values", () => {
    const s = createSeed({ seed: 7 });
    const schema = t.object({
      a: t.string({ maxLength: 6 }),
      b: t.array(t.int({ min: 0, max: 9 }), { max: 4 }),
      c: t.enum(["x", "y"]).nullable(),
    });
    expect(s.generate(schema, 3)).toMatchInlineSnapshot(`
      [
        {
          "a": "ieva3",
          "b": [
            8,
          ],
          "c": "x",
        },
        {
          "a": "ym9",
          "b": [
            7,
            6,
          ],
          "c": "y",
        },
        {
          "a": "",
          "b": [
            8,
            2,
            1,
            0,
          ],
          "c": "x",
        },
      ]
    `);
  });

  it("dataset", () => {
    const s = createSeed({ seed: 1 });
    const u = s.factory({ id: (_g, c) => c.sequence }, { name: "u" });
    const o = s.factory({ id: (_g, c) => c.sequence }, { name: "o" });
    expect(s.dataset({ u: { factory: u, count: 3 }, o: { factory: o, count: 6, refs: { uid: { to: "u" } } } })).toMatchInlineSnapshot(`
      {
        "o": [
          {
            "id": 1,
            "uid": 1,
          },
          {
            "id": 2,
            "uid": 3,
          },
          {
            "id": 3,
            "uid": 2,
          },
          {
            "id": 4,
            "uid": 2,
          },
          {
            "id": 5,
            "uid": 2,
          },
          {
            "id": 6,
            "uid": 3,
          },
        ],
        "u": [
          {
            "id": 1,
          },
          {
            "id": 2,
          },
          {
            "id": 3,
          },
        ],
      }
    `);
  });
});
