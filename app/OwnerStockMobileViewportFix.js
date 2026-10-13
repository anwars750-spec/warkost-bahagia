"use client";

import { useEffect } from "react";

export default function OwnerStockMobileViewportFix() {
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    let raf = 0;

    const sync = () => {
      const open = Boolean(document.querySelector(".oso-modal"));
      const active = open && media.matches;
      document.documentElement.classList.toggle("owner-stock-mobile-open", active);
      document.body.classList.toggle("owner-stock-mobile-open", active);

      if (!active) return;
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      const top = window.scrollY;
      window.scrollTo(0, top);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
        window.scrollTo(0, window.scrollY);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", sync);
    media.addEventListener?.("change", sync);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", sync);
      media.removeEventListener?.("change", sync);
      document.documentElement.classList.remove("owner-stock-mobile-open");
      document.body.classList.remove("owner-stock-mobile-open");
    };
  }, []);

  return null;
}
