import { getModelDisplayInfo } from '../services/modelCapabilities';

const PINNED_MODELS_KEY = 'kk_pinned_models';
const NANO_BANANA_KEYWORDS = ['nano', 'banana'];

// Suffix priority: Higher index = Higher priority (displayed first)
// But standard sort is usually Ascending. We want "Best" first.
// So let's assign weights. Higher weight = Top of list.
const SUFFIX_WEIGHTS: Record<string, number> = {
    'ultra': 50,
    'pro': 40,
    'max': 35,
    'plus': 30,
    'advanced': 25,
    'turbo': 20,
    'flash': 15,
    'lite': 10,
    'nano': 5,
    'mini': 5,
};

export const getPinnedModels = (): string[] => {
    try {
        const stored = localStorage.getItem(PINNED_MODELS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

export const toggleModelPin = (modelId: string) => {
    const pinned = getPinnedModels();
    const index = pinned.indexOf(modelId);
    if (index === -1) {
        pinned.push(modelId);
    } else {
        pinned.splice(index, 1);
    }
    localStorage.setItem(PINNED_MODELS_KEY, JSON.stringify(pinned));
    // Trigger a custom event so components can re-render
    window.dispatchEvent(new Event('model-pinned-change'));
};

const getModelWeight = (modelId: string, pinned: string[]): number => {
    const lowerId = modelId.toLowerCase();

    // 1. Nano Banana Priority (Highest)
    if (NANO_BANANA_KEYWORDS.some(k => lowerId.includes(k))) {
        return 10000;
    }

    // 2. User Pinned Priority
    if (pinned.includes(modelId)) {
        return 5000;
    }

    return 0; // Standard models
};

const extractVersionNumber = (id: string): number => {
    const match = id.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : 0;
};

const getSuffixWeight = (id: string): number => {
    const lower = id.toLowerCase();
    for (const [suffix, weight] of Object.entries(SUFFIX_WEIGHTS)) {
        if (lower.includes(suffix)) return weight;
    }
    return 0;
};

// 6. Search Logic with Weighted Priority & Fuzzy Matching
// Priority: ID Match > Alias Match > Description Match
// Supports: "word matching" (all words present = higher score)
export const filterAndSortModels = (models: any[], searchText: string, customizations: Record<string, { alias?: string; description?: string }>): any[] => {
    if (!searchText) {
        return sortModels(models); // Fallback to standard sort
    }

    const lowerSearch = searchText.toLowerCase();
    const searchTokens = lowerSearch.split(/\s+/).filter(t => t.length > 0); // Split by space

    if (searchTokens.length === 0) return sortModels(models);

    // Map to store scores
    const scoredModels = models.map(model => {
        const custom = customizations[model.id] || {};
        const id = model.id.toLowerCase();
        const alias = (custom.alias || model.name || model.label || '').toLowerCase();
        // Provider is often useful to search by (e.g. "openai")
        const provider = (model.provider || '').toLowerCase();
        const desc = (custom.description || model.description || '').toLowerCase();

        let score = 0;
        let matchedTokensCount = 0;

        // Helper to score a field against tokens
        // Returns best match score for the field
        const scoreField = (text: string, weight: number) => {
            let fieldScore = 0;
            // Full phrase match (highest priority)
            if (text === lowerSearch) fieldScore += 1000 * weight;
            else if (text.startsWith(lowerSearch)) fieldScore += 500 * weight;
            else if (text.includes(lowerSearch)) fieldScore += 200 * weight;

            return fieldScore;
        };

        // Check for full phrase matches first
        score += scoreField(id, 2.0);      // ID is King
        score += scoreField(alias, 1.5);   // Alias/Name is Queen
        score += scoreField(provider, 1.0); // Provider matches are good

        // Token-based fuzzy match
        // For every token in search, find if it exists in fields
        searchTokens.forEach(token => {
            let tokenMatched = false;

            // ID Token Match
            if (id.includes(token)) {
                score += 50;
                if (id.startsWith(token)) score += 30; // Prefix bonus
                // Extra bonus if the token is a distinct part of the ID (e.g. "gpt-4" -> "gpt" matches)
                if (id.split(/[-_.]/).includes(token)) score += 50;
                tokenMatched = true;
            }

            // Alias Token Match
            if (alias.includes(token)) {
                score += 40;
                if (alias.startsWith(token)) score += 20;
                if (alias.split(/\s+/).includes(token)) score += 40;
                tokenMatched = true;
            }

            // Provider Token Match
            if (provider.includes(token)) {
                score += 30;
                tokenMatched = true;
            }

            // Description Token Match (Low weight)
            if (desc.includes(token)) {
                score += 5;
                tokenMatched = true;
            }

            if (tokenMatched) matchedTokensCount++;
        });

        // 🚀 CRITICAL: Bonus for matching ALL tokens
        // This ensures "gpt 4" ranks higher than "gpt-3.5" because both have "gpt" but "4" is specific
        if (matchedTokensCount === searchTokens.length) {
            score += 500; // Large bonus for complete coverage

            // [NEW] Compactness/Exactness Match
            // User wants "gemini-pro" to rank higher than "gemini-pro-vision" for search "gemini pro"
            // We penalize "extra" characters in the ID.
            // Calculate effective search length (sum of tokens) vs ID length
            const searchContentLength = searchTokens.join('').length;
            const idContentLength = id.replace(/[-_.]/g, '').length; // Normalize ID for fair length comparison

            const excessLength = Math.max(0, idContentLength - searchContentLength);

            // Penalty: -10 points per extra character
            // e.g. "gemini-3-pro" vs "gemini-3-pro-2026" (diff ~4 chars -> -40 points)
            score -= excessLength * 15;
        } else if (matchedTokensCount > 0) {
            // Partial match logic...
        }

        return { model, score, matchedTokensCount };
    });

    // Filter: Show matching results. 
    // Strategy: 
    // 1. Must match at least one token? Or just have score > 0?
    // 2. Strict Mode: If user types "gpt 4", do we hide "gpt 3"? Yes, ideally.
    //    Current logic: `matchedTokensCount === searchTokens.length` is strict intersection.
    //    Let's try to be helpful but precise.
    //    If ANY result matches ALL tokens, prefer showing only those?
    //    Or just trust the sorting?

    // User requested "fuzzy", so maybe relaxed filtering but strict sorting.
    // Let's filter out items with 0 score (no matches at all).
    const filtered = scoredModels.filter(item => item.score > 0);

    // Sort
    filtered.sort((a, b) => {
        // 1. Prefer items that matched MORE tokens (Coverage)
        if (a.matchedTokensCount !== b.matchedTokensCount) {
            return b.matchedTokensCount - a.matchedTokensCount;
        }
        // 2. Score
        if (a.score !== b.score) {
            return b.score - a.score;
        }
        // 3. Fallback to standard sort
        return a.model.id.localeCompare(b.model.id);
    });

    return filtered.map(item => item.model);
};

export const sortModels = (models: any[]): any[] => {
    // ... (existing sortModels logic remains the same, but implemented cleaner if possible)
    const pinned = getPinnedModels();

    const sorted = [...models].sort((a, b) => {
        const idA = a.id || a;
        const idB = b.id || b;

        const weightA = getModelWeight(idA, pinned);
        const weightB = getModelWeight(idB, pinned);

        if (weightA !== weightB) return weightB - weightA;

        const charA = idA[0].toLowerCase();
        const charB = idB[0].toLowerCase();

        if (charA !== charB) return charA.localeCompare(charB);

        const verA = extractVersionNumber(idA);
        const verB = extractVersionNumber(idB);
        if (verA !== verB) return verB - verA;

        const sufA = getSuffixWeight(idA);
        const sufB = getSuffixWeight(idB);
        if (sufA !== sufB) return sufB - sufA;

        return idA.localeCompare(idB);
    });

    return sorted;
};
