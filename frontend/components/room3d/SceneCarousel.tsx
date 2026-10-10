"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { Product } from "@shared/types";
import type { RoomScene } from "@/services/scenes";
import { useLoading } from "@/store/loading";
import { track } from "@/utils/analytics";
import { pluralize } from "@/utils/format";
import { replaceQuery } from "@/utils/url-state";
import { RoomExperience3D } from "./RoomExperience3D";
import { RoomRing } from "./RoomRing";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Home: every room on one turning 3D ring. The front room can be entered,
 * which swaps the ring for the full room (orbit, walk, shop the pieces).
 */
export function SceneCarousel({
  scenes: allScenes,
  productsByScene,
  roomCounts,
}: {
  scenes: RoomScene[];
  productsByScene: Record<string, Product[]>;
  roomCounts: Record<string, number>;
}) {
  // The ring shows baked glTF rooms; splat-only scenes can't sit in it.
  const scenes = allScenes.filter((s) => !s.splat);
  const count = scenes.length;
  // ?room=<id> reopens that room (and ?product / ?view the piece and view)
  // across Back from a product page, reloads and shared links.
  const searchParams = useSearchParams();
  const linked = scenes.findIndex((s) => s.id === searchParams.get("room"));
  const [target, setTarget] = useState(Math.max(0, linked));
  const [entered, setEntered] = useState<RoomScene | null>(linked >= 0 ? scenes[linked] : null);
  // Piece and view to restore, read once on arrival; entering from the ring starts fresh.
  const [entry, setEntry] = useState(() => ({
    productId: searchParams.get("product"),
    mode: searchParams.get("view") === "walk" ? ("walk" as const) : ("overview" as const),
  }));
  const index = ((target % count) + count) % count;
  const active = scenes[index];

  // Keep the Room8 intro curtain down until the rooms are in.
  const { hold, release } = useLoading.getState();
  const held = useRef(false);
  useEffect(() => {
    hold();
    held.current = true;
    return () => {
      if (held.current) release();
      held.current = false;
    };
  }, [hold, release]);
  const handleReady = useCallback(() => {
    if (held.current) release();
    held.current = false;
  }, [release]);

  const turnTo = useCallback(
    (slot: number) => {
      const to = ((slot % count) + count) % count;
      if (to !== index) track("room_changed", { roomId: scenes[to].id, from: scenes[index].id });
      setTarget(slot);
    },
    [count, index, scenes],
  );
  // Picking a side room turns the short way around.
  const pick = useCallback(
    (i: number) => {
      const delta = ((((i - index + count / 2) % count) + count) % count) - count / 2;
      turnTo(target + delta);
    },
    [count, index, target, turnTo],
  );
  const enter = useCallback(() => {
    track("room_entered", { roomId: active.id });
    setEntry({ productId: null, mode: "overview" });
    setEntered(active);
    replaceQuery({ room: active.id });
  }, [active]);
  const leave = useCallback(() => {
    setEntered(null);
    replaceQuery({ room: null, product: null, view: null });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Leave keys alone while a control (e.g. a quantity stepper) has focus.
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [role=group]")) return;
      if (entered) {
        if (e.key === "Escape") leave();
        return;
      }
      if (e.key === "ArrowRight") turnTo(target + 1);
      if (e.key === "ArrowLeft") turnTo(target - 1);
      if (e.key === "Enter" && document.activeElement === document.body) enter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered, target, turnTo, enter, leave]);

  if (count === 0) return null;
  const pieces = productsByScene[active.id]?.length ?? 0;

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-black text-white">
      <AnimatePresence mode="popLayout" initial={false}>
        {entered ? (
          <motion.div
            key={`room-${entered.id}`}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <RoomExperience3D
              room={entered}
              products={productsByScene[entered.id] ?? []}
              roomCounts={roomCounts}
              initialProductId={entry.productId}
              initialMode={entry.mode}
            />
            <button
              type="button"
              onClick={leave}
              className="absolute right-4 top-4 z-30 inline-flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20 md:right-6 md:top-6"
            >
              <ArrowLeft size={16} />
              All rooms
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="ring"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.06, filter: "blur(6px)" }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <RoomRing scenes={scenes} target={target} onSettle={turnTo} onPick={pick} onEnter={enter} onReady={handleReady} />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-28">
              <div className="flex flex-col items-center px-4 text-center">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={active.id}
                    initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                    transition={{ duration: 0.35, ease: EASE }}
                  >
                    <h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] md:text-6xl">{active.name}</h1>
                    <p className="mt-2 text-sm text-white/60 md:text-base">
                      {active.style} · {pluralize(pieces, "piece")} to shop
                    </p>
                  </motion.div>
                </AnimatePresence>

                <div className="pointer-events-auto mt-6 flex items-center gap-3">
                  <RingButton label="Previous room" onClick={() => turnTo(target - 1)}>
                    <CaretLeft size={18} />
                  </RingButton>
                  <button
                    type="button"
                    onClick={enter}
                    className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-black transition-transform duration-200 ease-out hover:scale-[1.03] active:scale-[0.98]"
                  >
                    Enter room
                    <ArrowRight size={16} className="transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
                  </button>
                  <RingButton label="Next room" onClick={() => turnTo(target + 1)}>
                    <CaretRight size={18} />
                  </RingButton>
                </div>

                <div className="pointer-events-auto mt-5 flex items-center gap-2" aria-label="Rooms">
                  {scenes.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pick(i)}
                      aria-label={s.name}
                      aria-current={i === index}
                      className="grid h-6 place-items-center px-0.5"
                    >
                      <span
                        className={`block h-1 rounded-full transition-all duration-500 ease-out ${
                          i === index ? "w-6 bg-white" : "w-1.5 bg-white/30 hover:bg-white/60"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className="mt-2 hidden text-xs text-white/40 md:block">Drag the rooms or use the arrow keys</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RingButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-12 place-items-center rounded-full border border-white/15 text-white/80 transition-colors hover:border-white/40 hover:text-white"
    >
      {children}
    </button>
  );
}
