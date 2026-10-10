"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type JobState = "queued" | "processing" | "publishing" | "done" | "failed";
interface Job {
  id: string;
  state: JobState;
  message: string;
}

const STEPS: { state: JobState; label: string }[] = [
  { state: "queued", label: "Uploaded" },
  { state: "processing", label: "Building the 3D room" },
  { state: "publishing", label: "Publishing" },
  { state: "done", label: "Ready" },
];

const TIPS = [
  "Stand near the middle of the room and turn slowly, holding the phone upright at chest height.",
  "Walk the perimeter, keeping the camera pointed at the walls, furniture and ceiling.",
  "Move steadily: don't spin in place or sweep quickly. Aim for 1–2 minutes.",
  "Use bright, even light. Turn off ceiling fans and avoid mirrors and windows at night.",
];

export default function CapturePage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!job || job.state === "done" || job.state === "failed") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/captures/${job.id}`, { cache: "no-store" });
      if (res.ok) setJob((await res.json()) as Job);
    }, 4000);
    return () => clearInterval(timer);
  }, [job]);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("video", file);
      const res = await fetch("/api/captures", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      setJob({ id: body.id, state: "queued", message: "Waiting for the GPU" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = job ? STEPS.findIndex((s) => s.state === job.state) : -1;

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-8">
      <Link href="/" className="text-sm text-muted hover:text-fg">← Back to rooms</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Scan your room</h1>
      <p className="mt-3 text-muted">Record a short video with your phone. We turn it into a photorealistic 3D room you can shop.</p>

      <ul className="mt-6 space-y-3 text-sm">
        {TIPS.map((t) => (
          <li key={t} className="rounded-card border border-line bg-surface px-4 py-3">{t}</li>
        ))}
      </ul>

      {!job && (
        <form onSubmit={upload} className="mt-8 space-y-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Room video</span>
            <input
              type="file"
              accept="video/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full rounded-card border border-line bg-surface px-4 py-6 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-fg file:px-4 file:py-2 file:text-bg"
            />
          </label>
          {file && <p className="text-sm text-muted">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={!file || busy}
            className="w-full rounded-full bg-accent px-6 py-3 font-medium text-accent-fg disabled:opacity-40"
          >
            {busy ? "Uploading…" : "Upload and build my room"}
          </button>
        </form>
      )}

      {job && (
        <section className="mt-8" aria-live="polite">
          <ol className="space-y-3">
            {STEPS.map((s, i) => {
              const done = stepIndex >= i || job.state === "done";
              const current = stepIndex === i && job.state !== "done";
              return (
                <li key={s.state} className="flex items-center gap-3">
                  <span
                    className={`grid size-6 place-items-center rounded-full text-xs ${
                      done ? "bg-accent text-accent-fg" : current ? "border-2 border-accent" : "border border-line text-muted"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={done || current ? "text-fg" : "text-muted"}>{s.label}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 text-sm text-muted">{job.message}</p>

          {job.state === "failed" && (
            <button type="button" onClick={() => setJob(null)} className="mt-6 rounded-full border border-line px-5 py-2 text-sm">
              Try another video
            </button>
          )}
          {job.state === "done" && (
            <Link href="/" className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-medium text-accent-fg">
              View my room
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
