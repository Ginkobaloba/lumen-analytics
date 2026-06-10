import { NextResponse } from "next/server";
import { getAnomalyDetail } from "@/lib/anomaly-detail";

export const dynamic = "force-dynamic";

export function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const detail = getAnomalyDetail(params.id);
  if (!detail) {
    return NextResponse.json({ error: "Anomaly not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
