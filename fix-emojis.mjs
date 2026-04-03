import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const R = [
  ['\u00F0\u0178\u017D\u00AE', '\u{1F3AE}'],                    // 🎮
  ['\u00F0\u0178\u201C\u201A', '\u{1F4C2}'],                    // 📂
  ['\u00F0\u0178\u201C\u009D', '\u{1F4DD}'],                    // 📝
  ['\u00F0\u0178\u00A7\u2122', '\u{1F9D9}'],                    // 🧙
  ['\u00F0\u0178\u201C\u0153', '\u{1F4DC}'],                    // 📜
  ['\u00F0\u0178\u201C\u2039', '\u{1F4CB}'],                    // 📋
  ['\u00F0\u0178\u201D\u2014', '\u{1F517}'],                    // 🔗
  ['\u00F0\u0178\u201C\u00B7', '\u{1F4F7}'],                    // 📷
  ['\u00F0\u0178\u201C\u0152', '\u{1F4CC}'],                    // 📌
  ['\u00F0\u0178\u201D\u2019', '\u{1F512}'],                    // 🔒
  ['\u00F0\u0178\u2019\u00BE', '\u{1F4BE}'],                    // 💾
  ['\u00F0\u0178\u2018\u00A4', '\u{1F464}'],                    // 👤
  ['\u00F0\u0178\u00A4\u009D', '\u{1F91D}'],                    // 🤝
  ['\u00F0\u0178\u017D\u00B2', '\u{1F3B2}'],                    // 🎲
  ['\u00F0\u0178\u017D\u00AF', '\u{1F3AF}'],                    // 🎯
  ['\u00F0\u0178\u017D\u00A8', '\u{1F3A8}'],                    // 🎨
  ['\u00F0\u0178\u017D\u00B4', '\u{1F3B4}'],                    // 🎴
  ['\u00F0\u0178\u017D\u00AC', '\u{1F3AC}'],                    // 🎬
  ['\u00F0\u0178\u0152\u2026', '\u{1F305}'],                    // 🌅
  ['\u00F0\u0178\u008F\u2020', '\u{1F3C6}'],                    // 🏆
  ['\u00F0\u0178\u2013\u00A5\u00EF\u00B8\u008F', '\u{1F5A5}\uFE0F'], // 🖥️
  ['\u00F0\u0178\u008F\u00B7\u00EF\u00B8\u008F', '\u{1F3F7}\uFE0F'], // 🏷️
  ['\u00F0\u0178\u203A\u00A1\u00EF\u00B8\u008F', '\u{1F6E1}\uFE0F'], // 🛡️
  ['\u00E2\u00AD\u0090', '\u2B50'],                             // ⭐
  ['\u00E2\u0161\u201D\u00EF\u00B8\u008F', '\u2694\uFE0F'],    // ⚔️
  ['\u00E2\u0161\u2122\u00EF\u00B8\u008F', '\u2699\uFE0F'],    // ⚙️
  ['\u00E2\u008F\u00B1\u00EF\u00B8\u008F', '\u23F1\uFE0F'],    // ⏱️
  ['\u00E2\u008F\u00B3', '\u23F3'],                             // ⏳
  ['\u00E2\u0153\u2026', '\u2705'],                             // ✅
  ['\u00E2\u0153\u201D', '\u2714'],                             // ✔
  ['\u00E2\u0153\u2022', '\u2715'],                             // ✕
  ['\u00E2\u0161\u00A0', '\u26A0'],                             // ⚠
  ['\u00E2\u20AC\u201D', '\u2014'],                             // —
  ['\u00E2\u20AC\u00A2', '\u2022'],                             // •
  ['\u00E2\u2020\u2019', '\u2192'],                             // →
  ['\u00E2\u2013\u00B2', '\u25B2'],                             // ▲
  ['\u00E2\u2013\u00BC', '\u25BC'],                             // ▼
  ['\u00E2\u2013\u00B6', '\u25B6'],                             // ▶
  ['\u00E2\u201D\u201D', '\u2514'],                             // └
  ['\u00E2\u201D\u20AC', '\u2500'],                             // ─
  ['\u00C2\u00B7', '\u00B7'],                                   // · punto medio
  ['\u00C3\u2014', '\u00D7'],                                   // ×
];

function fixFiles(dir) {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { count += fixFiles(full); continue; }
    if (!entry.endsWith('.svelte')) continue;
    let content = readFileSync(full, 'utf8');
    const original = content;
    for (const [from, to] of R) content = content.replaceAll(from, to);
    if (content !== original) {
      writeFileSync(full, content, 'utf8');
      console.log('Fixed:', entry);
      count++;
    }
  }
  return count;
}

console.log(`Done! Fixed ${fixFiles('src')} file(s).`);
