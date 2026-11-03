import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const newCode = () => String(randomInt(0, 1000000)).padStart(6, '0');
export const isDeviceId = (v) => typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const isCode = (v) => typeof v === 'string' && /^[0-9]{6}$/.test(v);
export const isBoard = (v) => ['ESP32', 'ESP32-S3', 'ESP32-C3', 'ESP32-C6'].includes(v);
export const publicDevice = (d) => ({
  id: d.id, name: d.name, board: d.board, status: d.status,
  firmwareVersion: d.firmware_version,
  lastSeen: d.last_seen, createdAt: d.created_at
});
export const equalHash = (secret, expected) => {
  if (!secret || !expected || typeof secret !== 'string') return false;
  const a = Buffer.from(sha256(secret), 'hex'), b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};
export function manifestFor(device, manifest) {
  if (!manifest.version || !manifest.url || !manifest.sha256 || !manifest.board ||
      !isBoard(manifest.board) || !/^https:\/\//.test(manifest.url) ||
      !/^[a-f0-9]{64}$/i.test(manifest.sha256)) return { updateAvailable: false };
  return device.board === manifest.board && device.firmware_version !== manifest.version
    ? { updateAvailable: true, version: manifest.version, url: manifest.url,
        sha256: manifest.sha256, board: manifest.board }
    : { updateAvailable: false };
}
export function allowedOrigin(origin, allowlist) {
  return Boolean(origin && allowlist.split(',').some(s => s.trim() === origin));
}
