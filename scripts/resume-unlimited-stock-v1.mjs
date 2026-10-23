import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
}

function write(file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function replaceOnce(file, before, after) {
  const current = read(file);
  const needle = before.replace(/\r\n/g, "\n");
  const replacement = after.replace(/\r\n/g, "\n");
  const first = current.indexOf(needle);
  if (first < 0) throw new Error(`Target patch tidak ditemukan: ${file}`);
  if (current.indexOf(needle, first + needle.length) >= 0)
    throw new Error(`Target patch ambigu: ${file}`);
  write(file, current.slice(0, first) + replacement + current.slice(first + needle.length));
}

const source = read("scripts/apply-unlimited-stock-v1.mjs");
const start = source.indexOf("// Manager Product Master + Stock presentation.");
const end = source.indexOf("// Remove this temporary helper from the final working tree after successful apply.");
if (start < 0 || end < 0 || end <= start)
  throw new Error("Segmen resume Unlimited Stock tidak ditemukan");

// Execute only the remaining Manager UI + migration + dedicated test section.
eval(source.slice(start, end));

for (const file of [
  "scripts/apply-unlimited-stock-v1.mjs",
  "scripts/apply-unlimited-stock-v1-fixed.mjs",
  "scripts/resume-unlimited-stock-v1.mjs",
]) {
  fs.rmSync(path.join(root, file), { force: true });
}

console.log("OK - Unlimited Stock V1 remaining patch applied");
