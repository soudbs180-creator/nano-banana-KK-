import { NetlifyRequest } from './request.js';
export type FlagValues = Record<string, unknown>;
export declare class Flags {
    #private;
    constructor(values: FlagValues);
    get(key: string): unknown;
    get evaluations(): Set<string>;
}
export declare const getRequestFlags: (req: NetlifyRequest) => Flags;
export declare const setRequestFlags: (req: NetlifyRequest, flags: Flags) => void;
