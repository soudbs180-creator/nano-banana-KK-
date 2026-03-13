import { InvocationMetadata } from './metadata.js';
interface EnvironmentOptions {
    aiGateway?: string;
    blobs?: string;
    env?: NodeJS.ProcessEnv;
    headers: Headers;
    invocationMetadata?: InvocationMetadata;
    netlifyDBURL?: string;
    purgeAPIToken?: string;
}
export declare const setupEnvironment: ({ aiGateway, blobs, env, headers, invocationMetadata, netlifyDBURL, purgeAPIToken, }: EnvironmentOptions) => void;
export {};
