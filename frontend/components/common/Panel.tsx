"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { useIsDesktop } from "@/hooks/useMediaQuery";

/*
  Slide-in panel: right drawer on desktop, bottom sheet on mobile.
  - modal=false: no scrim on desktop, so the room stays interactive behind it
    (click another hotspot and the drawer just swaps content).
  - modal=true: scrim everywhere, page behind is inert.
  z-index scale: navbar 40, panel 45, modal scrim/panel 50.
*/

export function Panel({
  open,
  onClose,
  title,
  children,
  footer,
  modal = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  modal?: boolean;
}) {
  const isDesktop = useIsDesktop();
  const closeRef = useRef<HTMLButtonElement>(null);
  const showScrim = modal || !isDesktop;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Under reduced motion, MotionProvider skips the slide and the panel just appears.
  const hidden = isDesktop ? { x: "100%" } : { y: "100%" };
  const shown = isDesktop ? { x: 0 } : { y: 0 };

  return (
    <AnimatePresence>
      {open && (
        <>
          {showScrim && (
            <motion.div
              key="scrim"
              className="fixed inset-0 z-50 bg-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
          )}
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal={showScrim}
            aria-label={title}
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className={`fixed flex flex-col bg-surface shadow-[0_-12px_48px_rgb(19_20_22/0.18)] ${
              showScrim ? "z-50" : "z-[45]"
            } inset-x-0 bottom-0 max-h-[85dvh] rounded-t-card md:inset-x-auto md:bottom-0 md:right-0 md:max-h-none md:w-[420px] md:rounded-none md:border-l md:border-line ${
              modal ? "md:top-0" : "md:top-16"
            }`}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line md:hidden" />
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3 md:px-6 md:pt-5">
              <p className="text-sm font-medium text-muted">{title}</p>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 grid size-9 place-items-center rounded-full transition-colors hover:bg-sunken"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 md:px-6">{children}</div>
            {footer && (
              <div className="shrink-0 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
                {footer}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
