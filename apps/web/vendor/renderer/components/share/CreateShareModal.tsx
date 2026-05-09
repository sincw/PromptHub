import { useEffect, useMemo, useState } from "react";
import type { CreateShareEntryDTO, ShareEntry, ShareSourceSnapshot } from "@prompthub/shared/types";
import { HashIcon, XIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFolderStore } from "../../stores/folder.store";
import { useShareStore } from "../../stores/share.store";
import { Button, Modal, Textarea, UnsavedChangesDialog } from "../ui";

interface ShareFormInitialData {
  title?: string;
  description?: string | null;
  content?: string;
  promptContent?: string | null;
  tags?: string[];
  folderId?: string | null;
  source?: string | null;
  notes?: string | null;
  isSharingEnabled?: boolean;
  sourceSnapshot?: ShareSourceSnapshot | null;
}

interface CreateShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateShareEntryDTO) => Promise<ShareEntry | null> | ShareEntry | null;
  defaultFolderId?: string | null;
  initialData?: ShareFormInitialData;
  title?: string;
}

function formSignature(data: {
  title: string;
  description: string;
  content: string;
  promptContent: string;
  tags: string[];
  folderId: string;
  source: string;
  notes: string;
  isSharingEnabled: boolean;
}): string {
  return JSON.stringify(data);
}

