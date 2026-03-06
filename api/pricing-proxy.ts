/**
 * Pricing scan proxy
 * 优先抓取 /api/pricing，也会尝试解析 /pricing、/pricing.html、/models 页面中的嵌入 JSON 和表格数据。
 */

export const config = { runtime: 'edge' };

type PricingRow = Record<string, any>;
type ParsedPayload = { data: PricingRow[]; groupRatio: Record<string, number> };
type DiscoveryTarget = { key: string; url: string; accept: string };

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeRatioMap = (value: unknown): Record<string, number> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const normalized = Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, raw]) => {
    const parsed = toNumber(raw);
    if (parsed !== undefined) {
      acc[String(key)] = parsed;
    }
    return acc;
  }, {});

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const decodeHtmlEntities = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const stripTags = (text: string) =>
  decodeHtmlEntities(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const looksLikeHtml = (text: string) => {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<body');
};

const isPricingLikeObject = (value: unknown): value is PricingRow => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const row = value as PricingRow;
  const model = row.model ?? row.model_name ?? row.modelName ?? row.name ?? row.model_id;
  if (typeof model !== 'string' || !model.trim()) return false;

  return [
    row.model_ratio,
    row.modelRatio,
    row.model_price,
    row.modelPrice,
    row.completion_ratio,
    row.completionRatio,
    row.size_ratio,
    row.sizeRatio,
    row.group_model_ratio,
    row.groupModelRatio,
    row.quota_type,
    row.quotaType,
  ].some((field) => field !== undefined && field !== null);
};

const normalizePricingRow = (value: PricingRow): PricingRow | null => {
  const modelName = String(value.model_name ?? value.modelName ?? value.model ?? value.model_id ?? value.name ?? '').trim();
  if (!modelName) return null;

  return {
    ...value,
    model: String(value.model ?? value.model_id ?? modelName).trim(),
    model_name: modelName,
    model_ratio: toNumber(value.model_ratio ?? value.modelRatio ?? value.price_ratio ?? value.priceRatio),
    model_price: toNumber(value.model_price ?? value.modelPrice ?? value.price ?? value.per_request_price),
    completion_ratio: toNumber(value.completion_ratio ?? value.completionRatio ?? value.output_ratio ?? value.outputRatio),
    size_ratio: normalizeRatioMap(value.size_ratio ?? value.sizeRatio ?? value.size_ratios ?? value.sizeRatios),
    group_model_ratio: normalizeRatioMap(
      value.group_model_ratio ?? value.groupModelRatio ?? value.group_model_ratios ?? value.groupModelRatios
    ),
    group_size_ratio: value.group_size_ratio ?? value.groupSizeRatio,
    group_model_price: value.group_model_price ?? value.groupModelPrice,
    quota_type: value.quota_type ?? value.quotaType,
  };
};

const collectPricingRows = (value: unknown, results: PricingRow[] = [], seen = new WeakSet<object>()) => {
  if (!value || typeof value !== 'object') return results;

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (isPricingLikeObject(item)) {
        const normalized = normalizePricingRow(item);
        if (normalized) results.push(normalized);
        return;
      }
      collectPricingRows(item, results, seen);
    });
    return results;
  }

  if (seen.has(value as object)) return results;
  seen.add(value as object);

  if (isPricingLikeObject(value)) {
    const normalized = normalizePricingRow(value);
    if (normalized) results.push(normalized);
  }

  Object.values(value as Record<string, unknown>).forEach((child) => collectPricingRows(child, results, seen));
  return results;
};

const collectGroupRatios = (value: unknown, results: Record<string, number>[] = [], seen = new WeakSet<object>()) => {
  if (!value || typeof value !== 'object') return results;

  if (Array.isArray(value)) {
    value.forEach((item) => collectGroupRatios(item, results, seen));
    return results;
  }

  if (seen.has(value as object)) return results;
  seen.add(value as object);

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/group[_-]?ratio/i.test(key)) {
      const ratioMap = normalizeRatioMap(child);
      if (ratioMap) results.push(ratioMap);
    }
    collectGroupRatios(child, results, seen);
  }

  return results;
};

