import { JOB_ID_PATTERN, readStatus } from "@/services/captured";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!JOB_ID_PATTERN.test(id)) {
    return Response.json({ error: "Unknown scan." }, { status: 404 });
  }
  const status = await readStatus(id);
  if (!status) {
    return Response.json({ error: "Unknown scan." }, { status: 404 });
  }
  return Response.json(status);
}
