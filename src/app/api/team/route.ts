import { NextResponse } from "next/server";
import { TEAM } from "@/lib/data/catalog";

export function GET() {
  return NextResponse.json(
    TEAM.map(({ id, name, role, initials, color }) => ({
      id,
      name,
      role,
      initials,
      color,
    })),
  );
}
