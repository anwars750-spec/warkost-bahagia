"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { incomingOrderRingtoneAction } from "../lib/incoming-order-ringtone.mjs";
import {
  nextRealtimeBackoff,
  readSoundPreference,
  rememberRealtimeId,
  resolveRealtimeSoundEnabled,
  isRealtimeRecoveryConnection,
  shouldRenderRealtimeControls,
  shouldPlayRealtimeSound,
  writeSoundPreference,
} from "../lib/realtime-client.mjs";

const CONNECTION_LABELS = {
  LIVE: "LIVE",
  RECONNECTING: "MENYAMBUNG",
  OFFLINE: "OFFLINE",
};

const CUSTOMER_NOTIFICATION_SOUND = "/sounds/customer-order-update-v2.mp3";
const DRIVER_NOTIFICATION_SOUND = "/sounds/driver-order-ready-v1.wav";
const INCOMING_ORDER_RINGTONE = "/sounds/incoming-order-admin-kitchen-v2.mp3";

export default function RealtimeOperationsRuntime() {
  const [user, setUser] = useState(null);
  const [connection, setConnection] = useState("OFFLINE");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [incomingOrderMediaReady, setIncomingOrderMediaReady] = useState(false);
  const sourceRef = useRef(null);
  const retryRef = useRef(null);
  const stableConnectionRef = useRef(null);
  const probeRef = useRef(null);
  const attemptRef = useRef(0);
  const seenEventsRef = useRef(new Set());
  const soundedEventsRef = useRef(new Set());
  const audioRef = useRef(null);
  const customerAudioRef = useRef(null);
  const driverAudioRef = useRef(null);
  const incomingOrderAudioRef = useRef(null);
  const pendingIncomingOrdersRef = useRef(new Set());
  const soundEnabledRef = useRef(true);
  const audioUnlockedRef = useRef(false);
  const incomingOrderMediaReadyRef = useRef(false);
  const incomingOrderPrimeInFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const hadAuthenticatedSessionRef = useRef(false);
  const rotationPendingRef = useRef(false);
  const rotationCookieReadyRef = useRef(false);
  const probeSessionRef = useRef(() => {});
  const connectedBeforeRef = useRef(false);
  const recoveryPendingRef = useRef(false);

  const pauseIncomingOrderRingtone = useCallback((clearPending = false) => {
    const audio = incomingOrderAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
    }
    if (clearPending) pendingIncomingOrdersRef.current.clear();
  }, []);

  const getIncomingOrderAudio = useCallback(() => {
    if (typeof Audio === "undefined") return null;
    if (!incomingOrderAudioRef.current) {
      const audio = new Audio(INCOMING_ORDER_RINGTONE);
      audio.preload = "auto";
      audio.loop = true;
      incomingOrderAudioRef.current = audio;
    }
    return incomingOrderAudioRef.current;
  }, []);

  const startIncomingOrderRingtone = useCallback(
    (forceGesture = false) => {
      if (!soundEnabledRef.current || !pendingIncomingOrdersRef.current.size) return;
      if (!incomingOrderMediaReadyRef.current && !forceGesture) return;
      const audio = getIncomingOrderAudio();
      if (!audio) return;
      try {
        audio.loop = true;
        audio.volume = 1;
        if (audio.paused) audio.play().catch(() => {});
      } catch {}
    },
    [getIncomingOrderAudio],
  );

  const primeIncomingOrderAudio = useCallback(async () => {
    if (!soundEnabledRef.current || incomingOrderMediaReadyRef.current) return true;
    if (incomingOrderPrimeInFlightRef.current) return false;
    const audio = getIncomingOrderAudio();
    if (!audio) return false;
    incomingOrderPrimeInFlightRef.current = true;
    const previousVolume = audio.volume;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
      const playback = audio.play();
      if (playback?.then) await playback;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = previousVolume;
      incomingOrderMediaReadyRef.current = true;
      setIncomingOrderMediaReady(true);
      if (pendingIncomingOrdersRef.current.size) startIncomingOrderRingtone(true);
      return true;
    } catch {
      audio.volume = previousVolume;
      incomingOrderMediaReadyRef.current = false;
      setIncomingOrderMediaReady(false);
      return false;
    } finally {
      incomingOrderPrimeInFlightRef.current = false;
    }
  }, [getIncomingOrderAudio, startIncomingOrderRingtone]);

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
    pauseIncomingOrderRingtone(true);
    setConnection("OFFLINE");
  }, [pauseIncomingOrderRingtone]);

  const invalidateApplicationSession = useCallback(
    (reason = "session-invalid") => {
      if (!hadAuthenticatedSessionRef.current) return;
      hadAuthenticatedSessionRef.current = false;
      incomingOrderMediaReadyRef.current = false;
      setIncomingOrderMediaReady(false);
      setUser(null);
      soundedEventsRef.current.clear();
      stop();
      window.dispatchEvent(
        new CustomEvent("warkost:session-invalidated", { detail: { reason } }),
      );
    },
    [stop],
  );

  const getCustomerAudio = useCallback(() => {
    if (typeof Audio === "undefined") return null;
    if (!customerAudioRef.current) {
      const audio = new Audio(CUSTOMER_NOTIFICATION_SOUND);
      audio.preload = "auto";
      customerAudioRef.current = audio;
    }
    return customerAudioRef.current;
  }, []);

  const getDriverAudio = useCallback(() => {
    if (typeof Audio === "undefined") return null;
    if (!driverAudioRef.current) {
      const audio = new Audio(DRIVER_NOTIFICATION_SOUND);
      audio.preload = "auto";
      audio.loop = false;
      driverAudioRef.current = audio;
    }
    return driverAudioRef.current;
  }, []);

  const primeCustomerAudio = useCallback(() => {
    if (user?.role !== "CUSTOMER") return;
    const audio = getCustomerAudio();
    if (!audio) return;
    const previousVolume = audio.volume;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
      const playback = audio.play();
      if (playback?.then)
        playback
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = previousVolume;
          })
          .catch(() => {
            audio.volume = previousVolume;
          });
      else {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = previousVolume;
      }
    } catch {
      audio.volume = previousVolume;
    }
  }, [getCustomerAudio, user?.role]);

  const primeDriverAudio = useCallback(() => {
    if (user?.role !== "DRIVER") return;
    const audio = getDriverAudio();
    if (!audio) return;
    const previousVolume = audio.volume;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
      const playback = audio.play();
      if (playback?.then)
        playback
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = previousVolume;
          })
          .catch(() => {
            audio.volume = previousVolume;
          });
      else {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = previousVolume;
      }
    } catch {
      audio.volume = previousVolume;
    }
  }, [getDriverAudio, user?.role]);

  const unlockAudio = useCallback(
    (force = false) => {
      if ((!soundEnabled && !force) || audioUnlocked) return;
      if (user?.role === "CUSTOMER") primeCustomerAudio();
      if (user?.role === "DRIVER") primeDriverAudio();
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try {
        const context = audioRef.current || new AudioContext();
        audioRef.current = context;
        const unlocked = () => {
          audioUnlockedRef.current = true;
          setAudioUnlocked(true);
          startIncomingOrderRingtone();
        };
        if (context.state === "suspended")
          context.resume().then(unlocked).catch(() => {});
        else unlocked();
      } catch {}
    },
    [
      audioUnlocked,
      primeCustomerAudio,
      primeDriverAudio,
      soundEnabled,
      startIncomingOrderRingtone,
      user?.role,
    ],
  );

  const playSound = useCallback(
    (event) => {
      if (user?.role === "CUSTOMER") {
        const audio = getCustomerAudio();
        if (!audio) return;
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1;
          audio.play().catch(() => {});
        } catch {}
        return;
      }

      if (user?.role === "DRIVER") {
        const audio = getDriverAudio();
        if (!audio) return;
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.loop = false;
          audio.volume = 1;
          audio.play().catch(() => {});
        } catch {}
        return;
      }

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
        gain.gain.exponentialRampToValueAtTime(
          0.08,
          context.currentTime + offset + 0.015,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + offset + 0.16,
        );
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(context.currentTime + offset);
        oscillator.stop(context.currentTime + offset + 0.17);
      }
    },
    [getCustomerAudio, getDriverAudio, user?.role],
  );

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
          pauseIncomingOrderRingtone(true);
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

      const incomingAction = incomingOrderRingtoneAction(user.role, event);
      let incomingStartHandled = false;
      if (incomingAction?.type === "START") {
        pendingIncomingOrdersRef.current.add(incomingAction.orderId);
        incomingStartHandled = true;
        if (!incomingOrderMediaReadyRef.current) void primeIncomingOrderAudio();
        startIncomingOrderRingtone();
      } else if (incomingAction?.type === "STOP") {
        pendingIncomingOrdersRef.current.delete(incomingAction.orderId);
        if (!pendingIncomingOrdersRef.current.size) pauseIncomingOrderRingtone();
      }

      if (
        !incomingStartHandled &&
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
      pauseIncomingOrderRingtone(true);
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
    probeSessionRef.current();
    const onSessionStarted = () => probeSessionRef.current();
    const onSessionRotationStarted = () => {
      rotationPendingRef.current = true;
      rotationCookieReadyRef.current = false;
      pauseIncomingOrderRingtone(true);
    };
    const onSessionRotated = () => {
      rotationCookieReadyRef.current = true;
      if (connectedBeforeRef.current) recoveryPendingRef.current = true;
      pauseIncomingOrderRingtone(true);
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
      incomingOrderMediaReadyRef.current = false;
      setIncomingOrderMediaReady(false);
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
    probeRef.current = window.setInterval(() => probeSessionRef.current(), 120000);
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
      customerAudioRef.current?.pause();
      customerAudioRef.current = null;
      driverAudioRef.current?.pause();
      driverAudioRef.current = null;
      incomingOrderAudioRef.current?.pause();
      incomingOrderAudioRef.current = null;
      pendingIncomingOrdersRef.current.clear();
      incomingOrderMediaReadyRef.current = false;
      audioRef.current?.close?.().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!user?.role) return;
    const enabled = resolveRealtimeSoundEnabled(user.role, window.localStorage);
    soundEnabledRef.current = enabled;
    setSoundEnabled(enabled);
  }, [user?.role]);

  useEffect(() => {
    if (!user?.id) {
      stop();
      return;
    }
    if (user.role === "CUSTOMER") getCustomerAudio();
    if (user.role === "DRIVER") getDriverAudio();
    if (["ADMIN", "KITCHEN"].includes(user.role)) getIncomingOrderAudio();
    connectRef.current();
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
      pauseIncomingOrderRingtone(true);
      if (stableConnectionRef.current)
        window.clearTimeout(stableConnectionRef.current);
      stableConnectionRef.current = null;
    };
  }, [
    getCustomerAudio,
    getDriverAudio,
    getIncomingOrderAudio,
    pauseIncomingOrderRingtone,
    stop,
    user?.id,
    user?.role,
  ]);

  useEffect(() => {
    if (!["ADMIN", "KITCHEN"].includes(user?.role)) return;
    if (!soundEnabled || incomingOrderMediaReady) return;

    void primeIncomingOrderAudio();
    const primeFromNormalInteraction = () => {
      unlockAudio(true);
      void primeIncomingOrderAudio();
    };
    window.addEventListener("pointerdown", primeFromNormalInteraction, { passive: true });
    window.addEventListener("keydown", primeFromNormalInteraction);
    return () => {
      window.removeEventListener("pointerdown", primeFromNormalInteraction);
      window.removeEventListener("keydown", primeFromNormalInteraction);
    };
  }, [
    incomingOrderMediaReady,
    primeIncomingOrderAudio,
    soundEnabled,
    unlockAudio,
    user?.role,
  ]);

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

  if (!user || !shouldRenderRealtimeControls(user.role)) return null;
  return (
    <aside
      className={`realtime-status realtime-status-${connection.toLowerCase()}`}
      aria-label="Status realtime"
    >
      <span>
        <i />
        {CONNECTION_LABELS[connection]}
      </span>
      <button
        type="button"
        aria-pressed={soundEnabled}
        title={soundEnabled ? "Matikan suara notifikasi" : "Aktifkan suara notifikasi"}
        onClick={() => {
          const enabled = writeSoundPreference(window.localStorage, !soundEnabled);
          soundEnabledRef.current = enabled;
          setSoundEnabled(enabled);
          if (enabled) {
            unlockAudio(true);
            void primeIncomingOrderAudio();
          } else {
            customerAudioRef.current?.pause();
            if (customerAudioRef.current) customerAudioRef.current.currentTime = 0;
            driverAudioRef.current?.pause();
            if (driverAudioRef.current) driverAudioRef.current.currentTime = 0;
            pauseIncomingOrderRingtone();
            audioUnlockedRef.current = false;
            incomingOrderMediaReadyRef.current = false;
            setIncomingOrderMediaReady(false);
            setAudioUnlocked(false);
          }
        }}
      >
        {soundEnabled ? "Suara ON" : "Suara OFF"}
      </button>
    </aside>
  );
}
