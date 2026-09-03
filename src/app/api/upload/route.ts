import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { GridFSBucket } from "mongodb";

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const bucket = new GridFSBucket(db, { bucketName: "uploads" });
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() ?? "bin";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const uploadStream = bucket.openUploadStream(filename, {
      metadata: { contentType: file.type || "application/octet-stream" },
    });

    await new Promise<void>((resolve, reject) => {
      uploadStream.on("error", reject);
      uploadStream.on("finish", resolve);
      uploadStream.end(buffer);
    });

    return NextResponse.json({ ok: true, id: uploadStream.id.toString(), filename });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
