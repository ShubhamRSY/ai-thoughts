import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSiteSettings } from "@/lib/admin";
import { connectToDatabase } from "@/lib/mongodb";
import { reportError } from "@/lib/report-error";

/** The human-picked voice, or null if none is set / it was deleted or archived. */
async function getFeatured(id: string) {
  if (!id || !ObjectId.isValid(id)) return null;
  const { db } = await connectToDatabase();
  const p = await db
    .collection("posts")
    .findOne({ _id: new ObjectId(id), archived: { $ne: true } });
  const content = typeof p?.content === "string" ? p.content.trim() : "";
  if (!p || !content) return null;
  return {
    id,
    author: String(p.author || p.handle || ""),
    feeling: p.feeling ?? null,
    content: content.slice(0, 400),
  };
}

/** Public site flags — safe for clients (no secrets). */
export async function GET() {
  try {
    const settings = await getSiteSettings();
    return NextResponse.json(
      {
        maintenance: settings.maintenance,
        maintenanceMessage: settings.maintenanceMessage,
        invitesOpen: settings.invitesOpen,
        featured: await getFeatured(settings.featuredPostId),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    reportError(e, { route: "api/site", service: "mongodb" });
    return NextResponse.json({
      maintenance: false,
      maintenanceMessage: "",
      invitesOpen: true,
      featured: null,
    });
  }
}
