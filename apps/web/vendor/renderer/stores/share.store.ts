import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CreateShareEntryDTO,
  ShareEntry,
  UpdateShareEntryDTO,
} from "@prompthub/shared/types";

export type ShareSortBy = "updatedAt" | "createdAt" | "title";
export type ShareSortOrder = "desc" | "asc";

interface ShareState {
  shares: ShareEntry[];
  selectedId: string | null;
  isLoading: boolean;
  searchQuery: string;
  filterTags: string[];
  sortBy: ShareSortBy;
  sortOrder: ShareSortOrder;

  fetchShares: () => Promise<void>;
  createShare: (data: CreateShareEntryDTO) => Promise<ShareEntry>;
  updateShare: (id: string, data: UpdateShareEntryDTO) => Promise<void>;
  deleteShare: (id: string) => Promise<void>;
  selectShare: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  toggleFilterTag: (tag: string) => void;
  clearFilterTags: () => void;
  setSortBy: (sortBy: ShareSortBy) => void;
  setSortOrder: (sortOrder: ShareSortOrder) => void;
  toggleFavorite: (id: string) => Promise<void>;
  toggleSharing: (id: string) => Promise<void>;
}

export const useShareStore = create<ShareState>()(
  persist(
    (set, get) => ({
      shares: [],
      selectedId: null,
      isLoading: false,
      searchQuery: "",
      filterTags: [],
      sortBy: "updatedAt",
      sortOrder: "desc",

      fetchShares: async () => {
        set({ isLoading: true });
        try {
          const shares = (await window.api?.share?.getAll?.()) ?? [];
          set({ shares });
        } catch (error) {
          console.error("Failed to fetch shares:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      createShare: async (data) => {
        const share = await window.api.share.create({
          ...data,
          tags: data.tags || [],
        });
        set((state) => ({ shares: [share, ...state.shares], selectedId: share.id }));
        return share;
      },

      updateShare: async (id, data) => {
        const updated = await window.api.share.update(id, data);
        set((state) => ({
          shares: state.shares.map((share) => (share.id === id ? updated : share)),
        }));
      },

      deleteShare: async (id) => {
        await window.api.share.delete(id);
        set((state) => ({
          shares: state.shares.filter((share) => share.id !== id),
          selectedId: state.selectedId === id ? null : state.selectedId,
        }));
      },

      selectShare: (id) => set({ selectedId: id }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      toggleFilterTag: (tag) =>
        set((state) => ({
          filterTags: state.filterTags.includes(tag)
            ? state.filterTags.filter((item) => item !== tag)
            : [...state.filterTags, tag],
        })),

      clearFilterTags: () => set({ filterTags: [] }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSortOrder: (sortOrder) => set({ sortOrder }),

      toggleFavorite: async (id) => {
        const share = get().shares.find((item) => item.id === id);
        if (!share) return;
        const updated = await window.api.share.update(id, {
          isFavorite: !share.isFavorite,
        });
        set((state) => ({
          shares: state.shares.map((item) => (item.id === id ? updated : item)),
        }));
      },

      toggleSharing: async (id) => {
        const share = get().shares.find((item) => item.id === id);
        if (!share) return;
        const updated = await window.api.share.update(id, {
          isSharingEnabled: !share.isSharingEnabled,
        });
        set((state) => ({
          shares: state.shares.map((item) => (item.id === id ? updated : item)),
        }));
      },
    }),
    {
      name: "share-store",
      partialize: (state) => ({
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      }),
    },
  ),
);
