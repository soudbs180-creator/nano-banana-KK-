import type { PromptOptimizerTemplate } from '../config/promptOptimizerTemplates';
import type { PromptLibraryItem } from '../config/promptLibrary';
import type { GenerationConfig } from '../types';

export type PromptFeatureIssue = {
    id: string;
    severity: 'warning' | 'error';
    message: string;
};

export type PromptFeatureHealthReport = {
    issues: PromptFeatureIssue[];
    hasBlockingIssue: boolean;
    summary: string;
};

export const validatePromptLibraryItems = (
    items: PromptLibraryItem[],
): PromptFeatureIssue[] => {
    const issues: PromptFeatureIssue[] = [];

    if (!Array.isArray(items) || items.length === 0) {
        issues.push({
            id: 'library-empty',
            severity: 'error',
            message: '提示词库为空，无法稳定提供插入模板。',
        });
        return issues;
    }

    const idSet = new Set<string>();
    const titleSet = new Set<string>();

    items.forEach((item, index) => {
        const normalizedId = String(item.id || '').trim();
        const normalizedTitle = String(item.title || '').trim();
        const normalizedPrompt = String(item.prompt || '').trim();

        if (!normalizedId || !normalizedTitle || !normalizedPrompt) {
            issues.push({
                id: `library-item-invalid-${index}`,
                severity: 'error',
                message: `提示词库第 ${index + 1} 项存在空标题、空 ID 或空内容。`,
            });
            return;
        }

        if (idSet.has(normalizedId)) {
            issues.push({
                id: `library-duplicate-id-${normalizedId}`,
                severity: 'warning',
                message: `提示词库存在重复 ID：${normalizedId}`,
            });
        }
        if (titleSet.has(normalizedTitle)) {
            issues.push({
                id: `library-duplicate-title-${normalizedTitle}`,
                severity: 'warning',
                message: `提示词库存在重复标题：${normalizedTitle}`,
            });
        }

        idSet.add(normalizedId);
        titleSet.add(normalizedTitle);
    });

    return issues;
};

export const validatePromptOptimizerState = (
    config: Pick<
        GenerationConfig,
        | 'enablePromptOptimization'
        | 'promptOptimizationMode'
        | 'promptOptimizationTemplateId'
        | 'promptOptimizationCustomPrompt'
        | 'mode'
    >,
    templates: PromptOptimizerTemplate[],
): PromptFeatureIssue[] => {
    const issues: PromptFeatureIssue[] = [];
    const supportedMode = config.mode === 'image' || config.mode === 'ppt';

    if (config.enablePromptOptimization && !supportedMode) {
        issues.push({
            id: 'optimizer-unsupported-mode',
            severity: 'error',
            message: '当前模式不支持提示词优化，系统将自动回退到原始提示词。',
        });
    }

    if (supportedMode && templates.length === 0) {
        issues.push({
            id: 'optimizer-template-empty',
            severity: 'error',
            message: '当前模式没有可用的优化模板，提示词优化无法稳定运行。',
        });
    }

    if (
        config.enablePromptOptimization
        && templates.length > 0
        && !templates.some((template) => template.id === config.promptOptimizationTemplateId)
    ) {
        issues.push({
            id: 'optimizer-template-missing',
            severity: 'warning',
            message: '当前选中的优化模板无效，系统会自动切回默认模板。',
        });
    }

    if (
        config.enablePromptOptimization
        && config.promptOptimizationMode === 'custom'
        && !String(config.promptOptimizationCustomPrompt || '').trim()
    ) {
        issues.push({
            id: 'optimizer-custom-empty',
            severity: 'warning',
            message: '自定义优化规则为空，系统会继续使用所选模板作为兜底。',
        });
    }

    return issues;
};

export const buildPromptFeatureHealthReport = (
    libraryItems: PromptLibraryItem[],
    templates: PromptOptimizerTemplate[],
    config: Pick<
        GenerationConfig,
        | 'enablePromptOptimization'
        | 'promptOptimizationMode'
        | 'promptOptimizationTemplateId'
        | 'promptOptimizationCustomPrompt'
        | 'mode'
    >,
): PromptFeatureHealthReport => {
    const issues = [
        ...validatePromptLibraryItems(libraryItems),
        ...validatePromptOptimizerState(config, templates),
    ];

    const hasBlockingIssue = issues.some((issue) => issue.severity === 'error');
    const summary = hasBlockingIssue
        ? `自检发现 ${issues.length} 个问题`
        : issues.length > 0
            ? `自检发现 ${issues.length} 个可修复提醒`
            : '提示词库与提示词优化功能自检正常';

    return {
        issues,
        hasBlockingIssue,
        summary,
    };
};
