import { ModelPreset, MODEL_PRESETS } from './modelPresets';
import { normalizeModelId } from './keyManager';

const STORAGE_KEY = 'kk_active_models';

export interface ActiveModel extends ModelPreset {
    enabled: boolean;
    custom?: boolean; // True if manually added by user (not in presets)
}

// Default models that are enabled out of the box
// Prefer official Gemini/Imagen model IDs
const DEFAULT_MODELS: ActiveModel[] = [
    { ...MODEL_PRESETS.find(m => m.id === 'gemini-2.5-flash-image')!, enabled: true },
    { ...MODEL_PRESETS.find(m => m.id === 'gemini-3-pro-image-preview')!, enabled: true },
    { ...MODEL_PRESETS.find(m => m.id === 'imagen-4.0-generate-001')!, enabled: true },
    { ...MODEL_PRESETS.find(m => m.id === 'imagen-4.0-ultra-generate-001')!, enabled: true },
    { ...MODEL_PRESETS.find(m => m.id === 'imagen-4.0-fast-generate-001')!, enabled: true },
];

class ModelRegistry {
    private models: ActiveModel[] = [];
    private listeners: (() => void)[] = [];

    constructor() {
        this.load();
    }

    private load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    // Filter out invalid items (null, non-objects, or missing id)
                    let validItems = parsed.filter((m: any) => m && typeof m === 'object' && typeof m.id === 'string');

                    // ✨ 自动校正模型 ID（将旧模型迁移到新模型）
                    validItems = validItems.map((m: any) => ({
                        ...m,
                        id: normalizeModelId(m.id)
                    }));

                    // 去重（防止多个旧模型映射到同一个新模型）
                    const uniqueItems = Array.from(
                        new Map(validItems.map((m: any) => [m.id, m])).values()
                    );

                    if (uniqueItems.length > 0) {
                        this.models = uniqueItems;
                    } else {
                        this.models = [...DEFAULT_MODELS];
                    }
                } else {
                    this.models = [...DEFAULT_MODELS];
                }
            } else {
                this.models = [...DEFAULT_MODELS];
            }
        } catch (e) {
            console.error('Failed to load models', e);
            this.models = [...DEFAULT_MODELS];
        }
    }

    private save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.models));
        this.notify();
    }

    public getModels(): ActiveModel[] {
        return this.models;
    }

    public getEnabledModels(): ActiveModel[] {
        return this.models.filter(m => m.enabled);
    }

    public addModel(model: ActiveModel) {
        if (this.models.find(m => m.id === model.id)) {
            // Already exists, just enable it
            this.updateModel(model.id, { enabled: true });
        } else {
            this.models.push(model);
            this.save();
        }
    }

    public removeModel(id: string) {
        this.models = this.models.filter(m => m.id !== id);
        this.save();
    }

    public updateModel(id: string, updates: Partial<ActiveModel>) {
        const index = this.models.findIndex(m => m.id === id);
        if (index !== -1) {
            this.models[index] = { ...this.models[index], ...updates };
            this.save();
        }
    }

    public resetToDefaults() {
        this.models = [...DEFAULT_MODELS];
        this.save();
    }

    public subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l());
    }
}

export const modelRegistry = new ModelRegistry();
