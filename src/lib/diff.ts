/**
 * Пословное сравнение текстов (diff) для вида «до → после» в AI-улучшении.
 *
 * Алгоритм: тексты разбиваются на атомы «слово + хвостовые пробелы»
 * (переносы строк сохраняются), общий префикс/суффикс обрезаются,
 * середина сравнивается LCS (наибольшая общая подпоследовательность).
 * Результат — два потока токенов: «было» (удалённые + общие) и
 * «стало» (добавленные + общие) — для подсветки при рендере.
 *
 * Для очень больших текстов (когда LCS-таблица не влезает в бюджет
 * памяти) честный diff заменяется грубым: вся середина считается
 * заменённой. На секциях сценария (сотни слов) это не случается.
 */

export type DiffOp = 'same' | 'del' | 'add';

export interface DiffToken {
  op: DiffOp;
  /** атом «как есть» — слово с хвостовыми пробелами или пробельный run */
  text: string;
}

export interface DiffResult {
  /** поток для колонки «было»: общие + удалённые токены */
  before: DiffToken[];
  /** поток для колонки «стало»: общие + добавленные токены */
  after: DiffToken[];
  /** сколько слов удалено (пробельные атомы не считаются) */
  removedWords: number;
  /** сколько слов добавлено */
  addedWords: number;
  /** грубый режим (LCS пропущен) — подсветка «всё заменено» */
  fallback: boolean;
}

interface Atom {
  /** ключ сравнения: атом без пробелов (пробельный атом — ключ '') */
  key: string;
  text: string;
}

/** Атомы: «слово + хвостовые пробелы», ведущие/одиночные пробелы — отдельные атомы */
function tokenizeAtoms(text: string): Atom[] {
  const raw = text.match(/\S+\s*|\s+/g) ?? [];
  return raw.map((t) => ({ key: t.trim(), text: t }));
}

/** Лимит ячеек LCS-таблицы (~16 МБ Int32) — выше считаем заменой целиком */
const LCS_CELL_LIMIT = 4_000_000;

export function diffWords(a: string, b: string): DiffResult {
  const aAtoms = tokenizeAtoms(a);
  const bAtoms = tokenizeAtoms(b);

  // общий префикс
  let start = 0;
  while (start < aAtoms.length && start < bAtoms.length && aAtoms[start].key === bAtoms[start].key) {
    start++;
  }
  // общий суффикс
  let endA = aAtoms.length;
  let endB = bAtoms.length;
  while (endA > start && endB > start && aAtoms[endA - 1].key === bAtoms[endB - 1].key) {
    endA--;
    endB--;
  }

  const n = endA - start; // атомы «было» в середине
  const m = endB - start; // атомы «стало» в середине

  const before: DiffToken[] = [];
  const after: DiffToken[] = [];

  for (let i = 0; i < start; i++) {
    // каждый поток сохраняет своё форматирование пробелов
    before.push({ op: 'same', text: aAtoms[i].text });
    after.push({ op: 'same', text: bAtoms[i].text });
  }

  let removedWords = 0;
  let addedWords = 0;
  let fallback = false;

  const pushDel = (atom: Atom) => {
    before.push({ op: 'del', text: atom.text });
    if (atom.key) removedWords++;
  };
  const pushAdd = (atom: Atom) => {
    after.push({ op: 'add', text: atom.text });
    if (atom.key) addedWords++;
  };

  if (n * m > LCS_CELL_LIMIT) {
    // слишком большие середины — грубая замена без LCS
    fallback = true;
    for (let i = start; i < endA; i++) pushDel(aAtoms[i]);
    for (let j = start; j < endB; j++) pushAdd(bAtoms[j]);
  } else {
    // LCS по ключам середины; dp[i * w + j] — LCS длин aAtoms[start+i..] и bAtoms[start+j..]
    const w = m + 1;
    const dp = new Int32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      const ai = start + i;
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] =
          aAtoms[ai].key === bAtoms[start + j].key
            ? dp[(i + 1) * w + (j + 1)] + 1
            : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
      }
    }
    // обход вперёд: собираем ops
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (aAtoms[start + i].key === bAtoms[start + j].key) {
        before.push({ op: 'same', text: aAtoms[start + i].text });
        after.push({ op: 'same', text: bAtoms[start + j].text });
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
        pushDel(aAtoms[start + i]);
        i++;
      } else {
        pushAdd(bAtoms[start + j]);
        j++;
      }
    }
    while (i < n) {
      pushDel(aAtoms[start + i]);
      i++;
    }
    while (j < m) {
      pushAdd(bAtoms[start + j]);
      j++;
    }
  }

  // общий суффикс
  for (let k = endA; k < aAtoms.length; k++) before.push({ op: 'same', text: aAtoms[k].text });
  for (let k = endB; k < bAtoms.length; k++) after.push({ op: 'same', text: bAtoms[k].text });

  return { before, after, removedWords, addedWords, fallback };
}
