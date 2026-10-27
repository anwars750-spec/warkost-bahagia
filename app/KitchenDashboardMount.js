"use client";

import { useEffect, useState } from "react";
import KitchenDashboardFast from "./KitchenDashboardFast";

export default function KitchenDashboardMount() {
  const [mainReady, setMainReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (!document.querySelector("main")) return false;
      setMainReady(true);
      return true;
    };

    if (sync()) return undefined;

    const observer = new MutationObserver(() => {
      if (!sync()) return;
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return mainReady ? <KitchenDashboardFast /> : null;
}
