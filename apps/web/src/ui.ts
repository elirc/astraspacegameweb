import { create } from 'zustand';
export const useUI = create<{
  selectedId: number | null;
  select: (id: number) => void;
  camera: { x: number; y: number; zoom: number } | null;
  setCamera: (camera: { x: number; y: number; zoom: number }) => void;
}>((set) => ({
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  camera: null,
  setCamera: (camera) => set({ camera }),
}));
