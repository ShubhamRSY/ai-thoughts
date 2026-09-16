"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecorderStatus = "idle" | "requesting" | "previewing" | "recording" | "stopped" | "error";

interface UseMediaRecorderReturn {
  status: RecorderStatus;
  error: string | null;
  duration: number;
  blob: Blob | null;
  previewUrl: string | null;
  stream: MediaStream | null;
  start: () => Promise<void>;
  record: () => void;
  stop: () => void;
  reset: () => void;
}

function pickMime(kind: "audio" | "video"): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates =
    kind === "audio"
      ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"]
      : [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
          "video/mp4",
        ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/**
 * Real client-side recording via MediaRecorder.
 * Tries several MIME types so Safari/iOS don't hard-fail on webm-only.
 */
export function useMediaRecorder(kind: "audio" | "video"): UseMediaRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewUrlRef = useRef<string | null>(null);
  const MAX_DURATION_SEC = 120;

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    mediaRecorderRef.current = null;
    stopTracks();
    chunksRef.current = [];
    releasePreview();
    setBlob(null);
    setPreviewUrl(null);
    setDuration(0);
    setError(null);
    setStatus("idle");
  }, [clearTimer, stopTracks, releasePreview]);

  const stop = useCallback(() => {
    clearTimer();
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      try {
        rec.requestData?.();
      } catch {
        /* optional */
      }
      rec.stop();
    } else {
      stopTracks();
      setStatus("stopped");
    }
  }, [clearTimer, stopTracks]);

  const start = useCallback(async () => {
    setError(null);
    releasePreview();
    setBlob(null);
    setPreviewUrl(null);
    setStatus("requesting");

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Recording needs a secure connection (HTTPS).");
      setStatus("error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can’t record audio or video.");
      setStatus("error");
      return;
    }

    try {
      const constraints: MediaStreamConstraints =
        kind === "audio"
          ? { audio: true, video: false }
          : {
              audio: true,
              video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;
      setStream(mediaStream);

      const mime = pickMime(kind);
      let recorder: MediaRecorder;
      try {
        recorder = mime
          ? new MediaRecorder(mediaStream, { mimeType: mime })
          : new MediaRecorder(mediaStream);
      } catch {
        recorder = new MediaRecorder(mediaStream);
      }

      const blobType = recorder.mimeType || mime || (kind === "audio" ? "audio/webm" : "video/webm");
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        clearTimer();
        stopTracks();
        setError("Recording failed mid-clip. Try again.");
        setStatus("error");
      };
      recorder.onstop = () => {
        clearTimer();
        if (chunksRef.current.length === 0) {
          stopTracks();
          setError("Nothing was captured — try recording a bit longer.");
          setStatus("error");
          return;
        }
        const fullBlob = new Blob(chunksRef.current, { type: blobType });
        const url = URL.createObjectURL(fullBlob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setBlob(fullBlob);
        setPreviewUrl(url);
        stopTracks();
        setStatus("stopped");
      };
      mediaRecorderRef.current = recorder;

      // Camera/mic are live now, but capture hasn't started — let the
      // person see themselves before committing to a take.
      setStatus("previewing");
    } catch (e) {
      stopTracks();
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone/camera permission was denied."
          : e instanceof Error && e.name === "NotFoundError"
            ? "No recording device was found."
            : e instanceof Error && e.name === "NotSupportedError"
              ? "Recording isn’t supported in this browser."
              : "Could not access the recording device."
      );
      setStatus("error");
    }
  }, [kind, stopTracks, releasePreview, clearTimer]);

  const record = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== "inactive") return;
    // timeslice keeps Safari/iOS from returning an empty blob on stop
    rec.start(1000);

    setDuration(0);
    setStatus("recording");
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setDuration(elapsed);
      if (elapsed >= MAX_DURATION_SEC) stop();
    }, 250);
  }, [stop]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      releasePreview();
    };
  }, [releasePreview]);

  return { status, error, duration, blob, previewUrl, stream, start, record, stop, reset };
}
