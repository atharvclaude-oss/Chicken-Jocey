"use client";

import { useCallback, useEffect, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { Product } from "@shared/types";
import type { RoomScene } from "@/services/scenes";
import { track } from "@/utils/analytics";
import { RoomExperience3D } from "./RoomExperience3D";

export function SceneCarousel({
  scenes,
  productsByScene,
  roomCounts,
}: {
  scenes: RoomScene[];
  productsByScene: Record<string, Product[]>;
  roomCounts: Record<string, number>;
}) {
  const [index, setIndex] = useState(0);
  const count = scenes.length;

  const goTo = useCallback(
    (next: number) => {
      const to = (next + count) % count;
      if (to === index) return;
      track("room_changed", { roomId: scenes[to].id, from: scenes[index].id });
      setIndex(to);
    },
    [count, index, scenes],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const active = scenes[index];

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-stage">
      <RoomExperience3D
        key={active.id}
        room={active}
        products={productsByScene[active.id] ?? []}
        roomCounts={roomCounts}
      />

      <Reel scenes={scenes} index={index} onPick={goTo} />

      {count > 1 && (
        <>
          <ArrowButton side="left" label="Previous room" onClick={() => goTo(index - 1)} />
          <ArrowButton side="right" label="Next room" onClick={() => goTo(index + 1)} />
        </>
      )}
    </div>
  );
}

function Reel({ scenes, index, onPick }: { scenes: RoomScene[]; index: number; onPick: (i: number) => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center gap-2 md:top-6">
      <div className="pointer-events-auto relative h-12 w-full max-w-xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_22%,#000_78%,transparent)]">
        <div
          className="absolute left-1/2 top-0 flex gap-2 transition-transform duration-700 ease-out"
          style={{ transform: `translateX(calc(${-index} * 10rem - 4.75rem))` }}
        >
          {scenes.map((scene, i) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => onPick(i)}
              aria-current={i === index}
              className={`w-[9.5rem] shrink-0 truncate rounded-full px-3 py-2.5 text-sm transition-all duration-500 ${
                i === index ? "scale-100 bg-white text-[#131416]" : "scale-90 bg-black/45 text-white/70 hover:text-white"
              }`}
            >
              {scene.name}
            </button>
          ))}
        </div>
      </div>
      <p className="rounded-full bg-black/40 px-3 py-1 text-xs text-white/70 backdrop-blur-md">
        Switch rooms with the arrows · {index + 1} / {scenes.length}
      </p>
    </div>
  );
}

function ArrowButton({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  const Icon = side === "left" ? CaretLeft : CaretRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/65 ${
        side === "left" ? "left-3 md:left-6" : "right-3 md:right-6"
      }`}
    >
      <Icon size={20} />
    </button>
  );
}
