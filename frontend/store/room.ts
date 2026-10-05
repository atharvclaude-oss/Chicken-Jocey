"use client";

import { create } from "zustand";

interface RoomState {
  selectedProductId: string | null;
  selectProduct: (id: string | null) => void;
}

export const useRoomStore = create<RoomState>()((set) => ({
  selectedProductId: null,
  selectProduct: (id) => set({ selectedProductId: id }),
}));
