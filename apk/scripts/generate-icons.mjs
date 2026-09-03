/**
 * Генерация иконок Android из /public/app-icon.png (1024×1024).
 *
 * Запуск (из песочницы/локально, sharp берётся из корневого node_modules):
 *   node apk/scripts/generate-icons.mjs
 *
 * Что делает:
 *  - ic_launcher.png        — классические иконки 48/72/96/144/192 (mdpi…xxxhdpi);
 *  - ic_launcher_round.png  — те же размеры с круговой альфа-маской;
 *  - ic_launcher_foreground.png — слои adaptive-icon (108/162/216/324/432):
 *    полное изображение; фон иконки тёмный, поэтому цвет adaptive-фона
 *    подгоняем под цвет угла иконки (values/ic_launcher_background.xml) —
 *    маски круга/сквиркла не оставляют швов.
 *
 * В CI скрипт НЕ нужен: сгенерированные PNG коммитятся в репозиторий.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..'); // apk/scripts → apk → репозиторий
const apkDir = path.resolve(here, '..');

// sharp: сначала пробуем apk/node_modules, затем корневой node_modules
let sharp;
for (const base of [apkDir, repoRoot]) {
  try {
    const req = createRequire(path.join(base, 'package.json'));
    sharp = req('sharp');
    break;
  } catch {
    /* пробуем следующий */
  }
}
if (!sharp) throw new Error('sharp не найден ни в apk/node_modules, ни в корне репозитория');

const SOURCE = path.join(repoRoot, 'public', 'app-icon.png');
const RES = path.join(apkDir, 'android/app/src/main/res');

const DENSITIES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

// adaptive-icon: канвас 108dp → px по плотностям
const FOREGROUND = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];

async function sampleCorner(src) {
  const { data, info } = await sharp(src)
    .extract({ left: 0, top: 0, width: 8, height: 8 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0,
    g = 0,
    b = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    r += data[i * info.channels];
    g += data[i * info.channels + 1];
    b += data[i * info.channels + 2];
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** SVG круговая маска размером size×size */
const circleMaskSvg = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

async function main() {
  const corner = await sampleCorner(SOURCE);
  const bg = hex(corner);
  console.log(`цвет угла иконки → фон adaptive-icon: ${bg}`);

  // 1) цвет фона adaptive-icon
  const colorXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bg}</color>\n</resources>\n`;
  fs.writeFileSync(path.join(RES, 'values/ic_launcher_background.xml'), colorXml, 'utf8');
  console.log('✓ values/ic_launcher_background.xml');

  for (const [density, size] of DENSITIES) {
    const dir = path.join(RES, `mipmap-${density}`);
    // классическая иконка
    await sharp(SOURCE).resize(size, size, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher.png'));
    // круглая: маска альфа-каналом
    await sharp(SOURCE)
      .resize(size, size, { fit: 'cover' })
      .composite([{ input: circleMaskSvg(size), blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));
    console.log(`✓ mipmap-${density}: ic_launcher ${size}×${size} (+round)`);
  }

  for (const [density, size] of FOREGROUND) {
    const dir = path.join(RES, `mipmap-${density}`);
    await sharp(SOURCE).resize(size, size, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
    console.log(`✓ mipmap-${density}: ic_launcher_foreground ${size}×${size}`);
  }

  console.log('Готово. Проверить: apk/android/app/src/main/res/mipmap-*/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
