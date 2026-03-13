import type { Buffer } from 'node:buffer';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Context } from './context.js';
import type { Flags } from './flags.js';
import type { OperationCounter } from './operation_counter.js';
import type { FetchCall } from './request_store.js';
export declare const requestFlags: unique symbol;
export declare const requestRoute: unique symbol;
export declare const requestNodeUpgrade: unique symbol;
declare const BaseRequest: typeof Request;
export interface NodeRequestPrimitives {
    request: IncomingMessage;
    socket: Duplex;
    head: Buffer;
}
export declare class NetlifyRequest extends BaseRequest {
    [requestFlags]?: Flags;
    [requestRoute]?: string;
    [requestNodeUpgrade]?: NodeRequestPrimitives;
}
export type RequestContext = {
    cacheAPI: {
        host: string;
        token: string;
        url: string;
    } | null;
    cdnLoopHeader: string | null;
    context: Context;
    identityContext: Record<string, unknown> | null;
    operationCounter: OperationCounter;
    fetchCalls: FetchCall[];
};
export declare const getFetchTiming: (requestContext: RequestContext) => string[];
export {};