const mergeRows = (...groups: PricingRow[][]): PricingRow[] => {
  const merged = new Map<string, PricingRow>();

  groups.flat().forEach((row) => {
    const modelName = String(row.model_name || row.model || '').trim();
    if (!modelName) return;

    const existing = merged.get(modelName) || {};
    const sizeRatio = normalizeRatioMap(row.size_ratio) || normalizeRatioMap(existing.size_ratio);
    const groupModelRatio = normalizeRatioMap(row.group_model_ratio) || normalizeRatioMap(existing.group_model_ratio);

    merged.set(modelName, {
      ...existing,
      ...row,
      model: row.model || existing.model || modelName,
      model_name: modelName,
      model_ratio: row.model_ratio ?? existing.model_ratio,
      model_price: row.model_price ?? existing.model_price,
      completion_ratio: row.completion_ratio ?? existing.completion_ratio,
      quota_type: row.quota_type ?? existing.quota_type,
      size_ratio: sizeRatio,
      group_model_ratio: groupModelRatio,
      group_size_ratio: row.group_size_ratio ?? existing.group_size_ratio,
      group_model_price: row.group_model_price ?? existing.group_model_price,
    });
  });

  return Array.from(merged.values());
};

const mergeGroupRatios = (...groups: Array<Record<string, number> | undefined>): Record<string, number> =>
  groups.reduce<Record<string, number>>((acc, group) => {
    if (!group) return acc;
    return { ...acc, ...group };
  }, {});

const tryParseJson = (text: string): unknown | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const tryParseLooseJson = (text: string): unknown | null => {
  const trimmed = text.trim().replace(/;$/, '');
  if (!trimmed) return null;

  const direct = tryParseJson(trimmed);
  if (direct) return direct;

  const normalized = trimmed
    .replace(/([{,]\s*)([A-Za-z0-9_$-]+)\s*:/g, '$1"$2":')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => `: "${value.replace(/"/g, '\\"')}"`)
    .replace(/,\s*([}\]])/g, '$1');

  return tryParseJson(normalized);
};

const parseRatioMapFromText = (text: string) => {
  const normalized = stripTags(text);
  if (!normalized) return undefined;

  const matches = Array.from(
    normalized.matchAll(/([A-Za-z0-9_.:/\-\u4e00-\u9fa5]+)\s*[:：]\s*(?:×|x|X|\*)?\s*(\d+(?:\.\d+)?)/g)
  );

  if (!matches.length) return undefined;

  const result = matches.reduce<Record<string, number>>((acc, match) => {
    const key = String(match[1] || '').trim();
    const value = toNumber(match[2]);
    if (key && value !== undefined) acc[key] = value;
    return acc;
  }, {});

  return Object.keys(result).length ? result : undefined;
};

