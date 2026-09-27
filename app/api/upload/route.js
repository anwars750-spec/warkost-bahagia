import { currentUser } from "../../../lib/auth.mjs";
import { uploadImage } from "../../../lib/media.mjs";
import { DomainError, required } from "../../../lib/domain.mjs";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      throw new DomainError("Asal permintaan tidak diizinkan", 403);
    const user = await currentUser(request);
    required(user, ["ADMIN"]);
    const limit = 9 * 1024 * 1024;
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > limit) throw new DomainError("Gambar terlalu besar", 413);
    const type = request.headers.get("content-type") || "";
    if (!type.toLowerCase().startsWith("multipart/form-data;"))
      throw new DomainError("Format unggahan tidak valid");
    const chunks = [];
    let size = 0;
    for await (const chunk of request.body) {
      size += chunk.byteLength;
      if (size > limit) throw new DomainError("Gambar terlalu besar", 413);
      chunks.push(chunk);
    }
    const bounded = new Request(request.url, {
      method: "POST",
      headers: { "content-type": type },
      body: Buffer.concat(chunks, size),
    });
    let form;
    try {
      form = await bounded.formData();
    } catch {
      throw new DomainError("Format unggahan tidak valid");
    }
    const result = await uploadImage(user, form.get("image"));
    return Response.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError)
      return Response.json({ error: e.message }, { status: e.status });
    console.error("Upload error", e);
    return Response.json({ error: "Gagal mengunggah gambar" }, { status: 500 });
  }
}
