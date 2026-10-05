"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Product } from "@shared/types";
import type { RoomScene } from "@/services/scenes";
import { formatPrice } from "@/utils/format";
import { SplatCameraRig, SplatRoom, SplatTags } from "./SplatRoom";
import { track } from "@/utils/analytics";

export type ViewMode = "overview" | "walk";

/*
  Coordinates: the Blender spec uses x = width, y = depth, z = up. glTF export
  converts that to three.js Y-up, so a room point (x, y, z) becomes (x, z, -y).
*/
const toWorld = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y);
const EYE = 1.6;

/** Walk up the parent chain to find the glTF extras tag for a product. */
function productIdOf(obj: THREE.Object3D | null): string | null {
  for (let o = obj; o; o = o.parent) {
    if (typeof o.userData?.productId === "string") return o.userData.productId;
  }
  return null;
}

function Room({
  scene: room,
  mode,
  products,
  hoveredId,
  onHover,
  onSelect,
  onWalkTo,
}: {
  scene: RoomScene;
  mode: ViewMode;
  products: Record<string, Product>;
  hoveredId: string | null;
  onHover: (id: string | null, point?: THREE.Vector3) => void;
  onSelect: (id: string) => void;
  onWalkTo: (p: THREE.Vector3) => void;
}) {
  const { scene } = useGLTF(room.model);
  const camera = useThree((s) => s.camera);
  const { width: W, depth: D, height: H } = room.size;

  // Baked lighting lives in the emissive texture: show it unlit, exactly as baked.
  const groups = useMemo(() => {
    const walls: Record<string, THREE.Object3D[]> = { front: [], back: [], left: [], right: [], ceiling: [] };
    const productMeshes: Record<string, THREE.Mesh[]> = {};
    scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const mesh = o as THREE.Mesh;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const map = src.emissiveMap ?? src.map;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      // Single-sided except thin cloth (blinds), which is seen from both sides.
      const thin = /_blind$/.test(mesh.name) || /_blind$/.test(mesh.parent?.name ?? "");
      mesh.material = new THREE.MeshBasicMaterial({ map, toneMapped: false, side: thin ? THREE.DoubleSide : THREE.FrontSide });
      // Multi-material nodes import as a Group of meshes; the node name is on the group.
      const name =
        [mesh.name, mesh.parent?.name ?? ""].find((n) => /^(wall_|baseboard_|window_|ceiling)/.test(n)) ?? mesh.name;
      for (const side of ["front", "back", "left", "right"]) {
        if (name.startsWith(`wall_${side}`) || name.startsWith(`baseboard_${side}`) || name.startsWith(`window_${side}`) ||
          // rooms exported before windows were named per side
          (side === "right" && /^window_(frame|mullion|sill)/.test(name))) {
          walls[side].push(mesh);
        }
      }
      if (name.startsWith("ceiling")) walls.ceiling.push(mesh);
      const pid = productIdOf(mesh);
      if (pid) (productMeshes[pid] ??= []).push(mesh);
    });
    return { walls, productMeshes };
  }, [scene]);

  // Dollhouse cutaway: hide whichever walls sit between the camera and the room.
  useFrame(() => {
    const c = camera.position;
    const overview = mode === "overview";
    const hide = {
      front: overview && c.z > 0,
      back: overview && c.z < -D,
      left: overview && c.x < 0,
      right: overview && c.x > W,
      ceiling: overview && c.y > H - 0.2,
    };
    for (const [side, objs] of Object.entries(groups.walls)) {
      for (const o of objs) o.visible = !hide[side as keyof typeof hide];
    }
  });

  // Hover highlight: brighten the hovered product's baked texture slightly.
  useEffect(() => {
    for (const [pid, meshes] of Object.entries(groups.productMeshes)) {
      for (const m of meshes) (m.material as THREE.MeshBasicMaterial).color.setScalar(pid === hoveredId ? 1.35 : 1);
    }
  }, [hoveredId, groups]);

  // Hidden cutaway walls still intersect rays; only count what's actually shown.
  const firstVisible = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.intersections.find((i) => i.object.visible);

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const hit = firstVisible(e);
    const pid = hit ? productIdOf(hit.object) : null;
    onHover(pid && products[pid] ? pid : null, hit?.point);
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // that was a drag, not a click
    e.stopPropagation();
    const hit = firstVisible(e);
    if (!hit) return;
    const pid = productIdOf(hit.object);
    if (pid && products[pid]) return onSelect(pid);
    // Walk mode: clicking the floor glides you there.
    if (mode === "walk" && hit.object.name.startsWith("floor") && hit.face && hit.face.normal.y > 0.5) {
      onWalkTo(hit.point);
    }
  };

  return (
    <primitive
      object={scene}
      onPointerMove={handleMove}
      onPointerOut={() => onHover(null)}
      onClick={handleClick}
    />
  );
}

