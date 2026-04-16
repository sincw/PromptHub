import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export type RegisteredDeviceType = 'desktop' | 'browser';

export interface RegisteredDevice {
  id: string;
  type: RegisteredDeviceType;
  name: string;
  platform: string;
  appVersion?: string;
  clientVersion?: string;
  userAgent?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface DeviceHeartbeatInput {
  id: string;
  type: RegisteredDeviceType;
  name: string;
  platform: string;
  appVersion?: string;
  clientVersion?: string;
  userAgent?: string;
}

function getDevicesWorkspaceDir(): string {
  return path.join(config.dataDir, 'workspace', 'settings', 'devices');
}

function getDevicesFilePath(userId: string): string {
  return path.join(getDevicesWorkspaceDir(), `${userId}.json`);
}

function ensureDevicesWorkspaceDir(): void {
  fs.mkdirSync(getDevicesWorkspaceDir(), { recursive: true });
}

function readDevicesFile(userId: string): RegisteredDevice[] {
  try {
    const filePath = getDevicesFilePath(userId);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as RegisteredDevice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDevicesFile(userId: string, devices: RegisteredDevice[]): void {
  ensureDevicesWorkspaceDir();
  fs.writeFileSync(
    getDevicesFilePath(userId),
    JSON.stringify(devices, null, 2),
    'utf8',
  );
}

function normalizeString(value: string | undefined, fallback = ''): string {
  return value?.trim() || fallback;
}

function sortDevices(devices: RegisteredDevice[]): RegisteredDevice[] {
  return devices.sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

export class DeviceService {
  list(userId: string): RegisteredDevice[] {
    return sortDevices(readDevicesFile(userId)).slice(0, 50);
  }

  heartbeat(userId: string, input: DeviceHeartbeatInput): RegisteredDevice {
    const now = new Date().toISOString();
    const devices = readDevicesFile(userId);
    const existing = devices.find((device) => device.id === input.id);

    const nextDevice: RegisteredDevice = {
      id: normalizeString(input.id),
      type: input.type,
      name: normalizeString(
        input.name,
        input.type === 'desktop' ? 'PromptHub Desktop' : 'PromptHub Web',
      ),
      platform: normalizeString(input.platform, 'Unknown'),
      appVersion: normalizeString(input.appVersion) || undefined,
      clientVersion: normalizeString(input.clientVersion) || undefined,
      userAgent: normalizeString(input.userAgent) || undefined,
      firstSeenAt: existing?.firstSeenAt || now,
      lastSeenAt: now,
    };

    const remaining = devices.filter((device) => device.id !== input.id);
    const nextDevices = sortDevices([nextDevice, ...remaining]).slice(0, 50);
    writeDevicesFile(userId, nextDevices);
    return nextDevice;
  }
}
