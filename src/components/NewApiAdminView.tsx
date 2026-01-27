import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react';
import {
  deleteNewApiAdminProfile,
  getActiveNewApiAdminConfig,
  getNewApiAdminState,
  saveNewApiAdminProfile,
  setActiveNewApiAdminProfile,
  newApiAdminRequest
} from '../services/newApiAdmin';
import { notify } from '../services/notificationService';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type ResourcePreset = {
  key: string;
  label: string;
  listPath: string;
  updatePath?: string;
  deletePath?: string;
};

type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'textarea' | 'array';
  aliases?: string[];
  readonly?: boolean;
};

type EditField = {
  def: FieldDef;
  actualKey: string;
  value: string | number | boolean;
};

type EditMode = 'form' | 'json';

type SectionProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const Section = ({ title, description, actions, children }: SectionProps) => (
  <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-[24px] p-6">
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-base font-bold text-white text-left">{title}</h4>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
    {description && (
      <p className="text-xs text-zinc-500 text-left w-full mt-2">
        {description}
      </p>
    )}
    <div className="mt-5 space-y-5">
      {children}
    </div>
  </div>
);

const NewApiAdminView = () => {
  const resourcePresets: ResourcePreset[] = [
    { key: 'channel', label: '渠道', listPath: '/channel', updatePath: '/channel', deletePath: '/channel/{id}' },
    { key: 'model', label: '模型', listPath: '/model', updatePath: '/model', deletePath: '/model/{id}' },
    { key: 'token', label: '令牌', listPath: '/token', updatePath: '/token', deletePath: '/token/{id}' },
    { key: 'user', label: '用户', listPath: '/user', updatePath: '/user', deletePath: '/user/{id}' },
    { key: 'group', label: '分组', listPath: '/group', updatePath: '/group', deletePath: '/group/{id}' },
    { key: 'vendor', label: '供应商', listPath: '/vendor', updatePath: '/vendor', deletePath: '/vendor/{id}' }
  ];

  const fieldPresets: Record<string, FieldDef[]> = {
    channel: [
      { key: 'name', label: '渠道名称', type: 'text', aliases: ['label'] },
      { key: 'type', label: '渠道类型', type: 'number', aliases: ['channel_type'] },
      { key: 'status', label: '状态', type: 'text', aliases: ['enabled'] },
      { key: 'base_url', label: 'Base URL', type: 'text', aliases: ['baseUrl', 'api_base_url'] },
      { key: 'models', label: '模型列表', type: 'array', aliases: ['model_list', 'model'] },
      { key: 'group', label: '分组', type: 'text', aliases: ['group_id'] },
      { key: 'priority', label: '优先级', type: 'number', aliases: ['weight'] },
      { key: 'ratio', label: '倍率', type: 'number', aliases: ['rate'] }
    ],
    model: [
      { key: 'id', label: '模型 ID', type: 'text', readonly: true },
      { key: 'name', label: '模型名称', type: 'text', aliases: ['label'] },
      { key: 'type', label: '模型类型', type: 'text' },
      { key: 'provider', label: '提供商', type: 'text', aliases: ['vendor'] },
      { key: 'enabled', label: '启用', type: 'boolean', aliases: ['status'] },
      { key: 'ratio', label: '倍率', type: 'number' }
    ],
    token: [
      { key: 'name', label: '令牌名称', type: 'text', aliases: ['label'] },
      { key: 'token', label: '令牌', type: 'text', aliases: ['key'] },
      { key: 'status', label: '状态', type: 'text', aliases: ['enabled'] },
      { key: 'group', label: '分组', type: 'text', aliases: ['group_id'] },
      { key: 'quota', label: '额度', type: 'number', aliases: ['total_quota'] },
      { key: 'used_quota', label: '已用额度', type: 'number' },
      { key: 'expired_time', label: '过期时间', type: 'text', aliases: ['expired_at'] }
    ],
    user: [
      { key: 'username', label: '用户名', type: 'text', aliases: ['name'] },
      { key: 'email', label: '邮箱', type: 'text' },
      { key: 'role', label: '角色', type: 'text' },
      { key: 'status', label: '状态', type: 'text', aliases: ['enabled'] },
      { key: 'quota', label: '额度', type: 'number', aliases: ['total_quota'] },
      { key: 'used_quota', label: '已用额度', type: 'number' },
      { key: 'group_id', label: '分组', type: 'text', aliases: ['group'] }
    ],
    group: [
      { key: 'name', label: '分组名称', type: 'text' },
      { key: 'ratio', label: '倍率', type: 'number' },
      { key: 'status', label: '状态', type: 'text', aliases: ['enabled'] },
      { key: 'models', label: '模型限制', type: 'array', aliases: ['model_list'] }
    ],
    vendor: [
      { key: 'name', label: '供应商名称', type: 'text' },
      { key: 'status', label: '状态', type: 'text', aliases: ['enabled'] },
      { key: 'base_url', label: 'Base URL', type: 'text', aliases: ['api_base_url', 'endpoint'] }
    ]
  };

  const storedState = useMemo(() => getNewApiAdminState(), []);
  const initialProfile = useMemo(() => getActiveNewApiAdminConfig(), []);
  const [profiles, setProfiles] = useState(storedState.profiles);
  const [activeProfileId, setActiveProfileId] = useState(storedState.activeProfileId || storedState.profiles[0]?.id || null);
  const [profileName, setProfileName] = useState((storedState.profiles.find(p => p.id === storedState.activeProfileId)?.name) || '默认连接');
  const [baseUrl, setBaseUrl] = useState(initialProfile.baseUrl);
  const [token, setToken] = useState(initialProfile.token);
  const [authHeader, setAuthHeader] = useState(initialProfile.authHeader || 'Authorization');
  const [tokenPrefix, setTokenPrefix] = useState(initialProfile.tokenPrefix || 'Bearer ');
  const [adminPath, setAdminPath] = useState(initialProfile.adminPath || '/api');
  const [adminPathStatus, setAdminPathStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [adminPathMessage, setAdminPathMessage] = useState('');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState('/status');
  const [body, setBody] = useState('');
  const [responseText, setResponseText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [resourceKey, setResourceKey] = useState(resourcePresets[0].key);
  const [listPath, setListPath] = useState(resourcePresets[0].listPath);
  const [updatePath, setUpdatePath] = useState(resourcePresets[0].updatePath || '');
  const [deletePath, setDeletePath] = useState(resourcePresets[0].deletePath || '');
  const [resourceItems, setResourceItems] = useState<any[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingJson, setEditingJson] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editingFields, setEditingFields] = useState<EditField[]>([]);
  const [editMode, setEditMode] = useState<EditMode>('form');
  const [batchMethod, setBatchMethod] = useState<HttpMethod>('DELETE');
  const [batchPath, setBatchPath] = useState(resourcePresets[0].deletePath || '');
  const [batchBody, setBatchBody] = useState('');

  const config = useMemo(() => ({ baseUrl, token, authHeader, tokenPrefix, adminPath }), [baseUrl, token, authHeader, tokenPrefix, adminPath]);

  const detectAdminPath = useCallback(async () => {
    if (!baseUrl.trim()) {
      setAdminPathStatus('error');
      setAdminPathMessage('请先填写 Base URL');
      return;
    }
    if (!token.trim()) {
      setAdminPathStatus('error');
      setAdminPathMessage('请先填写管理员 Token');
      return;
    }
    setAdminPathStatus('checking');
    setAdminPathMessage('');

    const normalizedBase = baseUrl.trim().replace(/\/$/, '');
    const base = normalizedBase.startsWith('http') ? normalizedBase : `https://${normalizedBase}`;
    const prefixes = ['/api', '/admin/api', '/api/admin', '/v1/api', '/console/api', ''];
    const endpoints = ['/status', '/system/status'];
    const headerName = authHeader || 'Authorization';
    const prefixValue = tokenPrefix !== undefined ? tokenPrefix : headerName === 'Authorization' ? 'Bearer ' : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [headerName]: `${prefixValue}${token.trim()}`
    };

    for (const prefix of prefixes) {
      for (const endpoint of endpoints) {
        const url = `${base}${prefix}${endpoint}`;
        try {
          const response = await fetch(url, { method: 'GET', headers });
          if (response.ok) {
            const path = prefix || '';
            setAdminPath(path || '');
            setAdminPathStatus('success');
            setAdminPathMessage(`已识别管理前缀 ${path || '/'} (${endpoint})`);
            return;
          }
        } catch {
          // ignore and keep probing
        }
      }
    }

    setAdminPathStatus('error');
    setAdminPathMessage('未识别管理前缀，请检查地址或权限');
  }, [baseUrl, token, authHeader, tokenPrefix]);

  const detectAuthByBaseUrl = useCallback((url: string) => {
    const lower = (url || '').toLowerCase();
    if (lower.includes('newapi') || lower.includes('oneapi') || lower.includes('one-api')) {
      return { header: 'Authorization', prefix: 'Bearer ' };
    }
    if (lower.includes('apikey') || lower.includes('api-key')) {
      return { header: 'X-API-Key', prefix: '' };
    }
    return { header: 'Authorization', prefix: 'Bearer ' };
  }, []);

  const getItemId = useCallback((item: any) => {
    const id = item?.id ?? item?._id ?? item?.key ?? item?.model ?? item?.name ?? item?.token ?? item?.uid;
    return id !== undefined && id !== null ? String(id) : '';
  }, []);

  const getItemName = useCallback((item: any) => {
    return item?.name || item?.label || item?.username || item?.email || item?.model || item?.title || '未命名';
  }, []);

  const getItemMeta = useCallback((item: any) => {
    const type = item?.type ?? item?.provider ?? item?.status ?? item?.enabled;
    const group = item?.group ?? item?.group_id;
    const parts = [type, group].filter(Boolean).map(String);
    return parts.join(' · ');
  }, []);

  const buildFieldsFromItem = useCallback((item: any, presetKey: string): EditField[] => {
    const defs = fieldPresets[presetKey] || [];
    return defs
      .map(def => {
        const candidates = [def.key, ...(def.aliases || [])];
        const actualKey = candidates.find(key => item?.[key] !== undefined);
        if (!actualKey) return null;
        const rawValue = item[actualKey];
        let value: string | number | boolean = '';
        if (def.type === 'array') {
          if (Array.isArray(rawValue)) value = rawValue.join(', ');
          else value = rawValue ? String(rawValue) : '';
        } else if (def.type === 'boolean') {
          value = Boolean(rawValue);
        } else if (def.type === 'number') {
          value = rawValue ?? '';
        } else {
          value = rawValue ?? '';
        }
        return { def, actualKey, value };
      })
      .filter((field): field is EditField => field !== null);
  }, [fieldPresets]);

  const updateEditingField = useCallback((index: number, value: string | number | boolean) => {
    setEditingFields(prev => prev.map((field, idx) => (idx === index ? { ...field, value } : field)));
  }, []);

  const buildPayloadFromFields = useCallback(() => {
    const base = editingItem ? { ...editingItem } : {};
    editingFields.forEach(field => {
      let value: any = field.value;
      if (field.def.type === 'number') {
        const numeric = Number(value);
        value = Number.isNaN(numeric) ? value : numeric;
      }
      if (field.def.type === 'boolean') {
        value = Boolean(value);
      }
      if (field.def.type === 'array') {
        if (Array.isArray(value)) {
          value = value;
        } else {
          value = String(value || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
        }
      }
      base[field.actualKey] = value;
    });
    return base;
  }, [editingFields, editingItem]);

  const extractList = useCallback((result: any) => {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.data?.data)) return result.data.data;
    if (Array.isArray(result?.items)) return result.items;
    return [];
  }, []);

  const setPreset = useCallback((presetPath: string, presetMethod: HttpMethod, presetBody?: object) => {
    setPath(presetPath);
    setMethod(presetMethod);
    setBody(presetBody ? JSON.stringify(presetBody, null, 2) : '');
  }, []);

  const handleLoadList = useCallback(async () => {
    setIsListLoading(true);
    setListError(null);
    try {
      const result = await newApiAdminRequest(config, listPath, 'GET');
      if (result && typeof result === 'object') {
        const anyResult = result as any;
        if (anyResult.success === false) {
          setListError(anyResult.message || '接口返回失败');
        }
      }
      const list = extractList(result);
      setResourceItems(list);
      setSelectedIds(new Set());
      if (list.length === 0) {
        setListError('未获取到列表数据，请检查管理 Token 与接口路径');
      }
      notify.success('加载完成', `已获取 ${list.length} 条记录`);
    } catch (err: any) {
      notify.error('加载失败', err.message || '无法获取列表数据');
      setListError(err.message || '无法获取列表数据');
    } finally {
      setIsListLoading(false);
    }
  }, [config, listPath, extractList]);

  const handleResourceChange = useCallback((nextKey: string) => {
    const preset = resourcePresets.find(p => p.key === nextKey);
    if (!preset) return;
    setResourceKey(nextKey);
    setListPath(preset.listPath);
    setUpdatePath(preset.updatePath || '');
    setDeletePath(preset.deletePath || '');
    setBatchPath(preset.deletePath || '');
    setBatchMethod(preset.deletePath ? 'DELETE' : 'POST');
    setSelectedIds(new Set());
    setResourceItems([]);
  }, [resourcePresets]);

  const handleSaveConfig = useCallback(() => {
    const detected = detectAuthByBaseUrl(baseUrl);
    const profileId = activeProfileId || `profile_${Date.now()}`;
    const state = saveNewApiAdminProfile({
      id: profileId,
      name: profileName || '默认连接',
      baseUrl,
      token,
      authHeader: authHeader || detected.header,
      tokenPrefix: tokenPrefix !== '' ? tokenPrefix : detected.prefix,
      adminPath
    });
    setProfiles(state.profiles);
    setActiveProfileId(state.activeProfileId);
    notify.success('已保存', 'New API 连接信息已更新');
    handleLoadList();
  }, [activeProfileId, profileName, baseUrl, token, authHeader, tokenPrefix, detectAuthByBaseUrl, handleLoadList]);

  const handleSaveAsNew = useCallback(() => {
    const detected = detectAuthByBaseUrl(baseUrl);
    const profileId = `profile_${Date.now()}`;
    const state = saveNewApiAdminProfile({
      id: profileId,
      name: profileName || '新连接',
      baseUrl,
      token,
      authHeader: authHeader || detected.header,
      tokenPrefix: tokenPrefix !== '' ? tokenPrefix : detected.prefix,
      adminPath
    });
    setProfiles(state.profiles);
    setActiveProfileId(state.activeProfileId);
    notify.success('已保存', '已创建新的连接配置');
    handleLoadList();
  }, [profileName, baseUrl, token, authHeader, tokenPrefix, adminPath, detectAuthByBaseUrl, handleLoadList]);

  const handleSelectProfile = useCallback((id: string) => {
    const state = setActiveNewApiAdminProfile(id);
    const active = state.profiles.find(p => p.id === id);
    if (!active) return;
    setActiveProfileId(id);
    setProfileName(active.name || '默认连接');
    setBaseUrl(active.baseUrl || '');
    setToken(active.token || '');
    setAuthHeader(active.authHeader || 'Authorization');
    setTokenPrefix(active.tokenPrefix || ((active.authHeader || 'Authorization') === 'Authorization' ? 'Bearer ' : ''));
    setAdminPath(active.adminPath || '/api');
  }, []);

  const handleDeleteProfile = useCallback(() => {
    if (!activeProfileId) return;
    const state = deleteNewApiAdminProfile(activeProfileId);
    setProfiles(state.profiles);
    const nextActive = state.activeProfileId;
    setActiveProfileId(nextActive);
    if (nextActive) {
      const active = state.profiles.find(p => p.id === nextActive);
      if (active) {
        setProfileName(active.name || '默认连接');
        setBaseUrl(active.baseUrl || '');
        setToken(active.token || '');
        setAuthHeader(active.authHeader || 'Authorization');
        setTokenPrefix(active.tokenPrefix || ((active.authHeader || 'Authorization') === 'Authorization' ? 'Bearer ' : ''));
      }
    } else {
      setProfileName('默认连接');
      setBaseUrl('');
      setToken('');
      setAuthHeader('Authorization');
      setTokenPrefix('Bearer ');
      setAdminPath('/api');
    }
  }, [activeProfileId]);

  const handleRequest = useCallback(async () => {
    setIsLoading(true);
    setResponseText('');
    try {
      const payload = body.trim() ? JSON.parse(body) : undefined;
      const result = await newApiAdminRequest(config, path, method, payload);
      setResponseText(JSON.stringify(result, null, 2));
    } catch (err: any) {
      setResponseText(err.message || '请求失败');
      notify.error('请求失败', err.message || '无法访问 New API 管理接口');
    } finally {
      setIsLoading(false);
    }
  }, [config, path, method, body]);

  const allSelected = resourceItems.length > 0 && selectedIds.size === resourceItems.length;

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    const ids = resourceItems
      .map(item => getItemId(item))
      .filter(Boolean);
    setSelectedIds(new Set(ids));
  }, [allSelected, resourceItems, getItemId]);

  const handleCopy = useCallback(async () => {
    if (!responseText) return;
    await navigator.clipboard.writeText(responseText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [responseText]);


  const openEditor = useCallback((item: any) => {
    const id = getItemId(item);
    setEditingItemId(id || null);
    setEditingItem(item);
    setEditingJson(JSON.stringify(item, null, 2));
    const fields = buildFieldsFromItem(item, resourceKey);
    setEditingFields(fields);
    setEditMode(fields.length > 0 ? 'form' : 'json');
    setShowEditor(true);
  }, [getItemId, buildFieldsFromItem, resourceKey]);

  const handleUpdateItem = useCallback(async () => {
    if (!updatePath) {
      notify.error('更新失败', '未配置更新接口路径');
      return;
    }
    try {
      const payload = editMode === 'form'
        ? buildPayloadFromFields()
        : JSON.parse(editingJson);
      const resolvedPath = updatePath.includes('{id}') && editingItemId
        ? updatePath.replace('{id}', editingItemId)
        : updatePath;
      await newApiAdminRequest(config, resolvedPath, 'PUT', payload);
      notify.success('更新成功', '已提交更新请求');
      setShowEditor(false);
      handleLoadList();
    } catch (err: any) {
      notify.error('更新失败', err.message || '请求失败');
    }
  }, [updatePath, editingJson, config, editingItemId, handleLoadList, editMode, buildPayloadFromFields]);

  const handleDeleteItem = useCallback(async (item: any) => {
    if (!deletePath) {
      notify.error('删除失败', '未配置删除接口路径');
      return;
    }
    const id = getItemId(item);
    if (!id) {
      notify.error('删除失败', '无法识别记录 ID');
      return;
    }
    try {
      const resolvedPath = deletePath.replace('{id}', id);
      await newApiAdminRequest(config, resolvedPath, 'DELETE');
      notify.success('删除成功', `已删除 ${id}`);
      handleLoadList();
    } catch (err: any) {
      notify.error('删除失败', err.message || '请求失败');
    }
  }, [deletePath, config, getItemId, handleLoadList]);

  const handleBatchAction = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!batchPath) {
      notify.error('批量操作失败', '请填写批量路径');
      return;
    }
    setIsLoading(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const resolvedPath = batchPath.includes('{id}') ? batchPath.replace('{id}', id) : batchPath;
        const resolvedBody = batchBody.trim()
          ? JSON.parse(batchBody.split('{id}').join(id))
          : undefined;
        await newApiAdminRequest(config, resolvedPath, batchMethod, resolvedBody);
      }
      notify.success('批量操作完成', `已处理 ${ids.length} 条记录`);
      handleLoadList();
    } catch (err: any) {
      notify.error('批量操作失败', err.message || '请求失败');
    } finally {
      setIsLoading(false);
    }
  }, [selectedIds, batchPath, batchBody, batchMethod, config, handleLoadList]);

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="连接配置"
        description="支持官方、自建与第三方实例，一键切换并智能识别鉴权"
        actions={
          <>
            <button
              onClick={handleSaveAsNew}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-tertiary)] text-zinc-200 hover:bg-white/5 flex items-center gap-1"
            >
              <Save size={14} /> 另存为新连接
            </button>
            <button
              onClick={handleSaveConfig}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 flex items-center gap-1"
            >
              <Save size={14} /> 保存连接
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">连接配置</label>
            <select
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white outline-none"
              value={activeProfileId || ''}
              onChange={(e) => handleSelectProfile(e.target.value)}
            >
              {profiles.length === 0 && <option value="">暂无连接</option>}
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.name || profile.baseUrl || '未命名'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">连接名称</label>
            <input
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500/60 outline-none"
              placeholder="自建 New API"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Base URL</label>
            <input
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none"
              placeholder="https://your-newapi-domain"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">管理员 Token</label>
            <input
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none"
              placeholder="Bearer Token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">鉴权 Header</label>
            <select
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white outline-none"
              value={authHeader}
              onChange={(e) => setAuthHeader(e.target.value)}
            >
              <option value="Authorization">Authorization</option>
              <option value="X-API-Key">X-API-Key</option>
              <option value="X-Token">X-Token</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Token 前缀</label>
            <input
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none"
              placeholder="Bearer "
              value={tokenPrefix}
              onChange={(e) => setTokenPrefix(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">管理 API 前缀</label>
            <div className="flex items-center gap-2 min-w-0">
              <input
                className="flex-1 min-w-0 bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none"
                placeholder="/api"
                value={adminPath}
                onChange={(e) => setAdminPath(e.target.value)}
              />
              <button
                onClick={detectAdminPath}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-tertiary)] text-zinc-300 hover:text-white hover:bg-white/5 shrink-0"
              >
                识别
              </button>
            </div>
            {adminPathStatus !== 'idle' && (
              <div className={`text-[10px] mt-1 ${adminPathStatus === 'success' ? 'text-emerald-400' : adminPathStatus === 'checking' ? 'text-zinc-400' : 'text-red-400'}`}>
                {adminPathStatus === 'checking' ? '正在检测...' : adminPathMessage}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPreset('/status', 'GET')}
            className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]"
          >
            测试系统状态
          </button>
          <button
            onClick={() => setPreset('/system/setup', 'GET')}
            className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]"
          >
            初始化状态
          </button>
          <button
            onClick={() => {
              const detected = detectAuthByBaseUrl(baseUrl);
              setAuthHeader(detected.header);
              setTokenPrefix(detected.prefix);
            }}
            className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]"
          >
            智能识别鉴权
          </button>
          <button
            onClick={handleDeleteProfile}
            disabled={!activeProfileId}
            className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-red-500/60 hover:text-red-400 disabled:opacity-40"
          >
            删除连接
          </button>
        </div>
      </Section>

      <Section
        title="资源列表"
        description="加载并直接编辑 New API 资源数据，支持批量操作"
        actions={
          <button
            onClick={handleLoadList}
            disabled={isListLoading}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-indigo-500 hover:bg-indigo-400 text-white flex items-center gap-1"
          >
            {isListLoading ? <RefreshCw size={14} className="animate-spin" /> : '刷新列表'}
          </button>
        }
      >
        {listError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {listError}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">资源类型</label>
            <select
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white outline-none"
              value={resourceKey}
              onChange={(e) => handleResourceChange(e.target.value)}
            >
              {resourcePresets.map(preset => (
                <option key={preset.key} value={preset.key}>{preset.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">列表路径</label>
            <input
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none"
              value={listPath}
              onChange={(e) => setListPath(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">更新路径</label>
            <input
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none"
              value={updatePath}
              onChange={(e) => setUpdatePath(e.target.value)}
              placeholder="/api/resource 或 /api/resource/{id}"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">删除路径</label>
            <input
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none"
              value={deletePath}
              onChange={(e) => {
                setDeletePath(e.target.value);
                setBatchPath(e.target.value);
              }}
              placeholder="/api/resource/{id}"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPreset('/channel', 'GET')} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">渠道列表</button>
          <button onClick={() => setPreset('/channel', 'POST', {})} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">添加渠道</button>
          <button onClick={() => setPreset('/channel', 'PUT', {})} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">更新渠道</button>
          <button onClick={() => setPreset('/model', 'GET')} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">模型列表</button>
          <button onClick={() => setPreset('/model', 'POST', {})} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">添加模型</button>
          <button onClick={() => setPreset('/model', 'PUT', {})} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">更新模型</button>
          <button onClick={() => setPreset('/token', 'GET')} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">令牌列表</button>
          <button onClick={() => setPreset('/user', 'GET')} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">用户列表</button>
          <button onClick={() => setPreset('/group', 'GET')} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">分组列表</button>
          <button onClick={() => setPreset('/vendor', 'GET')} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">供应商列表</button>
          <button onClick={() => setPreset('/statistics/data', 'GET')} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">数据统计</button>
          <button onClick={() => setPreset('/log', 'GET')} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-zinc-300 border border-[var(--border-light)] hover:border-[var(--border-medium)]">使用日志</button>
        </div>

        <div className="border border-[var(--border-light)] rounded-xl overflow-hidden">
          <div className="bg-[var(--bg-tertiary)] px-4 py-2 flex items-center justify-between">
            <div className="text-xs text-zinc-400">共 {resourceItems.length} 条</div>
            <button
              onClick={handleToggleAll}
              className="text-xs text-zinc-300 hover:text-white"
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-xs text-zinc-300">
              <thead className="bg-[var(--bg-tertiary)] text-zinc-500">
                <tr>
                  <th className="px-4 py-2 text-left">选择</th>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">名称</th>
                  <th className="px-4 py-2 text-left">备注</th>
                  <th className="px-4 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {resourceItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">暂无数据</td>
                  </tr>
                )}
                {resourceItems.map((item, index) => {
                  const id = getItemId(item) || `row-${index}`;
                  const name = getItemName(item);
                  const meta = getItemMeta(item);
                  const checked = selectedIds.has(id);
                  return (
                    <tr key={id} className="border-t border-[var(--border-light)] hover:bg-white/5">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleSelect(id)}
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px] text-zinc-400 truncate max-w-[160px]">{id}</td>
                      <td className="px-4 py-2 truncate max-w-[200px]">{name}</td>
                      <td className="px-4 py-2 truncate max-w-[200px] text-zinc-500">{meta || '-'}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditor(item)}
                            className="px-2 py-1 rounded bg-[var(--bg-tertiary)] text-zinc-300 hover:text-white"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item)}
                            className="px-2 py-1 rounded bg-[var(--bg-tertiary)] text-zinc-300 hover:text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr] gap-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">批量方法</label>
            <select
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white outline-none"
              value={batchMethod}
              onChange={(e) => setBatchMethod(e.target.value as HttpMethod)}
            >
              {['DELETE', 'POST', 'PUT', 'GET'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">批量路径（支持 {`{id}`}）</label>
            <input
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none"
              value={batchPath}
              onChange={(e) => setBatchPath(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleBatchAction}
              disabled={selectedIds.size === 0 || isLoading}
              className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black"
            >
              执行批量操作（{selectedIds.size}）
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">批量 Body (JSON，可用 {`{id}`} 占位)</label>
          <textarea
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500/60 outline-none min-h-[120px]"
            placeholder='{"id": "{id}"}'
            value={batchBody}
            onChange={(e) => setBatchBody(e.target.value)}
          />
        </div>
      </Section>

      <Section
        title="接口调试"
        description="手动发起管理接口请求，支持自定义方法和参数"
      >
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_140px] gap-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">方法</label>
            <select
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white outline-none"
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
            >
              {['GET', 'POST', 'PUT', 'DELETE'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">API Path</label>
            <input
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleRequest}
              disabled={isLoading}
              className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center gap-1"
            >
              {isLoading ? <RefreshCw size={14} className="animate-spin" /> : '发送请求'}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">请求 Body (JSON)</label>
          <textarea
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500/60 outline-none min-h-[140px]"
            placeholder='{"key": "value"}'
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-zinc-400">响应结果</label>
            <button
              onClick={handleCopy}
              disabled={!responseText}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <pre className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg p-3 text-xs text-zinc-200 font-mono max-h-[300px] overflow-auto whitespace-pre-wrap">
            {responseText || '暂无响应'}
          </pre>
        </div>
      </Section>

      {showEditor && (
        <div className="fixed inset-0 z-[10070] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] w-full max-w-3xl rounded-2xl border border-[var(--border-light)] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-light)]">
              <div>
                <h4 className="text-sm font-bold text-white">资源编辑</h4>
                <p className="text-xs text-zinc-500 mt-1">表单或 JSON 任选其一</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg p-0.5">
                  <button
                    onClick={() => setEditMode('form')}
                    className={`px-2 py-1 text-[10px] font-semibold rounded-md ${editMode === 'form' ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    表单
                  </button>
                  <button
                    onClick={() => setEditMode('json')}
                    className={`px-2 py-1 text-[10px] font-semibold rounded-md ${editMode === 'json' ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    JSON
                  </button>
                </div>
                <button onClick={() => setShowEditor(false)} className="text-zinc-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {editMode === 'form' ? (
                editingFields.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {editingFields.map((field, index) => (
                      <div key={`${field.actualKey}-${index}`}>
                        <label className="text-xs text-zinc-400 mb-1.5 block">{field.def.label}</label>
                        {field.def.type === 'textarea' ? (
                          <textarea
                            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500/60 outline-none min-h-[120px]"
                            value={String(field.value ?? '')}
                            onChange={(e) => updateEditingField(index, e.target.value)}
                          />
                        ) : field.def.type === 'boolean' ? (
                          <button
                            onClick={() => updateEditingField(index, !field.value)}
                            className={`w-full px-3 py-2 rounded-lg text-xs font-semibold border ${field.value ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-[var(--bg-tertiary)] text-zinc-400 border-[var(--border-light)]'}`}
                          >
                            {field.value ? '启用' : '禁用'}
                          </button>
                        ) : (
                          <input
                            type={field.def.type === 'number' ? 'number' : 'text'}
                            disabled={field.def.readonly}
                            className={`w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500/60 outline-none ${field.def.readonly ? 'opacity-60' : ''}`}
                            placeholder={field.def.type === 'array' ? '用逗号分隔' : ''}
                            value={String(field.value ?? '')}
                            onChange={(e) => updateEditingField(index, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">当前资源没有可识别字段，请使用 JSON 模式编辑。</div>
                )
              ) : (
                <textarea
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-indigo-500/60 outline-none min-h-[320px]"
                  value={editingJson}
                  onChange={(e) => setEditingJson(e.target.value)}
                />
              )}
            </div>
            <div className="p-4 border-t border-[var(--border-light)] flex justify-end gap-3">
              <button onClick={() => setShowEditor(false)} className="px-4 py-2 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-white/5">取消</button>
              <button onClick={handleUpdateItem} className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black">保存更新</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewApiAdminView;
