import { DomainError } from "./domain.mjs";

const maxJsonBytes = 64 * 1024;

export async function readJsonBody(request) {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json")
    throw new DomainError("Content-Type harus application/json", 415);
  if (Number(request.headers.get("content-length") || 0) > maxJsonBytes)
    throw new DomainError("Permintaan terlalu besar", 413);
  const chunks = [];
  let size = 0;
  if (!request.body) throw new DomainError("JSON tidak valid");
  for await (const chunk of request.body) {
    size += chunk.byteLength;
    if (size > maxJsonBytes)
      throw new DomainError("Permintaan terlalu besar", 413);
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    throw new DomainError("JSON tidak valid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DomainError("JSON harus berupa objek");
  return value;
}
