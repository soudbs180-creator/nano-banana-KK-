/**
 * System Log Service
 * Collects system errors in AI-readable format for debugging
 * Data resets at midnight each day
 */

export enum LogLevel {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL'
}

export interface SystemLogEntry {
    id: string;
    level: LogLevel;
    message: string;
    details: string; // AI-readable technical details
    timestamp: number;
    source: string; // Component/service name
    stack?: string;
}

interface DailyLogs {
    date: string;
    entries: SystemLogEntry[];
}

const STORAGE_KEY = 'kk_studio_system_logs';
const MAX_ENTRIES = 100; // Limit to prevent localStorage overflow

let listeners: ((logs: SystemLogEntry[]) => void)[] = [];

/**
 * Get today's date string
 */
function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}

/**
 * Load logs from localStorage
 */
function loadLogs(): DailyLogs {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const data: DailyLogs = JSON.parse(stored);
            if (data.date === getTodayString()) {
                return data;
            }
        }
    } catch (e) {
        console.warn('[SystemLog] Failed to load logs:', e);
    }
    return { date: getTodayString(), entries: [] };
}

/**
 * Save logs to localStorage
 */
function saveLogs(data: DailyLogs): void {
    try {
        // Trim old entries if too many
        if (data.entries.length > MAX_ENTRIES) {
            data.entries = data.entries.slice(-MAX_ENTRIES);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('[SystemLog] Failed to save logs:', e);
    }
}

/**
 * Add a log entry
 */
export function addLog(
    level: LogLevel,
    source: string,
    message: string,
    details: string,
    stack?: string
): void {
    const data = loadLogs();

    const entry: SystemLogEntry = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        level,
        source,
        message,
        details,
        timestamp: Date.now(),
        stack
    };

    data.entries.push(entry);
    saveLogs(data);

    // Notify listeners
    listeners.forEach(l => l(data.entries));

    // Also log to console
    const consoleMethod = level === LogLevel.ERROR || level === LogLevel.CRITICAL
        ? console.error
        : level === LogLevel.WARNING
            ? console.warn
            : console.log;
    consoleMethod(`[${source}] ${message}`, details);
}

/**
 * Log an error with stack trace
 */
export function logError(source: string, error: Error | unknown, context?: string): void {
    const err = error instanceof Error ? error : new Error(String(error));

    const aiReadableDetails = `
[ERROR DETAILS FOR AI DEBUGGING]
Source: ${source}
Context: ${context || 'None'}
Error Name: ${err.name}
Error Message: ${err.message}
Stack Trace:
${err.stack || 'No stack available'}

[SUGGESTED FIXES]
1. Check if the error is related to network connectivity
2. Verify API key configuration if it's an API error
3. Check for null/undefined values if it's a TypeError
4. Review the stack trace for the exact line causing the issue
`.trim();

    addLog(LogLevel.ERROR, source, err.message, aiReadableDetails, err.stack);
}

/**
 * Log a warning
 */
export function logWarning(source: string, message: string, details?: string): void {
    addLog(LogLevel.WARNING, source, message, details || message);
}

/**
 * Log an info message
 */
export function logInfo(source: string, message: string, details?: string): void {
    addLog(LogLevel.INFO, source, message, details || message);
}

/**
 * Get today's logs
 */
export function getTodayLogs(): SystemLogEntry[] {
    return loadLogs().entries;
}

/**
 * Get logs filtered by level
 */
export function getLogsByLevel(level: LogLevel): SystemLogEntry[] {
    return loadLogs().entries.filter(e => e.level === level);
}

/**
 * Subscribe to log updates
 */
export function subscribeToLogs(callback: (logs: SystemLogEntry[]) => void): () => void {
    listeners.push(callback);
    return () => {
        listeners = listeners.filter(l => l !== callback);
    };
}

/**
 * Clear today's logs
 */
export function clearLogs(): void {
    localStorage.removeItem(STORAGE_KEY);
    listeners.forEach(l => l([]));
}

/**
 * Export logs as text for AI debugging
 */
export function exportLogsForAI(): string {
    const logs = getTodayLogs();
    if (logs.length === 0) return 'No system logs for today.';

    return `
# KK Studio System Logs - ${getTodayString()}
Total Entries: ${logs.length}

${logs.map((log, i) => `
## Entry ${i + 1}: [${log.level}] ${new Date(log.timestamp).toLocaleTimeString()}
Source: ${log.source}
Message: ${log.message}

\`\`\`
${log.details}
\`\`\`
`).join('\n---\n')}
`.trim();
}
