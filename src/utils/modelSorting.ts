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

export const sortModels = (models: any[]): any[] => {
    const pinned = getPinnedModels();

    return [...models].sort((a, b) => {
        const idA = a.id || a;
        const idB = b.id || b;

        const weightA = getModelWeight(idA, pinned);
        const weightB = getModelWeight(idB, pinned);

        // 1. Top Level Priority (Nano/Pinned)
        if (weightA !== weightB) {
            return weightB - weightA; // Descending weight
        }

        // If both are Nano or both are Pinned (or both standard), sort internally

        // 2. Alphabetical (A-Z) - Primary Sort Key
        // But user said: "A-Z sorting. If first letter same, number large first."
        // And "Suffix Ultra/Pro large first."

        // Let's parse the logic carefully:
        // "首字母A-Z排序" -> Group by starting letter.
        // "如果首字母一样按照数字大的排前面" -> Within same letter, compare version numbers.
        // "如果后缀有Ultra或者pro等尾缀按理来说大的排前面" -> This conflicts slightly with strict A-Z if the suffix is part of the name. 
        // Usually, Model IDs are like "gemini-1.5-pro".
        // "gemini" is the family. "1.5" is version. "pro" is suffix.

        // Let's try a composite score approach for Standard Sorting.

        const nameA = a.name || idA; // Use Display Name if available? Or ID? User said "Input box model library", usually ID is the key but Name is displayed.
        // Let's stick to ID characteristic for "Ultra/Pro" detection, but maybe Name for A-Z?
        // IDs are usually consistent.

        const charA = idA[0].toLowerCase();
        const charB = idB[0].toLowerCase();

        if (charA !== charB) {
            return charA.localeCompare(charB); // A-Z
        }

        // Same first letter.

        // 3. Version Number (Descending)
        const verA = extractVersionNumber(idA);
        const verB = extractVersionNumber(idB);
        if (verA !== verB) {
            return verB - verA; // Higher version first (e.g. 1.5 > 1.0)
        }

        // 4. Suffix Priority (Descending: Ultra > Pro > Flash)
        const sufA = getSuffixWeight(idA);
        const sufB = getSuffixWeight(idB);
        if (sufA !== sufB) {
            return sufB - sufA;
        }

        // 5. Fallback strings
        return idA.localeCompare(idB);
    });
};
