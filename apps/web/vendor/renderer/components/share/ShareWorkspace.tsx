import { useMemo, useState } from "react";
import type { ShareEntry, ShareSourceSnapshot } from "@prompthub/shared/types";
import {
  CheckIcon,
  CopyIcon,
  EditIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HashIcon,
  LinkIcon,
  PowerIcon,
  StarIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useTranslation } from "react-i18next";
import { useFolderStore } from "../../stores/folder.store";
import { useShareStore } from "../../stores/share.store";
import {
  filterVisibleShares,
  sortVisibleShares,
} from "../../services/share-filter";
import { useToast } from "../ui/Toast";
import { Button } from "../ui";
import { CreateShareModal } from "./CreateShareModal";

function getShareUrl(shareId: string): string {
  return `${window.location.origin}/share/${encodeURIComponent(shareId)}`;
}

function buildPromptContentFromSnapshot(snapshot?: ShareSourceSnapshot | null): string {
  if (!snapshot?.systemPrompt && !snapshot?.userPrompt) return "";
  return [
    snapshot.systemPrompt ? `## System Prompt\n\n${snapshot.systemPrompt}` : "",
    snapshot.userPrompt ? `## User Prompt\n\n${snapshot.userPrompt}` : "",
  ].filter(Boolean).join("\n\n");
}

function PromptContentBlock({
  promptContent,
  snapshot,
}: {
  promptContent?: string | null;
  snapshot?: ShareSourceSnapshot | null;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const content = promptContent?.trim() || buildPromptContentFromSnapshot(snapshot);
  if (!content) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
        aria-expanded={expanded}
      >
        <span>{t("share.promptContent", "提示词内容")}</span>
        {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="markdown-content max-h-80 overflow-y-auto border-t border-border bg-muted/20 p-4 text-sm leading-relaxed break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
      <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        {t("share.sourcePromptCollapsedHint", "System Prompt 和 User Prompt 默认收缩，需要时展开。")}
      </div>
    </div>
  );
}

function MarkdownContent({ content, raw }: { content: string; raw: boolean }) {
  if (raw) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </div>
    );
  }

  return (
    <div className="markdown-content rounded-xl border border-border bg-card p-4 text-[15px] leading-relaxed break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ShareListItem({
  isSelected,
  onSelect,
  share,
}: {
  isSelected: boolean;
  onSelect: () => void;
  share: ShareEntry;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
        isSelected ? "bg-primary text-white" : "bg-card hover:bg-accent"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileTextIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-white/80" : "text-primary"}`} />
          <h3 className="truncate text-sm font-medium">{share.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {share.isSharingEnabled && <LinkIcon className={`h-3.5 w-3.5 ${isSelected ? "text-white/80" : "text-primary"}`} />}
          {share.isFavorite && <StarIcon className={`h-3.5 w-3.5 ${isSelected ? "fill-white text-white" : "fill-yellow-400 text-yellow-400"}`} />}
        </div>
      </div>
      {share.description && (
        <p className={`mt-0.5 truncate text-xs ${isSelected ? "text-white/70" : "text-muted-foreground"}`}>
          {share.description}
        </p>
      )}
    </button>
  );
}

