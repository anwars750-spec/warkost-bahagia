"use client";

import { useEffect, useState } from "react";
import ConversationChat from "./ConversationChat";

export default function CustomerGeneralSupportRuntime() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openSupport = () => setOpen(true);
    window.addEventListener("warkost:open-general-customer-service", openSupport);
    return () =>
      window.removeEventListener(
        "warkost:open-general-customer-service",
        openSupport,
      );
  }, []);

  if (!open) return null;

  return (
    <ConversationChat
      target={{ type: "CUSTOMER_ADMIN" }}
      viewerRole="CUSTOMER"
      onClose={() => setOpen(false)}
    />
  );
}
