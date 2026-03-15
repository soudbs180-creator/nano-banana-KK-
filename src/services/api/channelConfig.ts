import type { Provider } from '../../types';
import type { ApiProtocolFormat, AuthMethod } from './apiConfig';

export type ProviderFamily =
  | 'google-official'
  | '12ai'
  | 'newapi-family'
  | 'generic-openai'
  | 'generic-gemini'
  | 'claude-native'
  | 'system-proxy';

export type ProtocolFamily =
  | 'openai-compatible'
  | 'gemini-native'
  | 'claude-native';

export type ChannelPricingSupport = 'native' | 'manual' | 'none';
export type ChannelManagementSupport = 'native' | 'external' | 'none';

export type ChannelEndpointStyle =
  | 'openai-compatible'
  | 'gemini-native'
  | 'claude-native'
  | 'google-official'
  | 'system-proxy';

export interface ChannelAuthProfile {
  authMethod?: AuthMethod;
  headerName?: string;
  authorizationValueFormat?: 'bearer' | 'raw';
}

export interface ChannelCapabilities {
  chat: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  modelDiscovery: boolean;
  pricingDiscovery: boolean;
  managementApi: boolean;
}

export interface ChannelConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  provider?: Provider | string;
  providerFamily: ProviderFamily;
  protocolHint: ApiProtocolFormat;
  authProfile: ChannelAuthProfile;
  capabilities: ChannelCapabilities;
  pricingSupport: ChannelPricingSupport;
  managementSupport: ChannelManagementSupport;
  supportedModels: string[];
  group?: string;
  compatibilityMode?: 'standard' | 'chat';
  source?: 'user-slot' | 'provider' | 'admin' | 'system';
}