const extractTableRows = (html: string): PricingRow[] => {
  const tables = Array.from(html.matchAll(/<table[\s\S]*?<\/table>/gi)).map((match) => match[0]);
  const rows: PricingRow[] = [];

  const findHeaderIndex = (headers: string[], patterns: RegExp[]) =>
    headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));

  for (const table of tables) {
    const rowMatches = Array.from(table.matchAll(/<tr[\s\S]*?<\/tr>/gi)).map((match) => match[0]);
    if (rowMatches.length < 2) continue;

    const headerCells = Array.from(rowMatches[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)).map((match) =>
      stripTags(match[1] || '').toLowerCase()
    );
    if (!headerCells.length) continue;

    const modelIndex = findHeaderIndex(headerCells, [/模型|model|名称|name/i]);
    if (modelIndex < 0) continue;

    const basePriceIndex = findHeaderIndex(headerCells, [/基础价|单次|price|价格|per.?request/i]);
    const modelRatioIndex = findHeaderIndex(headerCells, [/模型倍率|model.?ratio|输入倍率|ratio/i]);
    const completionRatioIndex = findHeaderIndex(headerCells, [/completion|输出倍率|补全倍率|output/i]);
    const sizeRatioIndex = findHeaderIndex(headerCells, [/尺寸倍率|size/i]);
    const groupRatioIndex = findHeaderIndex(headerCells, [/分组倍率|group/i]);
    const quotaTypeIndex = findHeaderIndex(headerCells, [/quota|计费方式|类型|type/i]);

    for (const rowHtml of rowMatches.slice(1)) {
      const cells = Array.from(rowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)).map((match) => stripTags(match[1] || ''));
      if (!cells.length || !cells[modelIndex]) continue;

      const quotaRaw = quotaTypeIndex >= 0 ? cells[quotaTypeIndex] : '';
      const quotaType = /按次|per.?request|fixed/i.test(quotaRaw) ? 1 : undefined;
      const row = normalizePricingRow({
        model_name: cells[modelIndex],
        model_price: basePriceIndex >= 0 ? toNumber(cells[basePriceIndex].replace(/[^\d.]/g, '')) : undefined,
        model_ratio: modelRatioIndex >= 0 ? toNumber(cells[modelRatioIndex].replace(/[^\d.]/g, '')) : undefined,
        completion_ratio: completionRatioIndex >= 0 ? toNumber(cells[completionRatioIndex].replace(/[^\d.]/g, '')) : undefined,
        size_ratio: sizeRatioIndex >= 0 ? parseRatioMapFromText(cells[sizeRatioIndex]) : undefined,
        group_model_ratio: groupRatioIndex >= 0 ? parseRatioMapFromText(cells[groupRatioIndex]) : undefined,
        quota_type: quotaType,
      });

      if (row) rows.push(row);
    }
  }

  return rows;
};

const extractEmbeddedJson = (html: string): unknown[] => {
  const matches: unknown[] = [];
  const patterns = [
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]*id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    /window\.__NEXT_DATA__\s*=\s*({[\s\S]*?})\s*;/gi,
    /window\.__NUXT__\s*=\s*({[\s\S]*?})\s*;/gi,
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const parsed = tryParseLooseJson((match[1] || '').trim());
      if (parsed) matches.push(parsed);
    }
  }

  for (const scriptMatch of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const script = scriptMatch[1] || '';
    const assignmentPatterns = [
      /(?:window\.)?[A-Za-z0-9_$]+\s*=\s*({[\s\S]*?});/g,
      /(?:window\.)?[A-Za-z0-9_$]+\s*=\s*(\[[\s\S]*?\]);/g,
      /JSON\.parse\(\s*("(?:(?:\\.|[^"])*)"|'(?:(?:\\.|[^'])*)')\s*\)/g,
    ];

    for (const pattern of assignmentPatterns) {
      for (const match of script.matchAll(pattern)) {
        let raw: unknown = (match[1] || '').trim();
        if (!raw) continue;

        if (typeof raw === 'string' && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))) {
          try {
            raw = JSON.parse(raw);
          } catch {
            raw = raw.substring(1, raw.length - 1);
          }
        }

        const parsed = typeof raw === 'string' ? tryParseLooseJson(decodeHtmlEntities(raw)) : raw;
        if (parsed) matches.push(parsed);
      }
    }
  }

  return matches;
};

