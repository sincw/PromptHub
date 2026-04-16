import {
  BrainIcon,
  DatabaseIcon,
  GlobeIcon,
  LaptopIcon,
  UserIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getWebContext } from "../../runtime";
import { SettingSection } from "./shared";

interface WebWorkspaceSettingsProps {
  onNavigate: (section: string) => void;
}

export function WebWorkspaceSettings({
  onNavigate,
}: WebWorkspaceSettingsProps) {
  const { t } = useTranslation();
  const webContext = getWebContext();

  const clientLabel =
    typeof navigator === "undefined"
      ? "Browser"
      : `${/edg\//i.test(navigator.userAgent)
          ? "Microsoft Edge"
          : /chrome\//i.test(navigator.userAgent) &&
              !/edg\//i.test(navigator.userAgent)
            ? "Google Chrome"
            : /safari\//i.test(navigator.userAgent) &&
                !/chrome\//i.test(navigator.userAgent)
              ? "Safari"
              : /firefox\//i.test(navigator.userAgent)
                ? "Firefox"
                : "Browser"} · ${/mac os x/i.test(navigator.userAgent)
          ? "macOS"
          : /windows/i.test(navigator.userAgent)
            ? "Windows"
            : /android/i.test(navigator.userAgent)
              ? "Android"
              : /(iphone|ipad|ios)/i.test(navigator.userAgent)
                ? "iOS"
                : /linux/i.test(navigator.userAgent)
                  ? "Linux"
                  : "Unknown OS"}`;

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.selfHostedWeb")}>
        <div className="divide-y divide-border/70">
          <div className="px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GlobeIcon className="h-4 w-4 text-primary" />
              <span>{t("settings.webOrigin")}</span>
            </div>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {window.location.origin}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("settings.selfHostedWebDesc")}
            </p>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserIcon className="h-4 w-4 text-primary" />
                <span>{t("settings.currentUser")}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">
                {webContext?.username || "PromptHub User"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <LaptopIcon className="h-4 w-4 text-primary" />
                <span>{t("settings.connectedClient")}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">{clientLabel}</p>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-3">
            <button
              onClick={() => onNavigate("devices")}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">
                  {t("settings.deviceManagement")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.deviceManagementDesc")}
                </p>
              </div>
              <GlobeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            <button
              onClick={() => onNavigate("data")}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">{t("settings.data")}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.skillBackupHint")}
                </p>
              </div>
              <DatabaseIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            <button
              onClick={() => onNavigate("ai")}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">{t("settings.ai")}</div>
              </div>
              <BrainIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
