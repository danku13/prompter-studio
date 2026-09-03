import { headers } from 'next/headers';
import DesktopApp from '@/components/desktop/desktop-app';
import MobileApp from '@/components/mobile/mobile-app';

/**
 * Prompter Studio — единая точка входа.
 *
 * Один маршрут / обслуживает две роли:
 *  - MOBILE  — телесуфлёр + камера + запись (телефон: браузер по LAN или APK)
 *  - DESKTOP — редактор сценария + pairing + мониторинг (компьютер)
 *
 * Роль определяется на СЕРВЕРЕ по User-Agent + query-параметрам (?pair=, ?ui=):
 * нет мигания при гидратации и лишнего клиентского JS.
 * Ручное переключение: /?ui=mobile | /?ui=desktop.
 */

type Role = 'mobile' | 'desktop';

const MOBILE_UA = /(android|iphone|ipad|ipod|windows phone|mobile)/i;

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, hdrs] = await Promise.all([searchParams, headers()]);

  const ui = firstParam(sp.ui);
  const pair = firstParam(sp.pair);
  const ua = hdrs.get('user-agent') ?? '';

  let role: Role;
  if (ui === 'mobile') role = 'mobile';
  else if (ui === 'desktop') role = 'desktop';
  else if (pair !== undefined) role = 'mobile';
  else if (MOBILE_UA.test(ua)) role = 'mobile';
  else role = 'desktop';

  return role === 'mobile' ? <MobileApp /> : <DesktopApp />;
}
