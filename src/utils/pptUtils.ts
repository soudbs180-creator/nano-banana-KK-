export const buildAutoPptSlides = (topicRaw: string, totalRaw: number) => {
  const topic = String(topicRaw || '').trim() || '主题演示';
  const total = Math.min(20, Math.max(1, Number(totalRaw) || 1));

  const basePool = [
    `背景与问题定义：${topic}`,
    `行业趋势与机会：${topic}`,
    `目标用户与核心场景：${topic}`,
    `解决方案概览：${topic}`,
    `核心能力与差异化：${topic}`,
    `关键数据与证据：${topic}`,
    `典型案例与应用示例：${topic}`,
    `落地路径与实施步骤：${topic}`,
    `风险评估与应对策略：${topic}`,
    `里程碑与路线图：${topic}`,
    `资源需求与协同机制：${topic}`,
    `预期收益与评估指标：${topic}`
  ];

  const pages: string[] = [];
  pages.push(`封面：${topic}`);

  if (total >= 3) {
    pages.push(`目录：${topic} 的核心章节`);
  }

  const remainForMiddle = Math.max(0, total - 1 - pages.length);
  for (let i = 0; i < remainForMiddle; i++) {
    pages.push(basePool[i % basePool.length]);
  }

  if (pages.length < total) {
    pages.push(`总结与行动建议：${topic}`);
  }

  return pages.slice(0, total);
};

export const parsePptOutlineLine = (raw?: string) => {
  const text = String(raw || '').trim();
  if (!text) return { title: '', subtitle: '' };

  const splitBy = (token: string) => {
    const idx = text.indexOf(token);
    if (idx <= 0) return null;
    const title = text.slice(0, idx).trim();
    const subtitle = text.slice(idx + token.length).trim();
    return { title, subtitle };
  };

  const byColon = splitBy('：') || splitBy(':');
  if (byColon) return byColon;

  const byDash = splitBy(' - ') || splitBy(' — ') || splitBy(' – ');
  if (byDash) return byDash;

  return { title: text, subtitle: '' };
};

export const buildPptPageAlias = (raw: string | undefined, pageIndex: number) => {
  const parsed = parsePptOutlineLine(raw);
  const title = parsed.title || parsed.subtitle || String(raw || '').trim();
  return title || `第 ${pageIndex + 1} 页`;
};

export const normalizePptSlidesForCount = (
  rawSlides: string[] | undefined,
  topicRaw: string,
  totalRaw: number
) => {
  const total = Math.min(20, Math.max(1, Number(totalRaw) || 1));
  const manualSlides = (rawSlides || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .slice(0, total);

  if (manualSlides.length >= total) {
    return manualSlides.slice(0, total);
  }

  const autoSlides = buildAutoPptSlides(topicRaw, total);
  return Array.from({ length: total }, (_, index) => (
    manualSlides[index] || autoSlides[index] || `第 ${index + 1} 页：${String(topicRaw || '').trim() || '主题演示'}`
  ));
};