export function ShareWorkspace() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const shares = useShareStore((state) => state.shares);
  const selectedId = useShareStore((state) => state.selectedId);
  const selectShare = useShareStore((state) => state.selectShare);
  const searchQuery = useShareStore((state) => state.searchQuery);
  const filterTags = useShareStore((state) => state.filterTags);
  const sortBy = useShareStore((state) => state.sortBy);
  const sortOrder = useShareStore((state) => state.sortOrder);
  const updateShare = useShareStore((state) => state.updateShare);
  const deleteShare = useShareStore((state) => state.deleteShare);
  const toggleFavorite = useShareStore((state) => state.toggleFavorite);
  const toggleSharing = useShareStore((state) => state.toggleSharing);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const [editingShare, setEditingShare] = useState<ShareEntry | null>(null);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);

  const visibleShares = useMemo(() => {
    const filtered = filterVisibleShares({
      filterTags,
      searchQuery,
      selectedFolderId,
      shares,
    });
    return sortVisibleShares(filtered, sortBy, sortOrder);
  }, [filterTags, searchQuery, selectedFolderId, shares, sortBy, sortOrder]);

  const selectedShare = selectedId
    ? shares.find((share) => share.id === selectedId) ?? null
    : null;

  const copyLink = async (share: ShareEntry) => {
    await navigator.clipboard.writeText(getShareUrl(share.shareId));
    setCopiedShareId(share.id);
    showToast(t("share.linkCopied", "分享链接已复制"), "success");
    window.setTimeout(() => setCopiedShareId(null), 1600);
  };

  return (
    <div className="absolute inset-0 flex overflow-hidden bg-background">
      <div className="w-80 shrink-0 border-r border-border bg-card/50 flex flex-col">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t("share.titlePlural", "内容分享")}</h2>
              <p className="text-xs text-muted-foreground">{visibleShares.length} / {shares.length}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {visibleShares.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <FileTextIcon className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">{t("share.noShares", "暂无分享内容")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("share.addFirst", "点击新建创建第一条分享")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleShares.map((share) => (
                <ShareListItem
                  key={share.id}
                  share={share}
                  isSelected={share.id === selectedId}
                  onSelect={() => selectShare(share.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedShare ? (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-5xl px-6 py-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-foreground">{selectedShare.title}</h1>
                    {selectedShare.description && (
                      <p className="mt-1 max-h-24 overflow-y-auto text-sm text-muted-foreground">
                        {selectedShare.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(selectedShare.id)}
                      className={`rounded-xl p-2.5 transition-colors ${
                        selectedShare.isFavorite
                          ? "bg-yellow-500/10 text-yellow-500"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                      title={t("nav.favorites")}
                    >
                      <StarIcon className={`h-5 w-5 ${selectedShare.isFavorite ? "fill-current" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => copyLink(selectedShare)}
                      className={`rounded-xl p-2.5 transition-colors ${
                        copiedShareId === selectedShare.id
                          ? "bg-green-500/10 text-green-500"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                      title={t("share.copyLink", "复制分享链接")}
                    >
                      {copiedShareId === selectedShare.id ? <CheckIcon className="h-5 w-5" /> : <CopyIcon className="h-5 w-5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingShare(selectedShare)}
                      className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title={t("common.edit", "编辑")}
                    >
                      <EditIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium ${
                    selectedShare.isSharingEnabled
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <LinkIcon className="h-3 w-3" />
                    {selectedShare.isSharingEnabled ? t("share.enabled", "已开启分享") : t("share.disabled", "分享已关闭")}
                  </span>
                  {selectedShare.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-accent-foreground">
                      <HashIcon className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
                  {selectedShare.source && (
                    <a
                      href={selectedShare.source.startsWith("http") ? selectedShare.source : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-3 py-1 hover:text-foreground"
                    >
                      <ExternalLinkIcon className="h-3 w-3" />
                      <span className="max-w-[18rem] truncate">{selectedShare.source}</span>
                    </a>
                  )}
                </div>

                {selectedShare.notes && (
                  <div className="mb-4 rounded-xl border border-yellow-500/10 bg-yellow-500/5 p-3 text-sm italic text-foreground/80">
                    {selectedShare.notes}
                  </div>
                )}

                <PromptContentBlock
                  promptContent={selectedShare.promptContent}
                  snapshot={selectedShare.sourceSnapshot}
                />

                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setRawMode(!rawMode)}
                    className="rounded-lg border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {rawMode ? t("prompt.viewMarkdown", "Markdown 渲染") : t("prompt.viewRaw", "显示原文")}
                  </button>
                </div>
                <MarkdownContent content={selectedShare.content} raw={rawMode} />
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-card/80 px-6 py-3 backdrop-blur-sm">
              <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
                <Button type="button" onClick={() => toggleSharing(selectedShare.id)}>
                  <PowerIcon className="h-4 w-4" />
                  {selectedShare.isSharingEnabled ? t("share.disableSharing", "关闭分享") : t("share.enableSharing", "开启分享")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => copyLink(selectedShare)}>
                  <CopyIcon className="h-4 w-4" />
                  {t("share.copyLink", "复制分享链接")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={async () => {
                    if (window.confirm(t("share.confirmDelete", "确定删除这条分享内容？"))) {
                      await deleteShare(selectedShare.id);
                    }
                  }}
                >
                  <TrashIcon className="h-4 w-4" />
                  {t("common.delete", "删除")}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/50">
              <FileTextIcon className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-lg font-medium">{t("share.selectShare", "选择分享内容")}</p>
            <p className="mt-1 text-sm">{t("share.selectShareDesc", "从左侧列表选择一条分享内容查看详情")}</p>
          </div>
        )}
      </div>

      {editingShare && (
        <CreateShareModal
          isOpen={!!editingShare}
          onClose={() => setEditingShare(null)}
          title={t("share.editShare", "编辑分享")}
          initialData={editingShare}
          onSubmit={async (data) => {
            await updateShare(editingShare.id, data);
            setEditingShare(null);
            return { ...editingShare, ...data } as ShareEntry;
          }}
        />
      )}
    </div>
  );
}