/** Drives the camera: orbit controls in overview, drag-to-look + glide in walk mode. */
function CameraRig({
  room,
  mode,
  walkTarget,
  resetKey,
}: {
  room: RoomScene;
  mode: ViewMode;
  walkTarget: THREE.Vector3 | null;
  resetKey: number;
}) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const { width: W, depth: D } = room.size;
  const center = useMemo(() => toWorld(W / 2, D / 2, 0.6), [W, D]);
  const look = useRef({ yaw: 0, pitch: -0.08 });
  const goal = useRef<THREE.Vector3 | null>(null);

  // Enter a mode (or reset): place the camera.
  useEffect(() => {
    if (mode === "overview") {
      camera.position.copy(toWorld(W / 2 - 1.2, -3.6, 5.6));
      controls.current?.target.copy(center);
      controls.current?.update();
    } else {
      const s = room.walkStart;
      const pos = toWorld(s.x, s.y, EYE);
      const dir = toWorld(s.lookAt.x, s.lookAt.y, EYE).sub(pos);
      look.current = { yaw: Math.atan2(-dir.x, -dir.z), pitch: -0.08 };
      camera.position.copy(pos);
      goal.current = null;
    }
  }, [mode, resetKey, camera, center, room.walkStart, W]);

  useEffect(() => {
    if (walkTarget) {
      const m = 0.35; // keep a little distance from walls
      goal.current = new THREE.Vector3(
        THREE.MathUtils.clamp(walkTarget.x, m, W - m),
        EYE,
        THREE.MathUtils.clamp(walkTarget.z, -D + m, -m),
      );
    }
  }, [walkTarget, W, D]);

  // Drag to look around in walk mode.
  useEffect(() => {
    if (mode !== "walk") return;
    const el = gl.domElement;
    let dragging = false;
    let last = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      look.current.yaw += dx * 0.0042;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch + dy * 0.0042, -1.1, 0.9);
    };
    const up = () => (dragging = false);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [mode, gl]);

  useFrame((_, dt) => {
    if (mode !== "walk") return;
    if (goal.current) {
      camera.position.lerp(goal.current, 1 - Math.exp(-dt * 4));
      if (camera.position.distanceTo(goal.current) < 0.01) goal.current = null;
    }
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
  });

  return (
    <OrbitControls
      ref={controls}
      enabled={mode === "overview"}
      target={center}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={3.5}
      maxDistance={11}
      minPolarAngle={0.15}
      maxPolarAngle={1.35}
      onStart={() => track("room_rotated", { roomId: room.id })}
    />
  );
}

/**
 * The outdoor view only makes sense through the windows (walk mode). From the
 * dollhouse overview you'd see the photo's ground, so use a plain backdrop there.
 */
function Background({ url, rotation = 0, mode }: { url?: string; rotation?: number; mode: ViewMode }) {
  const get = useThree((s) => s.get);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    const t = new THREE.TextureLoader().load(url, (loaded) => {
      loaded.mapping = THREE.EquirectangularReflectionMapping;
      loaded.colorSpace = THREE.SRGBColorSpace;
      setTex(loaded);
    });
    return () => t.dispose();
  }, [url]);
  useEffect(() => {
    get().scene.backgroundRotation.set(0, THREE.MathUtils.degToRad(rotation), 0);
  }, [rotation, get]);
  return mode === "walk" && tex ? <primitive object={tex} attach="background" /> : <color attach="background" args={["#101113"]} />;
}

export function RoomCanvas({
  room,
  products,
  mode,
  resetKey,
  onSelect,
  onSplatProgress,
}: {
  room: RoomScene;
  products: Record<string, Product>;
  mode: ViewMode;
  resetKey: number;
  onSelect: (productId: string) => void;
  onSplatProgress?: (fraction: number) => void;
}) {
  const [hover, setHover] = useState<{ id: string; point: THREE.Vector3 } | null>(null);
  const [walkTarget, setWalkTarget] = useState<THREE.Vector3 | null>(null);
  const hovered = useRef(new Set<string>());

  const handleHover = useCallback((id: string | null, point?: THREE.Vector3) => {
    if (!id || !point) return setHover(null);
    setHover({ id, point: point.clone() });
    if (!hovered.current.has(id)) {
      hovered.current.add(id);
      track("product_hovered", { productId: id, roomId: "3d" });
    }
  }, []);

  useEffect(() => {
    document.body.style.cursor = hover ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);

  const product = hover ? products[hover.id] : null;

  return (
    <Canvas
      flat
      dpr={[1, 2]}
      camera={{ fov: 62, near: 0.05, far: 200 }}
      // Splat rendering doesn't benefit from MSAA and it costs a lot of performance.
      gl={{ antialias: !room.splat }}
      style={{ touchAction: "none" }}
      onPointerMissed={() => setHover(null)}
    >
      <color attach="background" args={["#0b0c0e"]} />
      {room.splat ? (
        <>
          <SplatRoom config={room.splat} onProgress={onSplatProgress} onLoaded={() => onSplatProgress?.(1)} />
          <SplatTags tags={room.splat.tags} products={products} onSelect={onSelect} />
          <SplatCameraRig config={room.splat} mode={mode} resetKey={resetKey} />
        </>
      ) : (
      <>
      <Suspense fallback={null}>
        <Background url={room.background} rotation={room.backgroundRotation} mode={mode} />
        <Room
          scene={room}
          mode={mode}
          products={products}
          hoveredId={hover?.id ?? null}
          onHover={handleHover}
          onSelect={onSelect}
          onWalkTo={(p) => setWalkTarget(p.clone())}
        />
      </Suspense>
      <CameraRig room={room} mode={mode} walkTarget={walkTarget} resetKey={resetKey} />
      </>
      )}
      {product && hover && (
        <Html position={hover.point} center style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <div className="-translate-y-8 whitespace-nowrap rounded-full bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur-md">
            {product.name} <span className="ml-1 font-mono text-white/80">{formatPrice(product.priceCents)}</span>
          </div>
        </Html>
      )}
    </Canvas>
  );
}
