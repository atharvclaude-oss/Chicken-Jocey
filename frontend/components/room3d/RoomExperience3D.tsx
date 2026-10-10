"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useProgress } from "@react-three/drei";
import { ArrowCounterClockwise, Cube, PersonSimpleWalk } from "@phosphor-icons/react";
import type { Product } from "@shared/types";
import type { RoomScene } from "@/services/scenes";
import { ProductDrawer } from "@/components/room/ProductDrawer";
import { useRoomStore } from "@/store/room";
import { track } from "@/utils/analytics";
import { replaceQuery } from "@/utils/url-state";
import { Room8Loader } from "@/components/brand/Room8Loader";
import { RoomCanvas, type ViewMode } from "./RoomCanvas";

function LoadingOverlay({ splatProgress }: { splatProgress?: number }) {
  const loader = useProgress();
  const active = splatProgress !== undefined ? splatProgress < 1 : loader.active;
  const progress = splatProgress !== undefined ? splatProgress * 100 : loader.progress;
  if (!active && progress >= 100) return null;
  return <Room8Loader progress={progress} delayMs={150} />;
}

export function RoomExperience3D({
  room,
  products,
  roomCounts,
  initialProductId = null,
  initialMode = "overview",
}: {
  room: RoomScene;
  products: Product[];
  roomCounts: Record<string, number>;
  /** From the URL, so Back from a product page reopens the same piece. */
  initialProductId?: string | null;
  initialMode?: ViewMode;
}) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [resetKey, setResetKey] = useState(0);
  const [splatProgress, setSplatProgress] = useState(0);
  const selectedProductId = useRoomStore((s) => s.selectedProductId);
  const selectProduct = useRoomStore((s) => s.selectProduct);

  const productsById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const selected = selectedProductId ? productsById[selectedProductId] ?? null : null;

  // The selection store is global: reset it to this room's URL state on entry,
  // so a piece from the previous room never lingers.
  useEffect(() => {
    selectProduct(initialProductId && productsById[initialProductId] ? initialProductId : null);
    // Only on entering the room; later changes flow the other way, into the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  useEffect(() => {
    replaceQuery({ product: selected?.id ?? null, view: mode === "walk" ? "walk" : null });
  }, [selected, mode]);

  const handleSelect = useCallback(
    (id: string) => {
      selectProduct(id);
      track("product_clicked", { productId: id, roomId: room.id, view: "3d" });
    },
    [room.id, selectProduct],
  );

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-stage">
      <RoomCanvas
        room={room}
        products={productsById}
        mode={mode}
        resetKey={resetKey}
        onSelect={handleSelect}
        onSplatProgress={setSplatProgress}
      />
      <LoadingOverlay splatProgress={room.splat ? splatProgress : undefined} />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 md:p-6">
        <div className="text-white">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">{room.name}</h1>
          <p className="mt-0.5 text-sm text-white/60">{room.style}</p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
        <p className="rounded-full bg-black/45 px-4 py-2 text-center text-xs text-white/80 backdrop-blur-md">
          {mode === "overview"
            ? "Drag to orbit · scroll to zoom · click any highlighted piece to shop it."
            : "Drag to look around · click the floor to walk · click a piece to shop it."}
        </p>
        <div className="flex items-center gap-1.5 rounded-full bg-black/55 p-1.5 text-white backdrop-blur-md">
          <ModeButton active={mode === "overview"} onClick={() => setMode("overview")} icon={<Cube size={18} />}>
            Overview
          </ModeButton>
          <ModeButton active={mode === "walk"} onClick={() => setMode("walk")} icon={<PersonSimpleWalk size={18} />}>
            Walk
          </ModeButton>
          <button
            type="button"
            onClick={() => setResetKey((k) => k + 1)}
            aria-label="Reset view"
            title="Reset view"
            className="grid size-10 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowCounterClockwise size={18} />
          </button>
        </div>
      </div>

      <ProductDrawer
        product={selected}
        roomId={room.id}
        otherRoomCount={selected ? Math.max(0, (roomCounts[selected.id] ?? 1) - 1) : 0}
        onClose={() => selectProduct(null)}
      />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
        active ? "bg-white text-[#131416]" : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
