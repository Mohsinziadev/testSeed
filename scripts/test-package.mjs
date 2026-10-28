// Packs the library, installs the tarball into a throwaway project and exercises the public entry points
// as a consumer would: ESM import, CommonJS require, TypeScript (NodeNext ESM + CJS), file allowlist, secrets scan.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failures.push(name);
};

const work = mkdtempSync(join(tmpdir(), "seedset-pack-"));
try {
  // 1. Pack and inspect the file list.
  const packJson = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", work], root));
  const [info] = packJson;
  const files = info.files.map((f) => f.path);
  const allowed = [/^dist\//, /^README\.md$/, /^LICENSE$/, /^CHANGELOG\.md$/, /^package\.json$/];
  check(
    "only allowlisted files are packed",
    files.every((f) => allowed.some((re) => re.test(f))),
    files.join(", "),
  );
  check("no source, tests or config are packed", !files.some((f) => /^(src|tests|benchmarks|scripts|\.github|\.env)/.test(f)));
  for (const required of ["dist/index.js", "dist/index.cjs", "dist/index.d.ts", "dist/index.d.cts", "README.md", "LICENSE"]) {
    check(`contains ${required}`, files.includes(required));
  }
  console.log(`     tarball: ${info.size} bytes packed, ${info.unpackedSize} bytes unpacked, ${files.length} files`);

  // 2. Install into a fresh project.
  const proj = join(work, "consumer");
  mkdirSync(proj);
  writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", join(work, info.filename), "typescript@~6.0", "@types/node@22", "zod"], proj);
  const installed = JSON.parse(readFileSync(join(proj, "node_modules/seedset/package.json"), "utf8"));
  check("zero runtime dependencies", Object.keys(installed.dependencies ?? {}).length === 0);
  check("no peer dependencies required", Object.keys(installed.peerDependencies ?? {}).length === 0);

  // 3. ESM consumer.
  const program = `
    const seed = createSeed({ seed: 42 });
    const user = seed.factory({ id: (_g, c) => c.sequence, name: (g) => g.person.fullName(), age: t.int({ min: 18, max: 80 }) }, { name: "user" });
    const a = seed.generate(user, 3);
    const b = createSeed({ seed: 42 }).generate(user, 3);
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("not deterministic");
    const ds = seed.dataset({ users: { factory: user, count: 3 }, orders: { factory: seed.factory({ id: (_g, c) => c.sequence }, { name: "o" }), count: 5, refs: { userId: { to: "users" } } } });
    if (!ds.orders.every((o) => ds.users.some((u) => u.id === o.userId))) throw new Error("referential integrity");
    const cases = seed.edgeCases(t.int({ min: 1, max: 3 }));
    if (!cases.some((c) => !c.valid) || !cases.some((c) => c.valid)) throw new Error("edge cases");
    const s = fromJsonSchema(z.toJSONSchema(z.object({ n: z.number().int().min(1) }), { io: "input" }));
    if (validate(s, seed.sample(s)).length) throw new Error("json schema");
    if (typeof VERSION !== "string") throw new Error("VERSION");
    console.log(JSON.stringify(a[0]));
  `;
  writeFileSync(
    join(proj, "esm.mjs"),
    `import { createSeed, t, fromJsonSchema, validate, VERSION } from "seedset";\nimport { z } from "zod";\n${program}`,
  );
  const esmOut = run("node", ["esm.mjs"], proj).trim();
  check("ESM import works", esmOut.startsWith("{"), esmOut);

  // 4. CommonJS consumer.
  writeFileSync(
    join(proj, "cjs.cjs"),
    `const { createSeed, t, fromJsonSchema, validate, VERSION } = require("seedset");\nconst { z } = require("zod");\n${program}`,
  );
  const cjsOut = run("node", ["cjs.cjs"], proj).trim();
  check("CommonJS require works", cjsOut === esmOut, `${cjsOut} vs ${esmOut}`);
  check("ESM and CJS produce identical seeded output", cjsOut === esmOut);

  // 5. Exports map: package.json subpath allowed, internals not reachable.
  try {
    run("node", ["-e", "import('seedset/dist/index.js').then(()=>process.exit(0),()=>process.exit(3))"], proj);
    check("deep imports are blocked by the exports map", false);
  } catch {
    check("deep imports are blocked by the exports map", true);
  }

  // 6. TypeScript consumers, both module systems, strict.
  const tsconfig = (module, moduleResolution) => ({
    compilerOptions: { strict: true, noEmit: true, module, moduleResolution, target: "ES2022", skipLibCheck: false, types: ["node"] },
    include: ["*.ts"],
  });
  const tsSource = `
    import { createSeed, t } from "seedset";
    import type { Infer, EdgeCase } from "seedset";
    const seed = createSeed({ seed: 1 });
    const f = seed.factory({ id: (_g, c) => c.sequence, name: (g) => g.person.fullName() }, { traits: { vip: { name: "VIP" } } });
    const u: { id: number; name: string } = seed.build(f, { name: "x" }, { traits: ["vip"] });
    const schema = t.object({ a: t.string(), b: t.int().optional() });
    const v: Infer<typeof schema> = seed.sample(schema);
    const cases: EdgeCase<{ a: string; b?: number | undefined }>[] = seed.edgeCases(schema);
    // @ts-expect-error unknown override
    seed.build(f, { nope: 1 });
    void u; void v; void cases;
  `;
  for (const [label, module, moduleResolution, ext] of [
    ["TypeScript (NodeNext, ESM)", "NodeNext", "NodeNext", "mts"],
    ["TypeScript (NodeNext, CJS)", "NodeNext", "NodeNext", "cts"],
  ]) {
    const dir = join(work, `ts-${ext}`);
    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "c", private: true, type: ext === "mts" ? "module" : "commonjs" }));
    writeFileSync(join(dir, `main.${ext}`), tsSource);
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ ...tsconfig(module, moduleResolution), include: [`main.${ext}`] }));
    rmSync(join(dir, "node_modules"), { recursive: true, force: true });
    mkdirSync(join(dir, "node_modules"));
    // Reuse the installed packages without reinstalling.
    for (const name of readdirSync(join(proj, "node_modules"))) {
      try {
        run("ln", ["-s", join(proj, "node_modules", name), join(dir, "node_modules", name)], dir);
      } catch {
        /* scoped dirs handled below */
      }
    }
    try {
      run(join(proj, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], dir);
      check(`${label} compiles against shipped types`, true);
    } catch (error) {
      check(`${label} compiles against shipped types`, false, String(error.stdout ?? error));
    }
  }

  // 7. Secrets scan of the tarball contents.
  const unpacked = join(work, "unpacked");
  mkdirSync(unpacked);
  run("tar", ["-xzf", join(work, info.filename), "-C", unpacked], work);
  const secretPattern = /(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|npm_[A-Za-z0-9]{36}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{32,})/;
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const leaked = walk(unpacked).filter((f) => secretPattern.test(readFileSync(f, "utf8")));
  check("no secrets found in the packed files", leaked.length === 0, leaked.join(", "));
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} package check(s) failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("\nAll package checks passed.");
