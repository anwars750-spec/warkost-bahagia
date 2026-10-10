"use client";

import { useLayoutEffect, useRef, useState } from "react";
import DriverControlCenter from "./DriverControlCenter";
import CodBatchSettlementCenter from "./CodBatchSettlementCenter";

function hasLegacyDriverSurface() {
  return Boolean(document.querySelector(".driver-trip-workspace"));
}

export default function DriverRuntimeBootstrap() {
  const [generation, setGeneration] = useState(0);
  const detectedRef = useRef(false);

  useLayoutEffect(() => {
    let observer = null;

    const activate = () => {
      if (detectedRef.current || !hasLegacyDriverSurface()) return;

      detectedRef.current = true;
      document.body.classList.add("driver-v2-transition");

      // Remount both Driver runtimes immediately after a Driver login becomes
      // visible. Their original mount may have happened while the user was
      // still logged out, leaving auth state stale until the next poll.
      setGeneration((value) => value + 1);
      observer?.disconnect();
    };

    activate();

    if (!detectedRef.current) {
      observer = new MutationObserver(activate);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer?.disconnect();
      document.body.classList.remove("driver-v2-transition");
    };
  }, []);

  return (
    <>
      <DriverControlCenter key={`driver-control-${generation}`} />
      <CodBatchSettlementCenter key={`driver-cod-${generation}`} />
    </>
  );
}
