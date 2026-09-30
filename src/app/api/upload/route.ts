import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { privateBlobToken } from "@/lib/media-access";
import { connectToDatabase } from "@/lib/mongodb";
import { claimUpload, parseUploadPathname, uploadCaps, uploadQuotaWaitSec } from "@/lib/uploads";

const IP_UPLOAD_LIMIT = 20;
const IP_UPLOAD_WINDOW_MS = 10 * 60_000;

// Only audio/video/image types the app can actually play — nothing that a
// browser could ever interpret as HTML/JS from our own origin — and a size
// cap per family (lib/uploads.ts uploadCaps). Mobile cameras commonly export
// MOV, iPhones record audio/aac, and Android supplies image/heic, so those are
// accepted and normalized on the client when possible.

// The browser uploads the file directly to Vercel Blob (bypassing the
// Function entirely, so there is no 4.5MB request-body ceiling here) — this
// route only ever exchanges a short-lived, scoped upload token. See
// https://vercel.com/docs/vercel-blob/client-upload
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  // Token requests are checked here, before any Blob call: who, how often,
  // what name and size — and the uploader is recorded (H3, M4).
  let caps: NonNullable<ReturnType<typeof uploadCaps>> | null = null;
  let ownerId = "";
  if (body.type === "blob.generate-client-token") {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const ip = clientIp(request);
    const { ok: ipOk } = await rateLimit(`upload:${ip}`, IP_UPLOAD_LIMIT, IP_UPLOAD_WINDOW_MS);
    if (!ipOk) return NextResponse.json({ error: "Too many uploads — slow down" }, { status: 429 });

    const pathname = body.payload.pathname;
    const parsed = parseUploadPathname(pathname);
    caps = uploadCaps(pathname);
    if (!parsed || !caps) return NextResponse.json({ error: "Unsupported upload" }, { status: 400 });

    const { db } = await connectToDatabase();
    const waitSec = await uploadQuotaWaitSec(db, session.id, parsed.kind);
    if (waitSec > 0) {
      return NextResponse.json(
        { error: "You've reached your upload limit for now — try again later.", retry_in_sec: waitSec },
        { status: 429, headers: { "Retry-After": String(waitSec) } }
      );
    }
    try {
      await claimUpload(db, pathname, session.id, parsed.kind === "take" && Boolean(privateBlobToken()));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Upload refused" }, { status: 409 });
    }
    ownerId = session.id;
  }

  // Takes go to the private store (lib/media-access.ts); avatars stay public.
  const blobUrl = body.type === "blob.upload-completed" ? body.payload.blob.url : "";
  const isTake =
    body.type === "blob.generate-client-token"
      ? parseUploadPathname(body.payload.pathname)?.kind === "take"
      : blobUrl.includes(".private.blob.vercel-storage.com/");
  const token = (isTake && privateBlobToken()) || undefined;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token,
      // Everything was checked above; this only shapes the token.
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: caps!.contentTypes,
        maximumSizeInBytes: caps!.maxBytes,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: ownerId }),
      }),
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
