"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecorderStatus = "idle" | "requesting" | "recording" | "stopped" | "error";

interface UseMediaRecorderReturn {
  status: RecorderStatus;
  error: string | null;
  duration: number;
  blob: Blob | null;
  previewUrl: string | null;
  stream: MediaStream | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

/**
 * Real client-side recording via MediaRecorder.
 *
 * - audio:  getUserMedia({ audio: true })
 * - video:  getUserMedia({ audio: true, video: true })  (camera + mic)
 *
 * Recording requires a secure context (HTTPS or localhost) and explicit device
 * permission. Files are captured as webm. On stop the chunks are combined into
 * a Blob and a preview URL is exposed so the clip is immediately playable.
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

  const mimeType = kind === "audio" ? "audio/webm" : "video/webm";

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
      rec.stop(); // onstop flips status to "stopped" + builds the blob
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
    try {
      const constraints: MediaStreamConstraints =
        kind === "audio"
          ? { audio: true, video: false }
          : { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setStream(stream);

      const mime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)
          ? mimeType
          : kind === "audio"
            ? "audio/webm"
            : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const fullBlob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(fullBlob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setBlob(fullBlob);
        setPreviewUrl(url);
        stopTracks();
        setStatus("stopped");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();

      setDuration(0);
      setStatus("recording");
      const startTime = Date.now();
      timerRef.current = setInterval(
        () => setDuration(Math.floor((Date.now() - startTime) / 1000)),
        250
      );
    } catch (e) {
      stopTracks();
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone/camera permission was denied."
          : e instanceof Error && e.name === "NotFoundError"
            ? "No recording device was found."
            : "Could not access the recording device."
      );
      setStatus("error");
    }
  }, [kind, mimeType, stopTracks, releasePreview]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount: stop capture and revoke any preview URL.
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

  return { status, error, duration, blob, previewUrl, stream, start, stop, reset };
}
