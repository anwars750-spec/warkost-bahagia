export async function enqueueOrderPrintJobs(tx, orderId, actorId, simulate) {
  const order = await tx.get(
    "SELECT o.id,o.subtotal,o.delivery_fee,o.total,o.created_at,u.name customer_name,a.detail address FROM orders o JOIN users u ON u.id=o.customer_id JOIN addresses a ON a.id=o.address_id WHERE o.id=?",
    orderId,
  );
  const items = await tx.all(
    "SELECT name,price,quantity,note,prep_station FROM order_items WHERE order_id=? ORDER BY id",
    orderId,
  );
  const tickets = [{ station: "ADMIN", printerKey: "printer_admin", items }];
  const kitchenItems = items.filter((item) => item.prep_station === "KITCHEN");
  if (kitchenItems.length)
    tickets.push({
      station: "KITCHEN",
      printerKey: "printer_kitchen",
      items: kitchenItems,
    });
  for (const ticket of tickets) {
    const payload = JSON.stringify({
      orderId: Number(orderId),
      station: ticket.station,
      customerName: order.customer_name,
      address: ticket.station === "ADMIN" ? order.address : undefined,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.delivery_fee),
      total: Number(order.total),
      items: ticket.items.map((item) => ({
        name: item.name,
        price: Number(item.price),
        quantity: Number(item.quantity),
        note:
          ticket.station === "KITCHEN" || item.prep_station === "CASHIER"
            ? item.note || null
            : null,
      })),
      createdAt: order.created_at,
    });
    await tx.run(
      "INSERT OR IGNORE INTO print_jobs(order_id,station,printer_key,payload_json,requested_by) VALUES(?,?,?,?,?)",
      orderId,
      ticket.station,
      ticket.printerKey,
      payload,
      actorId,
    );
  }
  if (simulate)
    await tx.run(
      "UPDATE print_jobs SET status='PRINTED',attempts=attempts+1,printed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='QUEUED'",
      orderId,
    );
}
