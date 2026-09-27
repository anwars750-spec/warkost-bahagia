import { checkReadiness, validateProductionConfig } from "../lib/readiness.mjs";

const configErrors = validateProductionConfig(process.env);
if (configErrors.length) {
  for (const message of configErrors) console.error("- " + message);
  process.exitCode = 1;
} else {
  const result = await checkReadiness({ production: true });
  if (!result.ready) {
    console.error("Production preflight gagal:", JSON.stringify(result.checks));
    process.exitCode = 1;
  } else {
    console.log("Production preflight lulus:", JSON.stringify(result.checks));
  }
}
