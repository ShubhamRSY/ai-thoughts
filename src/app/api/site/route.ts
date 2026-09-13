import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/admin";

/** Public site flags — safe for clients (no secrets). */
export async function GET() {
  try {
    const settings = await getSiteSettings();
    return NextResponse.json(
      {
        maintenance: settings.maintenance,
        maintenanceMessage: settings.maintenanceMessage,
        invitesOpen: settings.invitesOpen,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({
      maintenance: false,
      maintenanceMessage: "",
      invitesOpen: true,
    });
  }
}
