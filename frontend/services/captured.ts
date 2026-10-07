import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { RoomScene } from "./scenes";

// Phone scans: uploads land in 3d-engine/captures-in, the worker in
// 3d-engine/capture/process_job.py turns them into splats and lists them here.

const ENGINE = path.resolve(process.cwd(), "..", "3d-engine");
const INBOX = path.join(ENGINE, "captures-in");
const OUT = path.join(ENGINE, "captures-out");
const LOCK = path.join(OUT, ".worker.pid");
const MANIFEST = path.join(process.cwd(), "services", "captured-scenes.json");
const WORKER = path.join(ENGINE, "capture", "process_job.py");

export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
export const JOB_ID_PATTERN = /^scan-[a-z0-9]{6,20}-[a-f0-9]{6}$/;

export type JobState = "queued" | "processing" | "publishing" | "done" | "failed";

export interface JobStatus {
  id: string;
  state: JobState;
  message: string;
  updated: string;
  scene?: string;
}

export function newJobId(): string {
  return `scan-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

export async function saveUpload(id: string, data: Buffer): Promise<void> {
  await fs.mkdir(INBOX, { recursive: true });
  await fs.writeFile(path.join(INBOX, `${id}.mp4`), data);
  await writeStatus({ id, state: "queued", message: "Waiting for the GPU", updated: new Date().toISOString() });
  await startWorker();
}

export async function readStatus(id: string): Promise<JobStatus | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(OUT, id, "status.json"), "utf-8")) as JobStatus;
  } catch {
    return null;
  }
}

async function writeStatus(status: JobStatus): Promise<void> {
  await fs.mkdir(path.join(OUT, status.id), { recursive: true });
  await fs.writeFile(path.join(OUT, status.id, "status.json"), JSON.stringify(status, null, 2));
}

// One worker drains the queue. The lock file holds its pid so we never run two at once.
async function startWorker(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true });
  try {
    const pid = Number(await fs.readFile(LOCK, "utf-8"));
    process.kill(pid, 0);
    return; // already running; it will pick up the new job
  } catch {
    // no live worker
  }
  const child = spawn("python", [WORKER, "--drain"], {
    cwd: path.dirname(WORKER),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  if (child.pid) await fs.writeFile(LOCK, String(child.pid));
}

export async function getCapturedScenes(): Promise<RoomScene[]> {
  let entries: { id: string; name: string; style: string; splat: NonNullable<RoomScene["splat"]> }[] = [];
  try {
    entries = JSON.parse(await fs.readFile(MANIFEST, "utf-8"));
  } catch {
    return [];
  }
  return entries.map((e) => ({
    id: e.id,
    name: e.name,
    style: e.style,
    styleSlug: "warm-minimal",
    model: "",
    size: { width: 5, depth: 5, height: 2.8 },
    walkStart: { x: 0, y: 0, lookAt: { x: 0, y: 0 } },
    productIds: [],
    splat: e.splat,
  }));
}
