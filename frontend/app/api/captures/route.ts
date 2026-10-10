import { MAX_UPLOAD_BYTES, newJobId, saveUpload } from "@/services/captured";

const VIDEO = /\.(mp4|mov|m4v|webm)$/i;

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That video is too large. Keep it under 1 GB." }, { status: 413 });
  }
  const form = await request.formData();
  const file = form.get("video");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose a video of the room." }, { status: 400 });
  }
  if (!VIDEO.test(file.name) && !file.type.startsWith("video/")) {
    return Response.json({ error: "Upload a video file (MP4 or MOV)." }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That video is too large. Keep it under 1 GB." }, { status: 413 });
  }
  const id = newJobId();
  await saveUpload(id, Buffer.from(await file.arrayBuffer()));
  return Response.json({ id }, { status: 202 });
}
