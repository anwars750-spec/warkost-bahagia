"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  nextRealtimeBackoff,
  readSoundPreference,
  rememberRealtimeId,
  isRealtimeRecoveryConnection,
  shouldPlayRealtimeSound,
  writeSoundPreference,
} from "../lib/realtime-client.mjs";

const CONNECTION_LABELS = {
  LIVE: "LIVE",
  RECONNECTING: "MENYAMBUNG",
  OFFLINE: "OFFLINE",
};

export default function RealtimeOperationsRuntime() {
  const [user, setUser] = useState(null);
  const [connection, setConnection] = useState("OFFLINE");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const sourceRef = useRef(null);
  const retryRef = useRef(null);
  const stableConnectionRef = useRef(null);
  const probeRef = useRef(null);
  const attemptRef = useRef(0);
  const seenEventsRef = useRef(new Set());
  const soundedEventsRef = useRef(new Set());
  const audioRef = useRef(null);
  const soundEnabledRef = useRef(true);
  const audioUnlockedRef = useRef(false);
  const mountedRef = useRef(false);
  const hadAuthenticatedSessionRef = useRef(false);
  const rotationPendingRef = useRef(false);
  const rotationCookieReadyRef = useRef(false);
  const probeSessionRef = useRef(() => {});
  const connectedBeforeRef = useRef(false);
  const recoveryPendingRef = useRef(false);

  const stop = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    if (retryRef.current) window.clearTimeout(retryRef.current);
    if (stableConnectionRef.current)
      window.clearTimeout(stableConnectionRef.current);
    retryRef.current = null;
    stableConnectionRef.current = null;
    attemptRef.current = 0;
    connectedBeforeRef.current = false;
    recoveryPendingRef.current = false;
    setConnection("OFFLINE");
  }, []);

  const invalidateApplicationSession = useCallback((reason = "session-invalid") => {
    if (!hadAuthenticatedSessionRef.current) return;
    hadAuthenticatedSessionRef.current = false;
    setUser(null);
    soundedEventsRef.current.clear();
    stop();
    window.dispatchEvent(
      new CustomEvent("warkost:session-invalidated", { detail: { reason } }),
    );
  }, [stop]);

  const unlockAudio = useCallback((force = false) => {
    if ((!soundEnabled && !force) || audioUnlocked) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      const context = audioRef.current || new AudioContext();
      audioRef.current = context;
      const unlocked = () => {
        audioUnlockedRef.current = true;
        setAudioUnlocked(true);
      };
      if (context.state === "suspended") context.resume().then(unlocked).catch(() => {});
      else unlocked();
    } catch {}
  }, [audioUnlocked, soundEnabled]);

  const playSound = useCallback((event) => {
    const context = audioRef.current;
    if (!context || context.state !== "running") return;
    const urgent = event.priority === "URGENT";
    const tones = urgent ? [0, 0.14] : [0];
    for (const offset of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = urgent ? 740 : 620;
      gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.17);
    }
  }, []);

  const connectRef = useRef(() => {});
  connectRef.current = () => {
    if (!mountedRef.current || !user?.id || sourceRef.current) return;
    setConnection(attemptRef.current ? "RECONNECTING" : "OFFLINE");
    const source = new EventSource("/api/realtime", { withCredentials: true });
    sourceRef.current = source;
    source.onopen = () => {
      setConnection("LIVE");
      if (stableConnectionRef.current)
        window.clearTimeout(stableConnectionRef.current);
      stableConnectionRef.current = window.setTimeout(() => {
        attemptRef.current = 0;
        stableConnectionRef.current = null;
      }, 30000);
    };
    source.onmessage = (message) => {
      let event;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      if (event.type === "REALTIME_CONNECTED") {
        setConnection("LIVE");
        const recovered = isRealtimeRecoveryConnection({
          connectedBefore: connectedBeforeRef.current,
          recoveryPending: recoveryPendingRef.current,
        });
        connectedBeforeRef.current = true;
        recoveryPendingRef.current = false;
        window.dispatchEvent(new CustomEvent("warkost:realtime-connected"));
        if (recovered)
          window.dispatchEvent(
            new CustomEvent("warkost:realtime-recovered", {
              detail: { role: user.role },
            }),
          );
        return;
      }
      if (event.type === "REALTIME_CLOSED") {
        if (event.reason === "session-rotated") {
          rotationPendingRef.current = true;
          if (connectedBeforeRef.current) recoveryPendingRef.current = true;
          source.close();
          if (sourceRef.current === source) sourceRef.current = null;
          setConnection("RECONNECTING");
          if (rotationCookieReadyRef.current) {
            rotationCookieReadyRef.current = false;
            rotationPendingRef.current = false;
            probeSessionRef.current();
          }
          return;
        }
        if (event.reason === "session-ended") {
          invalidateApplicationSession(event.reason);
        }
        return;
      }
      if (!rememberRealtimeId(seenEventsRef.current, event.id)) return;
      window.dispatchEvent(new CustomEvent("warkost:realtime", { detail: event }));
      if (["COD_STATUS_CHANGED", "SETTLEMENT_STATUS_CHANGED"].includes(event.type))
        window.dispatchEvent(new CustomEvent("warkost:cod-batch-updated"));
      if (
        shouldPlayRealtimeSound({
          event,
          unlocked: audioUnlockedRef.current,
          enabled: soundEnabledRef.current,
          seen: soundedEventsRef.current,
        })
      ) {
        rememberRealtimeId(soundedEventsRef.current, event.id);
        playSound(event);
      }
    };
    source.onerror = async () => {
      source.close();
      if (stableConnectionRef.current)
        window.clearTimeout(stableConnectionRef.current);
      stableConnectionRef.current = null;
      if (sourceRef.current === source) sourceRef.current = null;
      if (!mountedRef.current || !user?.id) return;
      if (rotationPendingRef.current) return;
      if (connectedBeforeRef.current) recoveryPendingRef.current = true;
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.user) {
          invalidateApplicationSession("session-probe-failed");
          return;
        }
        hadAuthenticatedSessionRef.current = true;
        setUser(data.user);
      } catch {}
      setConnection("RECONNECTING");
      const delay = nextRealtimeBackoff(attemptRef.current++);
      retryRef.current = window.setTimeout(() => connectRef.current(), delay);
    };
  };

  const probeSession = useCallback(async () => {
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) {
        invalidateApplicationSession("session-probe-failed");
        return;
      }
      hadAuthenticatedSessionRef.current = true;
      setUser(data.user);
      window.setTimeout(() => connectRef.current(), 0);
    } catch {
      if (user) setConnection("OFFLINE");
    }
  }, [invalidateApplicationSession, user]);
  probeSessionRef.current = probeSession;

  useEffect(() => {
    mountedRef.current = true;
    const storedSoundPreference = readSoundPreference(window.localStorage);
    soundEnabledRef.current = storedSoundPreference;
    setSoundEnabled(storedSoundPreference);
    probeSession();
    const onSessionStarted = () => probeSession();
    const onSessionRotationStarted = () => {
      rotationPendingRef.current = true;
      rotationCookieReadyRef.current = false;
    };
    const onSessionRotated = () => {
      rotationCookieReadyRef.current = true;
      if (connectedBeforeRef.current) recoveryPendingRef.current = true;
      sourceRef.current?.close();
      sourceRef.current = null;
      rotationPendingRef.current = false;
      rotationCookieReadyRef.current = false;
      setConnection("RECONNECTING");
      probeSessionRef.current();
    };
    const onSessionRotationCancelled = () => {
      rotationPendingRef.current = false;
      rotationCookieReadyRef.current = false;
      if (!sourceRef.current) probeSessionRef.current();
    };
    const onSessionEnded = () => {
      hadAuthenticatedSessionRef.current = false;
      setUser(null);
      soundedEventsRef.current.clear();
      stop();
    };
    window.addEventListener("warkost:session-started", onSessionStarted);
    window.addEventListener(
      "warkost:session-rotation-started",
      onSessionRotationStarted,
    );
    window.addEventListener("warkost:session-rotated", onSessionRotated);
    window.addEventListener(
      "warkost:session-rotation-cancelled",
      onSessionRotationCancelled,
    );
    window.addEventListener("warkost:session-ended", onSessionEnded);
    probeRef.current = window.setInterval(probeSession, 120000);
    return () => {
      mountedRef.current = false;
      stop();
      if (probeRef.current) window.clearInterval(probeRef.current);
      window.removeEventListener("warkost:session-started", onSessionStarted);
      window.removeEventListener(
        "warkost:session-rotation-started",
        onSessionRotationStarted,
      );
      window.removeEventListener("warkost:session-rotated", onSessionRotated);
      window.removeEventListener(
        "warkost:session-rotation-cancelled",
        onSessionRotationCancelled,
      );
      window.removeEventListener("warkost:session-ended", onSessionEnded);
      audioRef.current?.close?.().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      stop();
      return;
    }
    connectRef.current();
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
      if (stableConnectionRef.current)
        window.clearTimeout(stableConnectionRef.current);
      stableConnectionRef.current = null;
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!soundEnabled || audioUnlocked) return;
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [soundEnabled, audioUnlocked, unlockAudio]);

  if (!user) return null;
  return (
    <aside className={`realtime-status realtime-status-${connection.toLowerCase()}`} aria-label="Status realtime">
      <span><i />{CONNECTION_LABELS[connection]}</span>
      <button
        type="button"
        aria-pressed={soundEnabled}
        title={soundEnabled ? "Matikan suara notifikasi" : "Aktifkan suara notifikasi"}
        onClick={() => {
          const enabled = writeSoundPreference(window.localStorage, !soundEnabled);
          soundEnabledRef.current = enabled;
          setSoundEnabled(enabled);
          if (enabled) unlockAudio(true);
          else {
            audioUnlockedRef.current = false;
            setAudioUnlocked(false);
          }
        }}
      >
        {soundEnabled ? "Suara ON" : "Suara OFF"}
      </button>
    </aside>
  );
}
