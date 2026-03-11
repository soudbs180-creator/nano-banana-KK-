import fs from 'fs';
import path from 'path';

const roots = [
  'src',
  'api',
  'billing',
  'config',
  'payment-server',
  'scripts',
  'server',
  'supabase',
  'vite.config.ts',
  'vercel.json',
];

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.css']);
const suspiciousTokens = [
  '锟?',
  '閿?',
  '棣?',
  '閸忔娊妫?',
  '闃呭矕绮?',
  '缂冩垹绮堕槍鏍绢嚖',
  'API Key 闀炵姵鏅?',
  '閾惧鏅ユ担鍡楀嚒闂勬劖绁?',
  '缂傚搫鐨?',
  '閺€顖欑帛',
  '缁夘垰鍨庨崗鍛偓',
  '閻劍鍩?',
  '娑撳娴?',
  '妫板嫯顫?',
  '馃',
  '𨱅?',
  '鉂?',
  '钿狅笍',
];

const issues = [];
const selfPath = path.resolve(process.argv[1]);

function shouldScan(filePath) {
  return extensions.has(path.extname(filePath));
}

function walk(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  if (path.resolve(targetPath) === selfPath) return;
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git', '.npm-cache', 'coverage', '.agent'].includes(entry.name)) continue;
      walk(path.join(targetPath, entry.name));
    }
    return;
  }

  if (!shouldScan(targetPath)) return;

  const content = fs.readFileSync(targetPath, 'utf8');
  const lines = content.split(/\r?\n/);
  let inBlockComment = false;

  lines.forEach((line, index) => {
    let current = line;

    if (inBlockComment) {
      const end = current.indexOf('*/');
      if (end === -1) return;
      current = current.slice(end + 2);
      inBlockComment = false;
    }

    while (true) {
      const jsxCommentStart = current.indexOf('{/*');
      const blockStart = current.indexOf('/*');
      const lineCommentStart = current.indexOf('//');

      let nextStart = -1;
      let type = '';

      for (const candidate of [
        { index: jsxCommentStart, type: 'jsx' },
        { index: blockStart, type: 'block' },
        { index: lineCommentStart, type: 'line' },
      ]) {
        if (candidate.index !== -1 && (nextStart === -1 || candidate.index < nextStart)) {
          nextStart = candidate.index;
          type = candidate.type;
        }
      }

      if (nextStart === -1) break;

      if (type === 'line') {
        current = current.slice(0, nextStart);
        break;
      }

      const endToken = type === 'jsx' ? '*/}' : '*/';
      const end = current.indexOf(endToken, nextStart + 2);
      if (end === -1) {
        current = current.slice(0, nextStart);
        inBlockComment = true;
        break;
      }

      current = current.slice(0, nextStart) + current.slice(end + endToken.length);
    }

    const trimmed = current.trim();
    if (!trimmed) return;

    if (suspiciousTokens.some((token) => trimmed.includes(token))) {
      issues.push(`${targetPath}:${index + 1}: ${trimmed}`);
    }
  });
}

for (const target of roots) {
  walk(path.resolve(target));
}

if (issues.length > 0) {
  console.error('发现可疑乱码，请检查以下位置：');
  for (const issue of issues) {
    console.error(issue);
  }
  process.exit(1);
}

console.log('编码巡检通过：未发现可疑乱码。');
