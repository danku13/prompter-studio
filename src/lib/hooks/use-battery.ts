'use client';

/**
 * Уровень заряда батареи устройства (для статус-бара суфлёра и телеметрии).
 * Использует navigator.getBattery (Chrome/Android); подписывается на levelchange.
 * Возвращает 0..100 или null, если API недоступен (iOS и др.).
 */

import { useEffect, useState } from 'react';

interface BatteryManagerLike extends EventTarget {
  level: number;
}

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManagerLike>;
};

export function useBattery(): number | null {
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== 'function') return;

    let battery: BatteryManagerLike | null = null;
    let cancelled = false;

    const update = () => {
      if (battery) setLevel(Math.round(battery.level * 100));
    };

    nav
      .getBattery()
      .then((b) => {
        if (cancelled) return;
        battery = b;
        update();
        b.addEventListener('levelchange', update);
      })
      .catch(() => {
        /* браузер может отказаться — просто не показываем заряд */
      });

    return () => {
      cancelled = true;
      battery?.removeEventListener('levelchange', update);
    };
  }, []);

  return level;
}
