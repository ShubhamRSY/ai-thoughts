import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const IP_UPLOAD_LIMIT = 20;
const IP_UPLOAD_WINDOW_MS = 10 * 60_000;

// Only the audio/video types the recorder can actually produce (plus common
// fallbacks) are accepted — this is what keeps an uploaded file from ever
// being served back as executable HTML/JS from our own origin.
const ALLOWED_CONTENT_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "video/webm",
  "video/mp4",
  "video/ogg",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const MAX_FILE_BYTES = 150 * 1024 * 1024;

// The browser uploads the file directly to Vercel Blob (bypassing the
// Function entirely, so there is no 4.5MB request-body ceiling here) — this
// route only ever exchanges a short-lived, scoped upload token. See
// https://vercel.com/docs/vercel-blob/client-upload
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
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
