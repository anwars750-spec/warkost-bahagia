import { currentUser } from "../../../lib/auth.mjs";
import { changeStatus, DomainError } from "../../../lib/domain.mjs";
import { createDriverDeliveryProof } from "../../../lib/delivery-proofs.mjs";
import { publishActionRealtime } from "../../../lib/realtime.mjs";
import { assertSameOrigin } from "../../../lib/request.mjs";

export const runtime = "nodejs";

function errorResponse(error) {
  if (error instanceof DomainError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error?.code === "DELIVERY_PROOF_REQUIRED")
    return Response.json(
      { error: "Bukti pengantaran wajib sebelum pesanan diselesaikan" },
      { status: 409 },
    );
  console.error("Delivery proof error", error);
  return Response.json(
    { error: "Gagal menyimpan bukti pengantaran" },
    { status: 500 },
  );
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await currentUser(request);
    if (!user) throw new DomainError("Silakan masuk terlebih dahulu", 401);

    const limit = 9 * 1024 * 1024;
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > limit)
      throw new DomainError("Gambar terlalu besar", 413);
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

    const orderId = Number(form.get("orderId"));
    if (!Number.isSafeInteger(orderId) || orderId < 1)
      throw new DomainError("Order tidak valid");
    const proof = await createDriverDeliveryProof(user, orderId, form.get("image"));
    const result = await changeStatus(user, orderId, "DELIVERED");

    try {
      await publishActionRealtime(
        "status",
        user,
        { orderId, status: "DELIVERED" },
        result,
      );
    } catch (realtimeError) {
      console.error("Delivery proof realtime publication failed", realtimeError);
    }

    return Response.json({ proof, order: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
