import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { privateBlobToken } from "@/lib/media-access";

const IP_UPLOAD_LIMIT = 20;
const IP_UPLOAD_WINDOW_MS = 10 * 60_000;

// Only audio/video/image types the app can actually play — nothing that a
// browser could ever interpret as HTML/JS from our own origin. Mobile cameras
// commonly export MOV (video/quicktime), iPhones record audio/aac, and Android
// supplies image/heic, so those are accepted and normalized on the client
// (video/quicktime and image/heic are re-encoded before upload when possible).
const ALLOWED_CONTENT_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
  "video/webm",
  "video/mp4",
  "video/ogg",
  "video/quicktime",
  "video/x-m4v",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_FILE_BYTES = 150 * 1024 * 1024;

// The browser uploads the file directly to Vercel Blob (bypassing the
// Function entirely, so there is no 4.5MB request-body ceiling here) — this
// route only ever exchanges a short-lived, scoped upload token. See
// https://vercel.com/docs/vercel-blob/client-upload
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  // Takes go to the private store (lib/media-access.ts); avatars stay public.
  // The client names every take "take-…" (lib/db.ts publishPost).
  const blobUrl = body.type === "blob.upload-completed" ? body.payload.blob.url : "";
  const isTake =
    body.type === "blob.generate-client-token"
      ? body.payload.pathname.startsWith("take-")
      : blobUrl.includes(".private.blob.vercel-storage.com/");
  const token = (isTake && privateBlobToken()) || undefined;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async () => {
        const session = await getSession();
        if (!session) throw new Error("Sign in required");

        const ip = clientIp(request);
        const { ok: ipOk } = await rateLimit(`upload:${ip}`, IP_UPLOAD_LIMIT, IP_UPLOAD_WINDOW_MS);
        if (!ipOk) throw new Error("Too many uploads — slow down");

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.id }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("blob upload completed:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 }
    );
  }
}
