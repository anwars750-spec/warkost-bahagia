import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  "lib/db.mjs",
  "lib/catalog.mjs",
  "lib/operations.mjs",
  "lib/domain.mjs",
  "app/ManagerControlCenter.js",
];

for (const file of targets) {
  const target = path.join(root, file);
  const content = fs.readFileSync(target, "utf8");
  fs.writeFileSync(target, content.replace(/\r\n/g, "\n"));
}

await import("./apply-unlimited-stock-v1.mjs");

fs.rmSync(path.join(root, "scripts/apply-unlimited-stock-v1-fixed.mjs"), {
  force: true,
});