const normalizeDiscoveredUrl = (rawUrl: string, baseUrl: string) => {
  const trimmed = rawUrl.trim().replace(/\\\//g, '/');
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const base = new URL(baseUrl);
      if (url.origin !== base.origin) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  if (!trimmed.startsWith('/')) return null;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
};

const discoverDynamicTargets = (html: string, baseUrl: string): DiscoveryTarget[] => {
  const discovered = new Map<string, DiscoveryTarget>();
  const patterns = [
    /["'`](\/[^"'`\s]*(?:pricing|price|quota|billing|model|models)[^"'`\s]*)["'`]/gi,
    /fetch\(\s*["'`](\/[^"'`\s]+)["'`]/gi,
    /axios\.(?:get|post)\(\s*["'`](\/[^"'`\s]+)["'`]/gi,
    /url\s*:\s*["'`](\/[^"'`\s]+)["'`]/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const candidate = normalizeDiscoveredUrl(match[1] || '', baseUrl);
      if (!candidate) continue;

      if (!/(pricing|price|quota|billing|model|models)/i.test(candidate)) continue;

      discovered.set(candidate, {
        key: `discovered:${new URL(candidate).pathname}`,
        url: candidate,
        accept: /(?:\/api\/|\.json|pricing|quota|billing)/i.test(candidate)
          ? 'application/json, text/plain;q=0.9, */*;q=0.8'
          : 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      });
    }
  }

  return Array.from(discovered.values()).slice(0, 8);
};

const parsePayload = (text: string): ParsedPayload | null => {
  if (!text.trim()) return null;

  if (looksLikeHtml(text)) {
    const payloads = extractEmbeddedJson(text);
    const rows = mergeRows(...payloads.map((payload) => collectPricingRows(payload)), extractTableRows(text));
    const groupRatio = mergeGroupRatios(
      ...payloads.flatMap((payload) => collectGroupRatios(payload)),
      parseRatioMapFromText(text)
    );
    return rows.length > 0 ? { data: rows, groupRatio } : null;
  }

  const parsed = tryParseLooseJson(text);
  if (!parsed) return null;

  const directGroupRatio =
    normalizeRatioMap((parsed as Record<string, unknown>).group_ratio) ||
    normalizeRatioMap((parsed as Record<string, unknown>).groupRatio);

  return {
    data: mergeRows(collectPricingRows(parsed)),
    groupRatio: mergeGroupRatios(directGroupRatio, ...collectGroupRatios(parsed)),
  };
};

const fetchText = async (url: string, accept: string) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: accept,
      'User-Agent': 'KK-Studio-Pricing-Proxy/2.0',
    },
  });

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
};

const fetchAndParse = async (url: string, accept: string) => {
  const result = await fetchText(url, accept);
  return {
    ...result,
    parsed: result.ok ? parsePayload(result.text) : null,
  };
};

export default async function handler(request: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST 请求' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const { baseUrl } = (await request.json()) as { baseUrl: string };
    const cleanUrl = (baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '');

    if (!cleanUrl) {
      return new Response(JSON.stringify({ error: '缺少 baseUrl' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const baseTargets: DiscoveryTarget[] = [
      {
        key: 'apiPricing',
        url: `${cleanUrl}/api/pricing`,
        accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      },
      {
        key: 'pricingPage',
        url: `${cleanUrl}/pricing`,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
      {
        key: 'pricingHtml',
        url: `${cleanUrl}/pricing.html`,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
      {
        key: 'modelsPage',
        url: `${cleanUrl}/models`,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
    ];

    const baseResults = await Promise.all(
      baseTargets.map((target) => fetchAndParse(target.url, target.accept).then((result) => ({ ...target, ...result })))
    );

    const discoveredTargets = Array.from(
      new Map(
        baseResults
          .filter((item) => item.ok && looksLikeHtml(item.text))
          .flatMap((item) => discoverDynamicTargets(item.text, cleanUrl))
          .map((target) => [target.url, target])
      ).values()
    ).filter((target) => !baseTargets.some((item) => item.url === target.url));

    const discoveredResults = await Promise.all(
      discoveredTargets.map((target) =>
        fetchAndParse(target.url, target.accept).then((result) => ({ ...target, ...result }))
      )
    );

    const results = [...baseResults, ...discoveredResults];

    const mergedData = mergeRows(...results.map((item) => item.parsed?.data || []));
    const mergedGroupRatio = mergeGroupRatios(...results.map((item) => item.parsed?.groupRatio));

    if (mergedData.length === 0) {
      const firstError = results.find((item) => !item.ok);
      const upstreamError = firstError
        ? `${firstError.key} 返回 ${firstError.status}`
        : '未从供应商价格页提取到基础价和倍率数据';

      return new Response(JSON.stringify({ error: upstreamError }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: mergedData,
        group_ratio: mergedGroupRatio,
        sources: Object.fromEntries(results.map((item) => [item.key, item.ok])),
        discovered: discoveredTargets.map((item) => item.url),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || '价格代理请求失败' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
