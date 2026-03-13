import { GenerationMode } from '../types';

export interface PromptOptimizerTemplate {
    id: string;
    title: string;
    description: string;
    instruction: string;
    supportedModes: GenerationMode[];
}

export const PROMPT_OPTIMIZER_TEMPLATES: PromptOptimizerTemplate[] = [
    {
        id: 'balanced',
        title: '通用增强',
        description: '补齐主体、风格、构图、光线与背景，让结果更完整但不过度膨胀。',
        instruction: 'Clarify the core subject, style, composition, lighting, materials, and background. Keep the final English prompt concise, visually specific, and production-ready.',
        supportedModes: [GenerationMode.IMAGE, GenerationMode.PPT],
    },
    {
        id: 'product-hero',
        title: '电商主图',
        description: '强调商业质感、材质细节、控光和主商品聚焦。',
        instruction: 'Optimize for premium product hero imagery with commercial lighting, crisp material detail, believable reflections, clean staging, and a strong focal hierarchy.',
        supportedModes: [GenerationMode.IMAGE, GenerationMode.PPT],
    },
    {
        id: 'cinematic-scene',
        title: '电影感场景',
        description: '突出氛围、镜头语言、叙事张力与真实感。',
        instruction: 'Optimize for cinematic storytelling with lens-aware composition, natural depth, atmosphere, realistic texture, and emotionally coherent lighting.',
        supportedModes: [GenerationMode.IMAGE, GenerationMode.PPT],
    },
    {
        id: 'ui-infographic',
        title: '界面与版式',
        description: '适合海报、UI、信息图、看板，强调层级与留白。',
        instruction: 'Optimize for interface, infographic, or editorial layouts with strong hierarchy, grid alignment, text-safe spacing, modern design language, and disciplined color usage.',
        supportedModes: [GenerationMode.IMAGE, GenerationMode.PPT],
    },
    {
        id: 'ppt-narrative',
        title: 'PPT 叙事',
        description: '适合整套演示视觉，强调页间一致性、信息层级和演示安全区。',
        instruction: 'Optimize for slide-ready visuals with presentation-safe composition, consistent deck style, strong page hierarchy, uncluttered layout, and restrained text rendering unless explicitly requested.',
        supportedModes: [GenerationMode.PPT],
    },
];

export const getAvailablePromptOptimizerTemplates = (
    mode?: GenerationMode,
): PromptOptimizerTemplate[] => {
    if (!mode) return [...PROMPT_OPTIMIZER_TEMPLATES];
    return PROMPT_OPTIMIZER_TEMPLATES.filter((template) => template.supportedModes.includes(mode));
};

export const getDefaultPromptOptimizerTemplateId = (mode?: GenerationMode): string => {
    if (mode === GenerationMode.PPT) return 'ppt-narrative';
    return 'balanced';
};

export const getPromptOptimizerTemplate = (
    templateId?: string,
    mode?: GenerationMode,
): PromptOptimizerTemplate | undefined => {
    const availableTemplates = getAvailablePromptOptimizerTemplates(mode);
    const matchedTemplate = availableTemplates.find((template) => template.id === templateId);
    if (matchedTemplate) return matchedTemplate;

    const defaultTemplateId = getDefaultPromptOptimizerTemplateId(mode);
    return (
        availableTemplates.find((template) => template.id === defaultTemplateId)
        || availableTemplates[0]
    );
};
