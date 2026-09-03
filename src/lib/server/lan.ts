/**
 * Определение LAN IPv4-адреса компьютера (для QR/ссылок подключения телефона).
 */

import os from 'node:os';

/** Первый не-внутренний IPv4-адрес (обычно Wi-Fi/Ethernet); null — если не найден */
export function getLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const info of list ?? []) {
      if (!info.internal && info.family === 'IPv4' && info.address) {
        return info.address;
      }
    }
  }
  return null;
}
