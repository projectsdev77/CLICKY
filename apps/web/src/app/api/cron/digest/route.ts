import { NextResponse } from "next/server";
import { sendWeeklyDigests } from "@/lib/digest";

/** Weekly insight digest. Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await sendWeeklyDigests());
}
