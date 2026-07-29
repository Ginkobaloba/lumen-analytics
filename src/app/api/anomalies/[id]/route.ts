import { NextResponse } from "next/server";
import { getAnomalyDetail } from "@/lib/anomaly-detail";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const detail = getAnomalyDetail(params.id);
  if (!detail) {
    return NextResponse.json({ error: "Anomaly not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
