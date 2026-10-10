"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { RoomScene } from "@/services/scenes";

/*
  Every room becomes a cutaway diorama on one turning ring. Rooms are scaled so
  their longest side matches SLOT, centered on their own footprint, and turned
  to face outward, so the ring's front slot always shows a room's open side.
  Room glTF coords: x in [0, W], z in [-D, 0], y up (see RoomCanvas).
*/
const SLOT = 4.4;
const RADIUS = 6.4;
const DIM = 0.32; // brightness of rooms away from the front

const wrap = (v: number, n: number) => ((((v + n / 2) % n) + n) % n) - n / 2;

function useDioramaScene(room: RoomScene) {
  const { scene } = useGLTF(room.model);
  return useMemo(() => {
    const root = scene.clone(true);
    const walls: Record<string, THREE.Object3D[]> = { front: [], back: [], left: [], right: [], ceiling: [] };
    const materials: THREE.MeshBasicMaterial[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
      const map = src.emissiveMap ?? src.map;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      const thin = /_blind$/.test(mesh.name) || /_blind$/.test(mesh.parent?.name ?? "");
      const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false, side: thin ? THREE.DoubleSide : THREE.FrontSide });
      mesh.material = mat;
      materials.push(mat);
      const name =
        [mesh.name, mesh.parent?.name ?? ""].find((n) => /^(wall_|baseboard_|window_|door_|ceiling)/.test(n)) ?? mesh.name;
      for (const side of ["front", "back", "left", "right"]) {
        if (["wall_", "baseboard_", "window_", "door_"].some((p) => name.startsWith(p + side)) ||
          (side === "right" && /^window_(frame|mullion|sill)/.test(name))) {
          walls[side].push(mesh);
        }
      }
      if (name.startsWith("ceiling")) walls.ceiling.push(mesh);
    });
    return { root, walls, materials };
  }, [scene]);
}

function Diorama({
  room,
  index,
  count,
  displayRef,
  onClick,
}: {
  room: RoomScene;
  index: number;
  count: number;
  displayRef: React.RefObject<number>;
  onClick: (index: number, e: ThreeEvent<MouseEvent>) => void;
}) {
  const { root, walls, materials } = useDioramaScene(room);
  const camera = useThree((s) => s.camera);
  const slot = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const { width: W, depth: D, height: H } = room.size;
  const scale = SLOT / Math.max(W, D);
  const camLocal = useMemo(() => new THREE.Vector3(), []);
  const lastBright = useRef(-1);

  useFrame(({ clock }) => {
    if (!slot.current || !turn.current) return;
    const rel = wrap(index - displayRef.current, count);
    const theta = (rel * Math.PI * 2) / count;
    const focus = THREE.MathUtils.clamp(1 - Math.abs(rel), 0, 1);
    slot.current.position.set(RADIUS * Math.sin(theta), 0, RADIUS * Math.cos(theta) - RADIUS);
    // The front room breathes: a slow sway so it reads as a space, not a picture.
    turn.current.rotation.y = theta + focus * Math.sin(clock.elapsedTime * 0.35) * 0.16;
    const s = scale * (0.84 + 0.16 * focus);
    turn.current.scale.setScalar(s);

    const bright = Math.round((DIM + (1 - DIM) * focus) * 100) / 100;
    if (bright !== lastBright.current) {
      for (const m of materials) m.color.setScalar(bright);
      lastBright.current = bright;
    }

    // Dollhouse cutaway, in this room's own frame: hide walls facing the camera.
    root.worldToLocal(camLocal.copy(camera.position));
    const c = camLocal;
    const hide = { front: c.z > 0, back: c.z < -D, left: c.x < 0, right: c.x > W, ceiling: c.y > H - 0.2 };
    for (const [side, objs] of Object.entries(walls)) {
      for (const o of objs) o.visible = !hide[side as keyof typeof hide];
    }
  });

  return (
    <group ref={slot}>
      <group ref={turn}>
        <primitive
          object={root}
          position={[-W / 2, 0, D / 2]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (e.delta > 6) return; // a drag, not a click
            e.stopPropagation();
            onClick(index, e);
          }}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => (document.body.style.cursor = "")}
        />
      </group>
    </group>
  );
}

/** Soft pool of light on the floor under the ring, so rooms sit on something. */
function FloorGlow() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,0.10)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.035)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, -RADIUS * 0.35]}>
      <planeGeometry args={[RADIUS * 3.2, RADIUS * 3.2]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Turns the ring toward the target slot; drag on the canvas spins it by hand. */
function RingRig({
  target,
  count,
  displayRef,
  onSettle,
}: {
  target: number;
  count: number;
  displayRef: React.RefObject<number>;
  onSettle: (slot: number) => void;
}) {
  const { camera, gl, size } = useThree();
  const drag = useRef<{ x: number; start: number } | null>(null);

  // Frame the front room on any screen shape: back off on narrow screens.
  useEffect(() => {
    const aspect = size.width / size.height;
    const k = Math.max(1, (1.25 / aspect) ** 0.7);
    camera.position.set(0, 3.9 * k, 8.6 * k);
    camera.lookAt(0, 0.7, -0.4);
  }, [camera, size]);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => (drag.current = { x: e.clientX, start: displayRef.current });
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      displayRef.current = drag.current.start - (dx / el.clientWidth) * count * 0.6;
    };
    const up = (e: PointerEvent) => {
      if (!drag.current) return;
      const moved = Math.abs(e.clientX - drag.current.x) > 6;
      drag.current = null;
      if (moved) onSettle(Math.round(displayRef.current));
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl, count, displayRef, onSettle]);

  useFrame((_, dt) => {
    if (drag.current) return;
    displayRef.current = THREE.MathUtils.damp(displayRef.current, target, 4.2, dt);
  });
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

export function RoomRing({
  scenes,
  target,
  onSettle,
  onPick,
  onEnter,
  onReady,
}: {
  scenes: RoomScene[];
  target: number;
  onSettle: (slot: number) => void;
  onPick: (index: number) => void;
  onEnter: () => void;
  onReady: () => void;
}) {
  const displayRef = useRef(target);
  const count = scenes.length;
  const activeIndex = ((target % count) + count) % count;

  useEffect(() => () => void (document.body.style.cursor = ""), []);

  return (
    <Canvas flat dpr={[1, 1.75]} camera={{ fov: 38, near: 0.1, far: 120 }} style={{ touchAction: "pan-y" }}>
      <color attach="background" args={["#000000"]} />
      <fog attach="fog" args={["#000000", 12, 24]} />
      <FloorGlow />
      <Suspense fallback={null}>
        {scenes.map((room, i) => (
          <Diorama
            key={room.id}
            room={room}
            index={i}
            count={count}
            displayRef={displayRef}
            onClick={(index) => (index === activeIndex ? onEnter() : onPick(index))}
          />
        ))}
        <Ready onReady={onReady} />
      </Suspense>
      <RingRig target={target} count={count} displayRef={displayRef} onSettle={onSettle} />
    </Canvas>
  );
}
