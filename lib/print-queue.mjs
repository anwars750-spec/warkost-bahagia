export async function enqueueOrderPrintJobs(tx, orderId, actorId, simulate) {
  const order = await tx.get(
    "SELECT o.id,o.fulfillment_type,o.subtotal,o.delivery_fee,o.total,o.created_at,u.name customer_name,a.detail address FROM orders o JOIN users u ON u.id=o.customer_id JOIN addresses a ON a.id=o.address_id WHERE o.id=?",
    orderId,
  );
  const items = await tx.all(
    "SELECT name,price,quantity,note,prep_station,stock_unit,price_unit_quantity,is_promotion_gift,promotion_id FROM order_items WHERE order_id=? ORDER BY id",
    orderId,
  );
  const adminItems = items; // Owner-confirmed: full transaction receipt at Admin.
  const tickets = adminItems.length
    ? [{ station: "ADMIN", printerKey: "printer_admin", items: adminItems }]
    : [];
  const kitchenItems = items.filter((item) => item.prep_station === "KITCHEN");
  if (kitchenItems.length)
    tickets.push({
      station: "KITCHEN",
      printerKey: "printer_kitchen",
      items: kitchenItems,
    });
  const serviceType =
    order.fulfillment_type === "PICKUP" ? "PICKUP" : "DELIVERY";
  for (const ticket of tickets) {
    const payload = JSON.stringify({
      orderId: Number(orderId),
      station: ticket.station,
      brandName: "Warkost Bahagia",
      brandLogo: "/warkost-bahagia-logo-transparent.png",
      serviceType,
      documentTitle:
        ticket.station === "KITCHEN"
          ? `KITCHEN ${serviceType}`
          : `${serviceType} ORDER`,
      headerLines: ["WARKOST BAHAGIA", serviceType],
      customerName: order.customer_name,
      address: ticket.station === "ADMIN" ? order.address : undefined,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.delivery_fee),
      total: Number(order.total),
      items: ticket.items.map((item) => ({
        name: item.name,
        prepStation: item.prep_station,
        price: Number(item.price),
        quantity: Number(item.quantity),
        note: item.note || null,
        ...(item.stock_unit === "GRAM"
          ? {
              stockUnit: "GRAM",
              priceUnitQuantity: Number(item.price_unit_quantity),
              quantityLabel: `${Number(item.quantity).toLocaleString("id-ID")} g`,
              lineTotal:
                (Number(item.price) * Number(item.quantity)) /
                Number(item.price_unit_quantity),
            }
          : {}),
      })),
      createdAt: order.created_at,
      _bridge: { state: simulate ? "SIMULATED" : "QUEUED", version: 1 },
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
}
