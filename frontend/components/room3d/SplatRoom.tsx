"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import type { Product } from "@shared/types";
import type { SplatConfig } from "@/services/scenes";
import { Hotspot } from "@/components/room/Hotspot";
import type { ViewMode } from "./RoomCanvas";

/*
  Photoreal scanned room (Gaussian splat from a phone video, Marble, Polycam...).
  Unlike baked rooms, objects aren't separate meshes, so products are made
  clickable with tags: points our team places on each item (see /admin/tag).
*/

const deg = (v: number) => THREE.MathUtils.degToRad(v);
const v3 = (p: [number, number, number]) => new THREE.Vector3(...p);

export function SplatRoom({
  config,
  onProgress,
  onLoaded,
  onPick,
}: {
  config: SplatConfig;
  onProgress?: (fraction: number) => void;
  onLoaded?: () => void;
  /** Called with the world-space point under a click (used by the tagging tool). */
  onPick?: (point: THREE.Vector3) => void;
}) {
  const { gl, scene, camera, raycaster, pointer } = useThree();
  const meshRef = useRef<SplatMesh | null>(null);

  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl });
    scene.add(spark);
    const mesh = new SplatMesh({
      url: config.url,
      raycastable: Boolean(onPick),
      onProgress: (e) => e.total && onProgress?.(e.loaded / e.total),
    });
    const [rx, ry, rz] = config.rotation ?? [0, 0, 0];
    mesh.rotation.set(deg(rx), deg(ry), deg(rz));
    mesh.scale.setScalar(config.scale ?? 1);
    mesh.position.copy(v3(config.position ?? [0, 0, 0]));
    scene.add(mesh);
    meshRef.current = mesh;
    mesh.initialized.then(() => onLoaded?.());
    return () => {
      scene.remove(mesh);
      scene.remove(spark);
      mesh.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.url, gl, scene]);

  // Tagging tool: report the point on the scan under the cursor.
  useEffect(() => {
    if (!onPick) return;
    const el = gl.domElement;
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || !meshRef.current) return;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(meshRef.current, false);
      if (hits[0]) onPick(hits[0].point.clone());
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
    };
  }, [onPick, gl, raycaster, pointer, camera]);

  return null;
}

/** Product tags floating over a scanned room. */
export function SplatTags({
  tags,
  products,
  activeId,
  onSelect,
}: {
  tags: SplatConfig["tags"];
  products: Record<string, Product>;
  activeId?: string | null;
  onSelect: (productId: string) => void;
}) {
  return (
    <>
      {(tags ?? []).map((t, i) => {
        const p = products[t.productId];
        if (!p) return null;
        return (
          <Html key={`${t.productId}-${i}`} position={t.position} center zIndexRange={[20, 0]}>
            <button type="button" className="group/spot rounded-full" onClick={() => onSelect(p.id)} aria-label={p.name}>
              <Hotspot label={p.name} price={p.priceCents} active={activeId === p.id} delay={0.2 + i * 0.05} />
            </button>
          </Html>
        );
      })}
    </>
  );
}

/** Overview = orbit around the room; walk = stand at the capture spot and look around. */
export function SplatCameraRig({ config, mode, resetKey }: { config: SplatConfig; mode: ViewMode; resetKey: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const target = useMemo(() => v3(config.view.target), [config.view.target]);

  useEffect(() => {
    const c = controls.current;
    if (mode === "overview") {
      camera.position.copy(v3(config.view.overview));
      c?.target.copy(target);
    } else {
      const eye = v3(config.view.eye);
      camera.position.copy(eye);
      // Orbiting around a point just ahead of the eye = looking around in place.
      c?.target.copy(eye.clone().add(target.clone().sub(eye).normalize().multiplyScalar(0.05)));
    }
    c?.update();
  }, [mode, resetKey, camera, config.view, target]);

  useFrame(() => controls.current?.update());

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableZoom={mode === "overview"}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={mode === "walk" ? -0.35 : 0.8}
      minDistance={mode === "overview" ? 0.6 : 0.01}
      maxDistance={mode === "overview" ? 8 : 0.1}
    />
  );
}
