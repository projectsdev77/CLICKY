import { NextResponse } from "next/server";
import { sql } from "@clicky/db";
import { db } from "@/lib/db";

/** For uptime monitoring: 200 when the app and database are up. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
