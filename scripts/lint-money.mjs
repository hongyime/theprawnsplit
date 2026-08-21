import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["core/src/money.ts", "core/src/settle.ts", "core/src/fold.ts", "src/db", "src/lib/events.ts", "src/lib/money.ts", "src/lib/multicurrency.ts"];
const forbidden = [
  { pattern: /\bMath\.floor\s*\(/, message: "Math.floor is prohibited in ledger money code" },
  { pattern: /\bMath\.round\s*\(/, message: "Math.round is prohibited in ledger money code" },
  { pattern: /\bparseFloat\s*\(/, message: "parseFloat is prohibited in ledger money code" },
  { pattern: /\bNumber\.parseFloat\s*\(/, message: "Number.parseFloat is prohibited in ledger money code" },
];

function files(root) {
  if (statSync(root).isFile()) return [root];
  const out = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...files(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

const failures = [];
for (const file of roots.flatMap(files)) {
  const source = readFileSync(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) failures.push(`${file}: ${rule.message}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
