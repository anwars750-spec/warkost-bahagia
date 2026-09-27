import path from "node:path";

export function validateHostingerEnvironment(env = process.env) {
  const errors = [];
  if (env.NODE_ENV !== "production") errors.push("NODE_ENV harus production");
  if (env.DEPLOYMENT_ENV !== "staging")
    errors.push("DEPLOYMENT_ENV harus staging");
  if (!env.DATABASE_URL?.startsWith("mysql://"))
    errors.push("DATABASE_URL MySQL wajib disetel");
  if (env.DATABASE_PATH)
    errors.push("DATABASE_PATH tidak boleh dipakai pada Hostinger staging");
  if (
    !env.SESSION_SECRET ||
    Buffer.byteLength(env.SESSION_SECRET) < 32 ||
    /change[_ -]?me/i.test(env.SESSION_SECRET)
  )
    errors.push("SESSION_SECRET harus acak dan minimal 32 byte");
  if (
    !env.STAGING_UAT_PASSWORD ||
    env.STAGING_UAT_PASSWORD.length < 14 ||
    /change[_ -]?me/i.test(env.STAGING_UAT_PASSWORD)
  )
    errors.push("STAGING_UAT_PASSWORD harus minimal 14 karakter");

  for (const name of ["UPLOAD_DIRECTORY", "BACKUP_DIRECTORY"]) {
    if (!env[name]) errors.push(`${name} wajib disetel`);
    else if (!path.isAbsolute(env[name]))
      errors.push(`${name} harus berupa path absolut`);
  }
  if (
    env.UPLOAD_DIRECTORY &&
    env.BACKUP_DIRECTORY &&
    path.resolve(env.UPLOAD_DIRECTORY) === path.resolve(env.BACKUP_DIRECTORY)
  )
    errors.push("BACKUP_DIRECTORY harus berbeda dari UPLOAD_DIRECTORY");

  const port = env.PORT === undefined ? 3000 : Number(env.PORT);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    errors.push("PORT tidak valid");
  return errors;
}

export function stagingOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error("STAGING_ORIGIN harus berupa URL HTTPS yang valid");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  )
    throw Error(
      "STAGING_ORIGIN harus origin HTTPS publik tanpa credential, path, query, atau fragment",
    );
  return url.origin;
}
