"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Product } from "@shared/types";
import type { RoomScene, SplatConfig } from "@/services/scenes";
import { Button } from "@/components/common/Button";
import { SplatRoom } from "@/components/room3d/SplatRoom";
import { formatPrice } from "@/utils/format";

/*
  Internal tool: align a scanned room and tag the products in it.
  1. Straighten the scan (rotation / scale) until the floor is level.
  2. Frame a good overview and save it, then a standing spot for walk mode.
  3. Pick a product on the right, click the item in the room to drop a tag.
  4. Copy the JSON into services/scenes.ts (until the backend stores it).
  Drafts are kept in this browser's localStorage per room.
*/

type Tag = NonNullable<SplatConfig["tags"]>[number];
type Draft = Pick<SplatConfig, "rotation" | "scale" | "position" | "view" | "tags">;

const round = (v: number) => Math.round(v * 1000) / 1000;
const vec = (v: THREE.Vector3): [number, number, number] => [round(v.x), round(v.y), round(v.z)];

function CameraProbe({ onReady }: { onReady: (get: () => { position: THREE.Vector3; target: THREE.Vector3 }) => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    onReady(() => ({ position: camera.position.clone(), target: controls.current?.target.clone() ?? new THREE.Vector3() }));
  }, [camera, onReady]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.1} />;
}

function InitialView({ view }: { view: SplatConfig["view"] }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: OrbitControlsImpl | null };
  // Start at the walk-mode standing spot: it's inside the captured area, so
  // it's the sharpest view of a scan (and matches what shoppers see first).
  useEffect(() => {
    const eye = new THREE.Vector3(...view.eye);
    const dir = new THREE.Vector3(...view.target).sub(eye).normalize();
    camera.position.copy(eye);
    controls?.target.copy(eye.clone().add(dir.multiplyScalar(0.05)));
    controls?.update();
  }, [camera, controls, view]);
  return null;
}

export function TagEditor({ room, products }: { room: RoomScene; products: Product[] }) {
  const base = room.splat!;
  const storageKey = `tag-draft:${room.id}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { rotation: base.rotation ?? [0, 0, 0], scale: base.scale ?? 1, position: base.position ?? [0, 0, 0], view: base.view, tags: base.tags ?? [] };
  });
  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const getCamera = useRef<() => { position: THREE.Vector3; target: THREE.Vector3 }>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {}
  }, [draft, storageKey]);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const filtered = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const config: SplatConfig = { ...base, ...draft };

  const onPick = useCallback(
    (point: THREE.Vector3) => {
      if (!activeProduct) return;
      setDraft((d) => ({ ...d, tags: [...(d.tags ?? []), { productId: activeProduct, position: vec(point) }] }));
    },
    [activeProduct],
  );

  const saveView = (key: "overview" | "eye") => {
    const cam = getCamera.current?.();
    if (!cam) return;
    setDraft((d) => ({ ...d, view: { ...d.view!, [key]: vec(cam.position), target: vec(cam.target) } }));
  };

  const setRot = (axis: 0 | 1 | 2, value: number) =>
    setDraft((d) => {
      const r = [...(d.rotation ?? [0, 0, 0])] as [number, number, number];
      r[axis] = value;
      return { ...d, rotation: r };
    });

  const json = JSON.stringify(draft, null, 2);

  return (
    <div className="grid h-[calc(100dvh-4rem)] grid-cols-1 lg:grid-cols-[1fr_360px]">
      <div className="relative bg-stage">
        <Canvas flat dpr={[1, 2]} camera={{ fov: 62, near: 0.02, far: 200 }} gl={{ antialias: false }}>
          {/* Remount on alignment changes so raycasts use the new transform. */}
          <SplatRoom key={JSON.stringify([draft.rotation, draft.scale, draft.position])} config={config} onPick={onPick} />
          <CameraProbe onReady={(g) => (getCamera.current = g)} />
          <InitialView view={base.view} />
          {(draft.tags ?? []).map((t: Tag, i) => (
            <Html key={i} position={t.position} center>
              <div className="whitespace-nowrap rounded-full bg-accent px-2 py-1 text-[11px] font-medium text-accent-fg shadow">
                {byId[t.productId]?.name ?? t.productId}
              </div>
            </Html>
          ))}
        </Canvas>
        <p className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-black/60 px-4 py-2 text-xs text-white">
          {activeProduct ? `Click the ${byId[activeProduct]?.name} in the room to tag it` : "Pick a product on the right, then click it in the room"}
        </p>
      </div>

      <aside className="flex min-h-0 flex-col gap-6 overflow-y-auto border-l border-line bg-surface p-5 [&>*]:shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Tag room: {room.name}</h1>
          <p className="mt-1 text-sm text-muted">Internal tool. Drafts save in this browser.</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">1. Straighten the scan</h2>
          {(["X", "Y", "Z"] as const).map((axis, i) => (
            <label key={axis} className="flex items-center gap-3 text-sm">
              <span className="w-14 text-muted">Rotate {axis}</span>
              <input type="range" min={-180} max={180} step={1} value={draft.rotation?.[i] ?? 0}
                onChange={(e) => setRot(i as 0 | 1 | 2, Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
              <span className="w-10 text-right font-mono text-xs">{draft.rotation?.[i] ?? 0}°</span>
            </label>
          ))}
          <label className="flex items-center gap-3 text-sm">
            <span className="w-14 text-muted">Scale</span>
            <input type="range" min={0.2} max={3} step={0.01} value={draft.scale ?? 1}
              onChange={(e) => setDraft((d) => ({ ...d, scale: Number(e.target.value) }))} className="flex-1 accent-[var(--accent)]" />
            <span className="w-10 text-right font-mono text-xs">{(draft.scale ?? 1).toFixed(2)}</span>
          </label>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">2. Save camera views</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => saveView("overview")}>Save overview</Button>
            <Button variant="secondary" onClick={() => saveView("eye")}>Save walk spot</Button>
          </div>
        </section>

        <section className="min-h-0 space-y-2">
          <h2 className="text-sm font-medium">3. Tag products</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search catalogue"
            aria-label="Search catalogue"
            className="w-full rounded-control border border-line bg-bg px-3 py-2 text-sm"
          />
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setActiveProduct(p.id === activeProduct ? null : p.id)}
                  className={`flex w-full justify-between rounded-control px-3 py-2 text-left text-sm ${
                    p.id === activeProduct ? "bg-fg text-bg" : "hover:bg-sunken"
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="font-mono text-xs">{formatPrice(p.priceCents)}</span>
                </button>
              </li>
            ))}
          </ul>
          {(draft.tags ?? []).length > 0 && (
            <ul className="space-y-1 border-t border-line pt-2 text-sm">
              {(draft.tags ?? []).map((t, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="truncate">{byId[t.productId]?.name ?? t.productId}</span>
                  <button type="button" className="text-muted hover:text-fg"
                    onClick={() => setDraft((d) => ({ ...d, tags: (d.tags ?? []).filter((_, j) => j !== i) }))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">4. Save to the site</h2>
          <Button
            className="w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(json);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy room JSON"}
          </Button>
          <pre className="max-h-40 overflow-auto rounded-control bg-sunken p-3 text-[11px]">{json}</pre>
        </section>
      </aside>
    </div>
  );
}
