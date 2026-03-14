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
  '閿?',
  '闁?',
  '妫?',
  '闁稿繑濞婂Λ?',
  '闂冨懎鐭曠划?',
  '缂傚啯鍨圭划鍫曟閺嶇虎鍤?',
  'API Key 闂€鐐靛У閺?',
  '闁炬儳顦伴弲銉︽媴閸℃鍤掗梻鍕姈缁?',
  '缂傚倸鎼惃?',
  '闁衡偓椤栨瑧甯?',
  '缂佸鍨伴崹搴ㄥ礂閸涱厸鍋?',
  '闁活潿鍔嶉崺?',
  '濞戞挸顑堝ù?',
  '濡澘瀚～?',
  '棣?',
  '皎眳?',
  '閴?',
  '閽跨媴绗?',
  '馃',
  '鉂',
  '鉁',
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
      if (['node_modules', 'dist', '.git', '.npm-cache', 'coverage', '.agent'].includes(entry.name)) {
        continue;
      }
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
  console.error('发现可疑乱码，请检查以下位置:');
  for (const issue of issues) {
    console.error(issue);
  }
  process.exit(1);
}

console.log('编码巡检通过：未发现可疑乱码。');
