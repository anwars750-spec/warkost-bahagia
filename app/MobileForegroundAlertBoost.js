"use client";

import { useEffect, useRef } from "react";

const MAX_SEEN_EVENTS = 500;

function rememberEvent(seen, id) {
  if (!id || seen.has(id)) return false;
  seen.add(id);
  while (seen.size > MAX_SEEN_EVENTS) seen.delete(seen.values().next().value);
  return true;
}

export default function MobileForegroundAlertBoost() {
  const contextRef = useRef(null);
  const unlockedRef = useRef(false);
  const seenEventsRef = useRef(new Set());

  useEffect(() => {
    const getContext = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      if (!contextRef.current) contextRef.current = new AudioContext();
      return contextRef.current;
    };

    const unlock = () => {
      const context = getContext();
      if (!context) return;
      if (context.state === "suspended") {
        context
          .resume()
          .then(() => {
            unlockedRef.current = context.state === "running";
          })
          .catch(() => {});
        return;
      }
      unlockedRef.current = context.state === "running";
    };

    const playPattern = (event) => {
      const context = getContext();
      if (!context || !unlockedRef.current) return;

      const emit = () => {
        if (context.state !== "running") return;
        const chat = event?.type === "CONVERSATION_CHANGED";
        const urgent = event?.priority === "URGENT";
        const notes = chat
          ? [1047, 1319, 1568, 1047, 1319, 1568]
          : urgent
            ? [988, 740, 988, 740]
            : [880, 1109, 880];
        const spacing = chat ? 0.16 : 0.15;
        const duration = chat ? 0.34 : 0.28;
        const peakGain = chat ? 0.95 : urgent ? 0.72 : 0.62;

        notes.forEach((frequency, index) => {
          const offset = index * spacing;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "square";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(
            peakGain,
            context.currentTime + offset + 0.012,
          );
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            context.currentTime + offset + duration,
          );
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(context.currentTime + offset);
          oscillator.stop(context.currentTime + offset + duration + 0.01);
        });
      };

      if (context.state === "suspended") {
        context.resume().then(emit).catch(() => {});
        return;
      }
      emit();
    };

    const vibrate = (event) => {
      if (typeof navigator.vibrate !== "function") return;
      if (event?.type === "CONVERSATION_CHANGED") {
        navigator.vibrate([220, 90, 220, 90, 320]);
        return;
      }
      if (event?.priority === "URGENT") {
        navigator.vibrate([300, 100, 300, 100, 420]);
        return;
      }
      navigator.vibrate([220, 90, 220]);
    };

    const onRealtime = (message) => {
      const event = message?.detail;
      if (!rememberEvent(seenEventsRef.current, event?.id)) return;
      if (!event?.actionable || event?.audible !== true || event?.replayed) return;
      playPattern(event);
      vibrate(event);
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    window.addEventListener("warkost:realtime", onRealtime);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("warkost:realtime", onRealtime);
      unlockedRef.current = false;
      seenEventsRef.current.clear();
      contextRef.current?.close?.().catch(() => {});
      contextRef.current = null;
    };
  }, []);

  return null;
}
