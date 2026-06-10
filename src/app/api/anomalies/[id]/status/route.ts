import { NextResponse } from "next/server";
import { applyAnomalyAction, type AnomalyAction } from "@/lib/anomaly-actions";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  let body: AnomalyAction;
  try {
    body = (await request.json()) as AnomalyAction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = applyAnomalyAction(params.id, body);
  if (!result.ok) {
    const code = result.error === "Anomaly not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status: code });
  }
  return NextResponse.json(result);
}
