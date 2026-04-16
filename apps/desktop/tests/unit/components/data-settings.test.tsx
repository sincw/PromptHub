import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataSettings } from "../../../src/renderer/components/settings/DataSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { restoreFromFile } from "../../../src/renderer/services/database-backup";
import { testSelfHostedConnection } from "../../../src/renderer/services/self-hosted-sync";

const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: () => useSettingsStoreMock(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/services/database-backup", () => ({
  downloadBackup: vi.fn(),
  downloadCompressedBackup: vi.fn(),
  downloadSelectiveExport: vi.fn(),
  restoreFromFile: vi.fn(),
}));

vi.mock("../../../src/renderer/services/database", () => ({
  clearDatabase: vi.fn(),
}));

vi.mock("../../../src/renderer/services/webdav", () => ({
  testConnection: vi.fn(),
  uploadToWebDAV: vi.fn(),
  downloadFromWebDAV: vi.fn(),
}));

vi.mock("../../../src/renderer/services/self-hosted-sync", () => ({
  testSelfHostedConnection: vi.fn(),
  pushToSelfHostedWeb: vi.fn(),
  pullFromSelfHostedWeb: vi.fn(),
}));

function createSettingsState() {
  return {
    dataPath: "/stale/path",
    setDataPath: vi.fn(),
    webdavEnabled: false,
    setWebdavEnabled: vi.fn(),
    webdavUrl: "",
    setWebdavUrl: vi.fn(),
    webdavUsername: "",
    setWebdavUsername: vi.fn(),
    webdavPassword: "",
    setWebdavPassword: vi.fn(),
    webdavAutoSync: false,
    setWebdavAutoSync: vi.fn(),
    webdavSyncOnStartup: true,
    setWebdavSyncOnStartup: vi.fn(),
    webdavSyncOnSave: false,
    setWebdavSyncOnSave: vi.fn(),
    webdavIncrementalSync: true,
    setWebdavIncrementalSync: vi.fn(),
    webdavAutoSyncInterval: 0,
    setWebdavAutoSyncInterval: vi.fn(),
    webdavIncludeImages: true,
    setWebdavIncludeImages: vi.fn(),
    webdavEncryptionEnabled: false,
    setWebdavEncryptionEnabled: vi.fn(),
    webdavEncryptionPassword: "",
    setWebdavEncryptionPassword: vi.fn(),
    selfHostedSyncEnabled: false,
    selfHostedSyncUrl: "",
    selfHostedSyncUsername: "",
    selfHostedSyncPassword: "",
    selfHostedSyncOnStartup: false,
    selfHostedSyncOnStartupDelay: 10,
    selfHostedAutoSyncInterval: 0,
    setSelfHostedSyncEnabled: vi.fn(),
    setSelfHostedSyncUrl: vi.fn(),
    setSelfHostedSyncUsername: vi.fn(),
    setSelfHostedSyncPassword: vi.fn(),
    setSelfHostedSyncOnStartup: vi.fn(),
    setSelfHostedSyncOnStartupDelay: vi.fn(),
    setSelfHostedAutoSyncInterval: vi.fn(),
  };
}

describe("DataSettings", () => {
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    originalCreateElement = document.createElement.bind(document);

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: "/next/data",
          currentPath: "/actual/data",
          needsRestart: true,
        }),
      },
    });

    useSettingsStoreMock.mockReturnValue(createSettingsState());
    useToastMock.mockReturnValue({ showToast: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__;
  });

  it("shows the real current data path and the pending path after restart", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings />, { language: "en" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("/actual/data")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Will switch to this directory after restart:"),
    ).toBeInTheDocument();
    expect(screen.getByText("/next/data")).toBeInTheDocument();
  });

  it("restores a backup file through the restore action and shows success", async () => {
    vi.useFakeTimers();
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    vi.mocked(restoreFromFile).mockResolvedValue(undefined);

    const input = {
      accept: "",
      click: vi.fn(),
      onchange: null as null | ((event: Event) => void | Promise<void>),
      type: "",
    };

    await act(async () => {
      await renderWithI18n(<DataSettings />, { language: "en" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "input") {
        return input as unknown as HTMLInputElement;
      }
      return originalCreateElement(tagName);
    });

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".json,.phub,.gz");

    const file = { name: "prompthub-export.phub.gz" } as File;

    await act(async () => {
      await input.onchange?.({
        target: { files: [file] },
      } as unknown as Event);
    });

    expect(restoreFromFile).toHaveBeenCalledWith(file);
    expect(showToast).toHaveBeenCalledWith("Data imported successfully", "success");
  });

  it("shows the actual restore error message when import fails", async () => {
    const showToast = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    useToastMock.mockReturnValue({ showToast });
    vi.mocked(restoreFromFile).mockRejectedValue(
      new Error("Selective export file is corrupted"),
    );

    const input = {
      accept: "",
      click: vi.fn(),
      onchange: null as null | ((event: Event) => void | Promise<void>),
      type: "",
    };

    await act(async () => {
      await renderWithI18n(<DataSettings />, { language: "en" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "input") {
        return input as unknown as HTMLInputElement;
      }
      return originalCreateElement(tagName);
    });

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await act(async () => {
      await input.onchange?.({
        target: { files: [{ name: "broken.phub.gz" }] },
      } as unknown as Event);
    });

    expect(showToast).toHaveBeenCalledWith(
      "Import failed: Selective export file is corrupted",
      "error",
    );
  });

  it("tests a self-hosted PromptHub connection from desktop settings", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    useSettingsStoreMock.mockReturnValue({
      ...createSettingsState(),
      selfHostedSyncEnabled: true,
      selfHostedSyncUrl: "https://backup.example.com",
      selfHostedSyncUsername: "owner",
      selfHostedSyncPassword: "secret",
    });
    vi.mocked(testSelfHostedConnection).mockResolvedValue({
      prompts: 3,
      folders: 2,
      skills: 1,
    });

    await act(async () => {
      await renderWithI18n(<DataSettings />, { language: "en" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(testSelfHostedConnection).toHaveBeenCalledWith({
        url: "https://backup.example.com",
        username: "owner",
        password: "secret",
      });
    });
    expect(showToast).toHaveBeenCalledWith(
      "Connection successful. Remote workspace currently stores 3 prompts, 2 folders, and 1 skills.",
      "success",
    );
  });

  it("keeps web data settings focused on backup flows", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ = true;

    await act(async () => {
      await renderWithI18n(<DataSettings />, { language: "en" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("Data Path")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear Data" })).toBeNull();
    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
    expect(screen.queryByText("Will switch to this directory after restart:")).toBeNull();
    expect(screen.queryByRole("button", { name: "Test Connection" })).toBeNull();
  });
});
