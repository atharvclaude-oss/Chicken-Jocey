"use client";

import { create } from "zustand";

// Interaction state for the room viewer. Data (rooms, products) is fetched
// per page and passed down as props; only UI state lives here.

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

interface RoomState {
  selectedRoomId: string | null;
  selectedProductId: string | null;
  hotspotsVisible: boolean;
  cameraState: CameraState | null;
  setSelectedRoom: (id: string | null) => void;
  selectProduct: (id: string | null) => void;
  toggleHotspots: () => void;
  setCameraState: (state: CameraState | null) => void;
}

export const useRoomStore = create<RoomState>()((set) => ({
  selectedRoomId: null,
  selectedProductId: null,
  hotspotsVisible: true,
  cameraState: null,
  setSelectedRoom: (id) => set({ selectedRoomId: id, selectedProductId: null, cameraState: null }),
  selectProduct: (id) => set({ selectedProductId: id }),
  toggleHotspots: () => set((s) => ({ hotspotsVisible: !s.hotspotsVisible })),
  setCameraState: (cameraState) => set({ cameraState }),
}));
