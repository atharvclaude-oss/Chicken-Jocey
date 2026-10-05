"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowsIn, ArrowsOut, Eye, EyeSlash, ArrowClockwise } from "@phosphor-icons/react";
import type { Product, RoomSummary } from "@shared/types";
import { useRoomStore } from "@/store/room";
import { formatPrice } from "@/utils/format";
import { Hotspot } from "./Hotspot";

/*
  Room viewer
  -----------
  Today this renders "photo view": the room render plus clickable hotspots.
  That stays as the fallback for weak devices once the 3D engine lands.

  3D integration contract (Week 3): 3d-engine exports a canvas component that
  receives the room's assets and calls back with an assetId:

    <RoomCanvas room={room} onProductClick={(assetId) => ...} onProductHover={...} />

  Map assetId -> productId via room.assets and call the same onSelect handler
  below. The drawer, cart and analytics do not need to change.
*/

export function RoomViewer({
  room,
  productsById,
  onSelect,
  onHover,
}: {
  room: RoomSummary;
  productsById: Record<string, Product>;
  onSelect: (productId: string) => void;
  onHover?: (productId: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const hotspotsVisible = useRoomStore((s) => s.hotspotsVisible);
  const toggleHotspots = useRoomStore((s) => s.toggleHotspots);
  const selectedProductId = useRoomStore((s) => s.selectedProductId);

  const ratio = room.imageWidth / room.imageHeight;

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stageRef.current?.requestFullscreen?.();
  };

  return (
    <div
      ref={stageRef}
      className="relative w-full overflow-hidden rounded-card bg-stage max-h-[66dvh] [&:fullscreen]:max-h-none [&:fullscreen]:rounded-none"
      style={{ aspectRatio: String(Math.max(ratio, 0.8)), containerType: "size" }}
    >
      {/* Image box keeps the render's exact aspect ratio so hotspot % coordinates line up. */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: `min(100cqw, calc(100cqh * ${ratio}))`,
          height: `min(100cqh, calc(100cqw / ${ratio}))`,
        }}
      >
        {status !== "error" && (
          <Image
            key={attempt}
            src={room.image}
            alt={`${room.name}: ${room.blurb}`}
            fill
            preload
            sizes="(min-width: 1400px) 1336px, 100vw"
            className={`object-cover transition-opacity duration-700 ${status === "ready" ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
          />
        )}

        {status === "ready" && hotspotsVisible &&
          room.assets.map((asset, i) => {
            const product = productsById[asset.productId];
            if (!product) return null;
            return (
              <button
                key={asset.assetId}
                type="button"
                className="group/spot absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${asset.hotspot.x}%`, top: `${asset.hotspot.y}%` }}
                onClick={() => onSelect(product.id)}
                onMouseEnter={() => onHover?.(product.id)}
                aria-label={`${product.name}, ${formatPrice(product.priceCents)}`}
              >
                <Hotspot
                  label={product.name}
                  price={product.priceCents}
                  active={selectedProductId === product.id}
                  delay={0.1 + i * 0.06}
                />
              </button>
            );
          })}
      </div>

      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="w-48 text-center">
            <p className="text-sm text-white/70">Loading room...</p>
            <div className="loading-bar mt-3 h-[3px] rounded-full" />
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-white">
          <div>
            <p className="font-medium">This room couldn&apos;t load.</p>
            <p className="mt-1 text-sm text-white/60">Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => {
                setStatus("loading");
                setAttempt((a) => a + 1);
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              <ArrowClockwise size={16} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Controls: deliberately few. Rotate/zoom arrive with the 3D canvas. */}
      <div className="absolute bottom-3 left-3 flex gap-1.5 md:bottom-4 md:left-4">
        <ViewerButton
          onClick={toggleHotspots}
          label={hotspotsVisible ? "Hide products" : "Show products"}
          icon={hotspotsVisible ? <EyeSlash size={18} /> : <Eye size={18} />}
        />
        <ViewerButton
          onClick={toggleFullscreen}
          label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          icon={fullscreen ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
        />
      </div>
    </div>
  );
}

function ViewerButton({ onClick, label, icon }: { onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/65"
    >
      {icon}
    </button>
  );
}
