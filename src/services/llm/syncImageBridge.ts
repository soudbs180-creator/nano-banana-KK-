export type SyncImageBridgeParserType =
  | 'openai-compatible-image'
  | 'openai-chat-best-image'
  | 'gemini-native-image';

export type SyncImageBridgeResult =
  | {
      requestId: string;
      status: 'pending';
      startedAt?: number;
      completedAt?: number;
    }
  | {
      requestId: string;
      status: 'success';
      urls: string[];
      startedAt?: number;
      completedAt?: number;
      responseStatus?: number;
      responseBodyPreview?: string;
    }
  | {
      requestId: string;
      status: 'error';
      error: string;
      code?: string;
      startedAt?: number;
      completedAt?: number;
      responseStatus?: number;
      responseBodyPreview?: string;
    }
  | {
      requestId: string;
      status: 'missing';
    };

type BridgeAction =
  | 'start-job'
  | 'get-job'
  | 'clear-job'
  | 'abort-job';

type BridgeMessage = {
  source: 'kk-sync-image-bridge';
  correlationId: string;
  action: BridgeAction;
  payload: Record<string, unknown>;
};

type StartJobPayload = {
  requestId: string;
  parserType: SyncImageBridgeParserType;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

const SYNC_IMAGE_BRIDGE_SW_URL = '/sync-image-bridge-sw.js';
const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_WAIT_TIMEOUT_MS = 15 * 60 * 1000;

let bridgeMessageCounter = 0;
const pendingResponses = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
    timeoutId: number;
  }
>();
let bridgeMessageListenerBound = false;
let bridgeRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function isWindowAvailable(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

export function isSyncImageBridgeSupported(): boolean {
  return isWindowAvailable()
    && 'serviceWorker' in navigator
    && (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
}

function handleBridgeMessage(event: MessageEvent) {
  const data = event.data as Partial<BridgeMessage> & { ok?: boolean; error?: string; result?: any };
  if (!data || data.source !== 'kk-sync-image-bridge' || typeof data.correlationId !== 'string') {
    return;
  }

  const pending = pendingResponses.get(data.correlationId);
  if (!pending) return;

  pendingResponses.delete(data.correlationId);
  window.clearTimeout(pending.timeoutId);

  if (data.ok === false) {
    pending.reject(new Error(data.error || 'Sync image bridge request failed'));
    return;
  }

  pending.resolve(data.result);
}

function ensureBridgeMessageListener() {
  if (!isWindowAvailable() || bridgeMessageListenerBound) return;
  navigator.serviceWorker.addEventListener('message', handleBridgeMessage);
  bridgeMessageListenerBound = true;
}

async function getBridgeWorker(): Promise<ServiceWorker | null> {
  if (!isSyncImageBridgeSupported()) {
    return null;
  }

  ensureBridgeMessageListener();

  if (!bridgeRegistrationPromise) {
    bridgeRegistrationPromise = navigator.serviceWorker
      .register(SYNC_IMAGE_BRIDGE_SW_URL)
      .then(async (registration) => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          await new Promise<void>((resolve) => {
            const onStateChange = () => {
              if (installingWorker.state === 'activated') {
                installingWorker.removeEventListener('statechange', onStateChange);
                resolve();
              }
            };
            installingWorker.addEventListener('statechange', onStateChange);
          });
        }
        return registration;
      })
      .catch((error) => {
        console.warn('[syncImageBridge] Service worker registration failed:', error);
        return null;
      });
  }

  const registration = await bridgeRegistrationPromise;
  if (!registration) return null;

  return registration.active || registration.waiting || registration.installing || navigator.serviceWorker.controller || null;
}

async function postBridgeMessage<T = any>(
  action: BridgeAction,
  payload: Record<string, unknown>,
  timeoutMs = 10000
): Promise<T> {
  const worker = await getBridgeWorker();
  if (!worker) {
    throw new Error('Sync image bridge is unavailable');
  }

  const correlationId = `sync-bridge-${Date.now()}-${++bridgeMessageCounter}`;
  const message: BridgeMessage = {
    source: 'kk-sync-image-bridge',
    correlationId,
    action,
    payload,
  };

  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingResponses.delete(correlationId);
      reject(new Error(`Sync image bridge timed out for ${action}`));
    }, timeoutMs);

    pendingResponses.set(correlationId, { resolve, reject, timeoutId });
    worker.postMessage(message);
  });
}

export async function startSyncImageBridgeRequest(payload: StartJobPayload): Promise<SyncImageBridgeResult> {
  return postBridgeMessage<SyncImageBridgeResult>('start-job', payload, 15000);
}

export async function getSyncImageBridgeRequest(requestId: string): Promise<SyncImageBridgeResult> {
  return postBridgeMessage<SyncImageBridgeResult>('get-job', { requestId }, 10000);
}

export async function clearSyncImageBridgeRequest(requestId: string): Promise<void> {
  await postBridgeMessage('clear-job', { requestId }, 10000);
}

export async function abortSyncImageBridgeRequest(requestId: string): Promise<void> {
  await postBridgeMessage('abort-job', { requestId }, 10000);
}

export async function executeSyncImageBridgeRequest(params: StartJobPayload & { signal?: AbortSignal }): Promise<SyncImageBridgeResult> {
  const { signal, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, requestId, ...startPayload } = params;
  const startResult = await startSyncImageBridgeRequest({
    requestId,
    timeoutMs,
    ...startPayload,
  });

  if (startResult.status === 'success' || startResult.status === 'error') {
    return startResult;
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) {
      try {
        await abortSyncImageBridgeRequest(requestId);
      } catch (error) {
        console.warn('[syncImageBridge] Failed to abort request:', error);
      }
      throw signal.reason instanceof Error ? signal.reason : new Error('Generation cancelled');
    }

    await new Promise((resolve) => window.setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
    const current = await getSyncImageBridgeRequest(requestId);
    if (current.status === 'success' || current.status === 'error') {
      return current;
    }
  }

  throw new Error('Timed out waiting for sync image bridge result');
}