export function CreateShareModal({
  isOpen,
  onClose,
  onSubmit,
  defaultFolderId,
  initialData,
  title,
}: CreateShareModalProps) {
  const { t } = useTranslation();
  const folders = useFolderStore((state) => state.folders);
  const shares = useShareStore((state) => state.shares);
  const [shareTitle, setShareTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [isSharingEnabled, setIsSharingEnabled] = useState(true);
  const [sourceSnapshot, setSourceSnapshot] = useState<ShareSourceSnapshot | null>(null);
  const [showAttributes, setShowAttributes] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [initialSignature, setInitialSignature] = useState("");

  const existingTags = useMemo(() => {
    const tagSet = new Set<string>();
    shares.forEach((share) => share.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [shares]);

  useEffect(() => {
    if (!isOpen) return;
    const nextTitle = initialData?.title ?? "";
    const nextDescription = initialData?.description ?? "";
    const nextContent = initialData?.content ?? "";
    const nextPromptContent = initialData?.promptContent ?? "";
    const nextTags = initialData?.tags ?? [];
    const nextFolderId = initialData?.folderId ?? defaultFolderId ?? "";
    const nextSource = initialData?.source ?? "";
    const nextNotes = initialData?.notes ?? "";
    const nextIsSharingEnabled = initialData?.isSharingEnabled ?? true;

    setShareTitle(nextTitle);
    setDescription(nextDescription);
    setContent(nextContent);
    setPromptContent(nextPromptContent);
    setTags(nextTags);
    setFolderId(nextFolderId);
    setSource(nextSource);
    setNotes(nextNotes);
    setIsSharingEnabled(nextIsSharingEnabled);
    setSourceSnapshot(initialData?.sourceSnapshot ?? null);
    setTagInput("");
    setShowAttributes(false);
    setShowUnsavedDialog(false);
    setInitialSignature(formSignature({
      title: nextTitle,
      description: nextDescription,
      content: nextContent,
      promptContent: nextPromptContent,
      tags: nextTags,
      folderId: nextFolderId,
      source: nextSource,
      notes: nextNotes,
      isSharingEnabled: nextIsSharingEnabled,
    }));
  }, [defaultFolderId, initialData, isOpen]);

  const hasChanges = () =>
    formSignature({
      title: shareTitle,
      description,
      content,
      promptContent,
      tags,
      folderId,
      source,
      notes,
      isSharingEnabled,
    }) !== initialSignature;

  const closeRequest = () => {
    if (hasChanges()) {
      setShowUnsavedDialog(true);
      return;
    }
    onClose();
  };

  const resetAndClose = () => {
    setShareTitle("");
    setDescription("");
    setContent("");
    setPromptContent("");
    setTags([]);
    setFolderId("");
    setSource("");
    setNotes("");
    setSourceSnapshot(null);
    onClose();
  };

  const submit = async () => {
    if (!shareTitle.trim() || !content.trim()) return;
    const result = await onSubmit({
      title: shareTitle.trim(),
      description: description.trim() || undefined,
      content: content.trim(),
      promptContent: promptContent.trim() || null,
      tags,
      folderId: folderId || undefined,
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
      isSharingEnabled,
      sourceSnapshot,
    });
    if (result) {
      resetAndClose();
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={closeRequest}
        title={title ?? t("share.createShare", "新建分享")}
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">
                {t("share.title", "标题")} <span className="text-destructive">*</span>
              </label>
              <input
                value={shareTitle}
                onChange={(event) => setShareTitle(event.target.value)}
                className="w-full h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all"
                placeholder={t("share.titlePlaceholder", "输入分享标题")}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isSharingEnabled}
                onChange={(event) => setIsSharingEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span>{t("share.enableSharing", "开启分享")}</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              {t("share.description", "说明")}
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full resize-y rounded-xl bg-muted/50 border-0 px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all"
              placeholder={t("share.descriptionPlaceholder", "简要说明这段内容")}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAttributes(!showAttributes)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 text-left"
          >
            <span className="text-sm font-medium text-foreground">{t("share.attributes", "属性")}</span>
            {showAttributes ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          </button>

          {showAttributes && (
            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  {t("prompt.folderOptional", "文件夹（可选）")}
                </label>
                <select
                  value={folderId}
                  onChange={(event) => setFolderId(event.target.value)}
                  className="w-full h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">{t("prompt.noFolder", "无文件夹")}</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.icon ? `${folder.icon} ` : ""}
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  {t("prompt.tagsOptional", "标签（可选）")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-white">
                      <HashIcon className="h-3 w-3" />
                      {tag}
                      <button type="button" onClick={() => setTags(tags.filter((item) => item !== tag))}>
                        <XIcon className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                {existingTags.some((tag) => !tags.includes(tag)) && (
                  <div className="flex flex-wrap gap-1.5">
                    {existingTags.filter((tag) => !tags.includes(tag)).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setTags([...tags, tag])}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium hover:bg-accent"
                      >
                        <HashIcon className="h-3 w-3" />
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                    className="h-10 min-w-0 flex-1 rounded-xl bg-muted/50 px-4 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={t("prompt.enterTagHint", "输入标签")}
                  />
                  <Button type="button" variant="secondary" onClick={addTag}>
                    {t("prompt.addTag", "添加")}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">{t("prompt.sourceOptional", "来源（可选）")}</label>
                <input
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  className="w-full h-10 px-4 rounded-xl bg-muted/50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder={t("prompt.sourcePlaceholder", "记录来源")}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">{t("prompt.notesOptional", "备注（可选）")}</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl bg-muted/50 border-0 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder={t("prompt.notesPlaceholder", "个人备注")}
                />
              </div>
            </div>
          )}

          <Textarea
            label={t("share.promptContent", "提示词内容（可选）")}
            value={promptContent}
            onChange={(event) => setPromptContent(event.target.value)}
            className="min-h-[160px]"
            placeholder={t("share.promptContentPlaceholder", "System Prompt 和 User Prompt 可单独存放在这里，不会混入分享正文")}
            enableMarkdownList
          />

          <Textarea
            label={`${t("share.content", "内容")} *`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-[280px]"
            placeholder={t("share.contentPlaceholder", "输入要分享的 Markdown 或原文内容")}
            enableMarkdownList
          />

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={closeRequest}>
              {t("common.cancel", "取消")}
            </Button>
            <Button type="button" onClick={submit} disabled={!shareTitle.trim() || !content.trim()}>
              {t("common.save", "保存")}
            </Button>
          </div>
        </div>
      </Modal>

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onSave={() => {
          setShowUnsavedDialog(false);
          void submit();
        }}
        onDiscard={() => {
          setShowUnsavedDialog(false);
          resetAndClose();
        }}
      />
    </>
  );
}
