import fs from "node:fs";
import path from "node:path";
const root = path.resolve(".next/static");
let count = 0;
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.(js|map)$/.test(file)) {
      const text = fs.readFileSync(file, "utf8");
      if (
        text.includes("WEB_PUSH_VAPID_PRIVATE_KEY") ||
        (process.env.WEB_PUSH_VAPID_PRIVATE_KEY &&
          text.includes(process.env.WEB_PUSH_VAPID_PRIVATE_KEY))
      )
        throw Error("Private VAPID material referenced by client bundle");
      count++;
    }
  }
}
inspect(root);
if (!count) throw Error("No browser bundle inspected");
console.log(`Web Push private-key bundle isolation PASS (${count} artifacts)`);
