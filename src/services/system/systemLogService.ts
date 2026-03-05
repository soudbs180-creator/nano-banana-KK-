/**
 * 系统日志服务
 * 仅在本地保存当日日志，用于故障排查与导出。
 */

export enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export interface SystemLogEntry {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  details: string;
  timestamp: number;
  stack?: string;
}

interface DailyLogs {
  date: string;
  entries: SystemLogEntry[];
}

const STORAGE_KEY = 'kk_studio_system_logs';
const MAX_ENTRIES = 200;

let listeners: Array<(logs: SystemLogEntry[]) => void> = [];

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function loadLogs(): DailyLogs {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DailyLogs;
      if (parsed.date === getTodayString() && Array.isArray(parsed.entries)) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('[SystemLog] 读取日志失败:', error);
  }

  return { date: getTodayString(), entries: [] };
}

function saveLogs(data: DailyLogs): void {
  try {
    const safeData: DailyLogs = {
      date: data.date,
      entries: data.entries.slice(-MAX_ENTRIES),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeData));
  } catch (error) {
    console.warn('[SystemLog] 保存日志失败:', error);
  }
}

function notifyListeners(entries: SystemLogEntry[]) {
  listeners.forEach((listener) => listener(entries));
}

export function addLog(
  level: LogLevel,
  source: string,
  message: string,
  details: string,
  stack?: string
): void {
  const data = loadLogs();
  const entry: SystemLogEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    level,
    source,
    message,
    details,
    timestamp: Date.now(),
    stack,
  };

  data.entries.push(entry);
  saveLogs(data);
  notifyListeners(data.entries);

  if (level === LogLevel.ERROR || level === LogLevel.CRITICAL) {
    console.error(`[${source}] ${message}`, details);
    return;
  }

  if (level === LogLevel.WARNING) {
    console.warn(`[${source}] ${message}`, details);
    return;
  }

  console.log(`[${source}] ${message}`, details);
}

export function logError(source: string, error: Error | unknown, context?: string): void {
  const err = error instanceof Error ? error : new Error(String(error));

  const details = [
    `来源：${source}`,
    `上下文：${context || '未提供'}`,
    `错误名称：${err.name}`,
    `错误信息：${err.message}`,
    `堆栈：${err.stack || '无堆栈信息'}`,
  ].join('\n');

  addLog(LogLevel.ERROR, source, err.message, details, err.stack);
}

export function logWarning(source: string, message: string, details?: string): void {
  addLog(LogLevel.WARNING, source, message, details || message);
}

export function logInfo(source: string, message: string, details?: string): void {
  addLog(LogLevel.INFO, source, message, details || message);
}

export function getTodayLogs(): SystemLogEntry[] {
  return loadLogs().entries;
}

export function getLogsByLevel(level: LogLevel): SystemLogEntry[] {
  return loadLogs().entries.filter((entry) => entry.level === level);
}

export function subscribeToLogs(callback: (logs: SystemLogEntry[]) => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((listener) => listener !== callback);
  };
}

export function clearLogs(): void {
  localStorage.removeItem(STORAGE_KEY);
  notifyListeners([]);
}

export function exportLogsForAI(): string {
  const logs = getTodayLogs();
  if (logs.length === 0) {
    return `KK Studio 系统日志\n日期：${getTodayString()}\n\n今日暂无系统日志。`;
  }

  const content = logs
    .map((log, index) => {
      const lines = [
        `## 日志 ${index + 1}`,
        `时间：${new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false })}`,
        `级别：${log.level}`,
        `来源：${log.source}`,
        `信息：${log.message}`,
        '详情：',
        log.details,
      ];

      if (log.stack) {
        lines.push('堆栈：');
        lines.push(log.stack);
      }

      return lines.join('\n');
    })
    .join('\n\n--------------------------------\n\n');

  return [`KK Studio 系统日志`, `日期：${getTodayString()}`, `总条数：${logs.length}`, '', content].join('\n');
}
