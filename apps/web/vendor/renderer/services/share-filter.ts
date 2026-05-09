import type { ShareEntry } from "@prompthub/shared/types";

export function buildShareStats(shares: ShareEntry[]) {
  const tagSet = new Set<string>();
  let favoriteCount = 0;

  for (const share of shares) {
    if (share.isFavorite) favoriteCount += 1;
    for (const tag of share.tags ?? []) {
      tagSet.add(tag);
    }
  }

  return {
    totalCount: shares.length,
    favoriteCount,
    uniqueTags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
  };
}

export function filterVisibleShares({
  filterTags,
  searchQuery,
  selectedFolderId,
  shares,
}: {
  filterTags: string[];
  searchQuery: string;
  selectedFolderId: string | null;
  shares: ShareEntry[];
}): ShareEntry[] {
  let filtered = shares;

  if (selectedFolderId === "favorites") {
    filtered = filtered.filter((share) => share.isFavorite);
  } else if (selectedFolderId) {
    filtered = filtered.filter((share) => share.folderId === selectedFolderId);
  }

  if (filterTags.length > 0) {
    filtered = filtered.filter((share) =>
      filterTags.every((tag) => share.tags.includes(tag)),
    );
  }

  const query = searchQuery.trim().toLowerCase();
  if (query) {
    filtered = filtered.filter((share) =>
      [
        share.title,
        share.description ?? "",
        share.content,
        share.source ?? "",
        share.notes ?? "",
        ...(share.tags ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }

  return filtered;
}

export function sortVisibleShares(
  shares: ShareEntry[],
  sortBy: "updatedAt" | "createdAt" | "title",
  sortOrder: "asc" | "desc",
): ShareEntry[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  return [...shares].sort((a, b) => {
    if (sortBy === "title") {
      return a.title.localeCompare(b.title) * direction;
    }

    const aTime = new Date(sortBy === "createdAt" ? a.createdAt : a.updatedAt).getTime();
    const bTime = new Date(sortBy === "createdAt" ? b.createdAt : b.updatedAt).getTime();
    return (aTime - bTime) * direction;
  });
}
