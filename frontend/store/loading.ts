import { create } from "zustand";

/**
 * Lets a page keep the Room8 intro curtain down until its heavy assets are in
 * (e.g. the home carousel's 3D rooms). Call hold() on mount, release() when ready.
 */
interface LoadingState {
  pending: number;
  hold: () => void;
  release: () => void;
}

export const useLoading = create<LoadingState>((set) => ({
  pending: 0,
  hold: () => set((s) => ({ pending: s.pending + 1 })),
  release: () => set((s) => ({ pending: Math.max(0, s.pending - 1) })),
}));
