import { LinkIcon, Loader2Icon, PowerIcon, TrashIcon } from "lucide-react";
import type { TFunction } from "i18next";
import type { SkillStoreSource } from "../../../shared/types";

interface SkillStoreCustomSourcesProps {
  customStoreSources: SkillStoreSource[];
  isZh: boolean | undefined;
  loadStoreSource: (sourceId: string, forceRefresh?: boolean) => Promise<void>;
  loadingSourceId: string | null;
  remoteStoreEntries: Record<string, { loadedAt: number; error?: string | null; skills: { slug: string }[] }>;
  removeCustomStoreSource: (id: string) => void;
  selectStoreSource: (id: string) => void;
  selectedCustomSource: SkillStoreSource | null;
  selectedStoreSourceId: string;
  t: TFunction;
  toggleCustomStoreSource: (id: string) => void;
}

export function SkillStoreCustomSources({
  customStoreSources,
  isZh,
  loadStoreSource,
  loadingSourceId,
  remoteStoreEntries,
  removeCustomStoreSource,
  selectStoreSource,
  selectedCustomSource,
  selectedStoreSourceId,
  t,
  toggleCustomStoreSource,
}: SkillStoreCustomSourcesProps) {
  if (!selectedCustomSource && customStoreSources.length === 0) {
    return (
      <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center text-muted-foreground">
        <LinkIcon className="w-10 h-10 mx-auto opacity-30 mb-3" />
        <h4 className="text-base font-semibold text-foreground mb-1">
          {t("skill.noCustomStores", "还没有自定义商店")}
        </h4>
        <p className="text-sm">
          {t("skill.noCustomStoresHint", "点击左侧虚线框“添加商店”开始接入你自己的 skill 来源。")}
        </p>
      </div>
    );
  }

  if (selectedCustomSource) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <LinkIcon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-foreground truncate">
                {selectedCustomSource.name}
              </h4>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  selectedCustomSource.enabled
                    ? "bg-green-500/10 text-green-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {selectedCustomSource.enabled
                  ? t("common.enabled", "已启用")
                  : t("common.disabled", "已停用")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-1">
              {selectedCustomSource.url}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleCustomStoreSource(selectedCustomSource.id)}
            className="px-3 py-2 text-sm rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors"
          >
            {selectedCustomSource.enabled
              ? t("common.disable", "停用")
              : t("common.enable", "启用")}
          </button>
          <button
            onClick={() => void loadStoreSource(selectedCustomSource.id, true)}
            className="px-3 py-2 text-sm rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors inline-flex items-center gap-2"
          >
            <Loader2Icon
              className={`w-4 h-4 ${
                loadingSourceId === selectedCustomSource.id ? "animate-spin" : ""
              }`}
            />
            {t("common.refresh", "刷新")}
          </button>
          <button
            onClick={() => {
              removeCustomStoreSource(selectedCustomSource.id);
              selectStoreSource("official");
            }}
            className="px-3 py-2 text-sm rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
          >
            {t("common.delete", "删除")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {customStoreSources.map((source) => {
        const count = remoteStoreEntries[source.id]?.skills.length || 0;
        const isSelected = selectedStoreSourceId === source.id;
        return (
        <div
          key={source.id}
          onClick={() => selectStoreSource(source.id)}
          className={`bg-card border rounded-2xl p-4 flex items-center gap-4 text-left ${
            isSelected ? "border-primary shadow-sm" : "border-border"
          }`}
        >
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <LinkIcon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-foreground truncate">{source.name}</h4>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    source.enabled
                      ? "bg-green-500/10 text-green-500"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {source.enabled ? t("common.enabled", "已启用") : t("common.disabled", "已停用")}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-muted-foreground">
                  {count} {isZh ? "个技能" : "skills"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-1">{source.url}</p>
            </div>
            <button
              onClick={(event) => {
                event.stopPropagation();
                toggleCustomStoreSource(source.id);
              }}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              title={source.enabled ? t("common.disable", "停用") : t("common.enable", "启用")}
            >
              <PowerIcon className="w-4 h-4" />
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                void loadStoreSource(source.id, true);
              }}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              title={t("common.refresh", "刷新")}
            >
              <Loader2Icon
                className={`w-4 h-4 ${loadingSourceId === source.id ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                removeCustomStoreSource(source.id);
              }}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              title={t("common.delete", "删除")}
            >
              <TrashIcon className="w-4 h-4" />
            </button>
        </div>
      );
    })}
  </div>
  );
}
