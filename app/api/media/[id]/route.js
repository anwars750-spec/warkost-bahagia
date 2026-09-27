import { readImage } from "../../../../lib/media.mjs";
import { DomainError } from "../../../../lib/domain.mjs";
export const runtime = "nodejs";
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const image = await readImage(id);
    return new Response(image.bytes, {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": String(image.bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof DomainError)
      return Response.json({ error: e.message }, { status: e.status });
    console.error("Media error", e);
    return Response.json({ error: "Gagal memuat gambar" }, { status: 500 });
  }
}
