import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Key, Globe, RefreshCw, ChevronDown, Check, Wifi, WifiOff, User, ScrollText, Search, Server, Plus, Trash2, Monitor, Moon, Sun, Bot, Database, Keyboard, Palette } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useMode } from '../context/ModeContext';
import { useTheme } from '../context/ThemeContext';

import openclawLogo from '../assets/openclaw-color.png';
import TasteSkillDial from './TasteSkillDial';

const LOCAL_IMAGE_PATHS = {
    openclaw: openclawLogo,
};

function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const SUPERMEMORY_MODEL_PROVIDERS = [
    { id: 'openrouter', label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', needsKey: true },
    { id: 'openai', label: 'OpenAI', baseURL: 'https://api.openai.com/v1', needsKey: true },
    { id: 'anthropic', label: 'Anthropic', baseURL: 'https://api.anthropic.com/v1', needsKey: true },
    { id: 'mistral', label: 'Mistral', baseURL: 'https://api.mistral.ai/v1', needsKey: true },
    { id: 'groq', label: 'Groq', baseURL: 'https://api.groq.com/openai/v1', needsKey: true },
    { id: 'gemini', label: 'Gemini', baseURL: '', needsKey: true },
    { id: 'ollama', label: 'Ollama', baseURL: 'http://localhost:11434/v1', needsKey: false },
    { id: 'lmstudio', label: 'LM Studio', baseURL: 'http://localhost:1234/v1', needsKey: false },
    { id: 'jan', label: 'Jan', baseURL: 'http://localhost:1337/v1', needsKey: false },
];

function getSupermemoryProviderMeta(provider) {
    return SUPERMEMORY_MODEL_PROVIDERS.find(option => option.id === provider) || SUPERMEMORY_MODEL_PROVIDERS[0];
}

// Collapsible section wrapper
function Section({ title, icon: Icon, defaultOpen = true, children }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border-t border-[var(--border)] pt-4">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 text-left group mb-3"
            >
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    {Icon && <Icon size={15} className="text-[var(--accent)]" />}
                    {title}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-[var(--text-tertiary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && <div className="space-y-3">{children}</div>}
        </div>
    );
}

export function SettingsModal({ isOpen, onClose }) {
    const {
        apiKeys,
        updateApiKey,
        selectedProvider,
        selectedModel,
        updateProvider,
        updateModel,
        availableModels,
        addCustomModel,
        removeCustomModel,
        isLoadingModels,
        refreshModels,
        userName,
        setUserName,
        customInstructions,
        setCustomInstructions,
        lmStudioUrl,
        setLmStudioUrl,
        janUrl,
        setJanUrl,
        searchEngine,
        setSearchEngine,
        searxngUrl,
        setSearxngUrl
    } = useChat();
    const {
        openClawConfig,
        setOpenClawConfig,
        setShowOpenClawDashboard,
        cycleOrder,
        setCycleOrder,
        cycleScope,
        setCycleScope,
    } = useMode();
    const { themeMode, setThemeMode, resolvedTheme } = useTheme();

    const [modelSearch, setModelSearch] = useState('');
    const [customModelId, setCustomModelId] = useState('');
    const [customModelName, setCustomModelName] = useState('');
    const [editingName, setEditingName] = useState('');
    const [editingInstructions, setEditingInstructions] = useState('');
    const [testingProfileId, setTestingProfileId] = useState(null);
    const [connectionResults, setConnectionResults] = useState({});
    const [providerDiscovery, setProviderDiscovery] = useState(null);
    const [isDiscoveringProviders, setIsDiscoveringProviders] = useState(false);
    const [startingJanModel, setStartingJanModel] = useState(null);
    const [setupMessage, setSetupMessage] = useState('');

    // Local OpenClaw Gateway Config & Sandbox/Dreaming States
    const [localOpenClawConfig, setLocalOpenClawConfig] = useState(null);
    const [sandboxMode, setSandboxMode] = useState('off');
    const [dreamingEnabled, setDreamingEnabled] = useState(false);
    const [configLoadError, setConfigLoadError] = useState(null);
    const [configNeedsSave, setConfigNeedsSave] = useState(false);
    const [isRestartingGateway, setIsRestartingGateway] = useState(false);
    const [gatewayRestartStatus, setGatewayRestartStatus] = useState('');

    // G-Dash: the user's own Google OAuth client ID + secret (Bring-Your-Own).
    const [gdashClientId, setGdashClientId] = useState('');
    const [gdashClientSecret, setGdashClientSecret] = useState('');

    // Jules — Google cloud coding agent
    const [julesApiKey, setJulesApiKey] = useState('');

    // Memory backend — memU Docker stack or Supermemory binary.
    const [memoryBackend, setMemoryBackend] = useState('memu');
    const [supermemoryConfig, setSupermemoryConfig] = useState({
        enabled: false,
        provider: 'openrouter',
        providerKey: '',
        openrouterKey: '',
        modelBaseURL: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-sonnet-4',
        dataDir: '',
        containerTag: 'perci_memory',
        binaryPath: '',
        port: 6768,
    });
    const [supermemoryStatus, setSupermemoryStatus] = useState(null);
    const [memoryMessage, setMemoryMessage] = useState('');
    const [isWipingMemory, setIsWipingMemory] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setEditingName(userName || '');
            setEditingInstructions(customInstructions || '');
            setModelSearch('');

            // Load local openclaw config if in electron environment
            if (window.electron?.readOpenClawConfig) {
                const loadConfig = async () => {
                    try {
                        const config = await window.electron.readOpenClawConfig();
                        if (config && !config.error) {
                            setLocalOpenClawConfig(config);
                            setSandboxMode(config.agents?.defaults?.sandbox?.mode || 'off');
                            setDreamingEnabled(Boolean(config.plugins?.entries?.['memory-core']?.config?.dreaming?.enabled));
                            setConfigLoadError(null);
                        } else {
                            setConfigLoadError(config?.error || 'Failed to load local config');
                        }
                    } catch (err) {
                        setConfigLoadError(err.message);
                    }
                };
                loadConfig();
            }

            // Load the saved G-Dash client ID and secret (decrypted by the main process).
            if (window.electron?.getAppData) {
                window.electron.getAppData()
                    .then((data) => {
                        setGdashClientId(data?.gdash_google_client_id || '');
                        setGdashClientSecret(data?.gdash_google_client_secret || '');
                        setJulesApiKey(data?.jules_api_key || '');
                        const backend = data?.perci_memory_backend || (data?.perci_supermemory_enabled === 'true' ? 'supermemory' : 'memu');
                        setMemoryBackend(backend === 'supermemory' ? 'supermemory' : 'memu');
                    })
                    .catch(() => { /* leave fields blank */ });
            }
            if (window.electron?.supermemoryConfig) {
                window.electron.supermemoryConfig()
                    .then((config) => {
                        if (config && !config.error) {
                            setSupermemoryConfig(prev => ({
                                ...prev,
                                ...config,
                            }));
                        }
                    })
                    .catch(() => { /* leave defaults */ });
                window.electron.supermemoryStatus?.()
                    .then((status) => setSupermemoryStatus(status || null))
                    .catch(() => { /* leave unknown */ });
            }
        }
    }, [apiKeys.openrouter, isOpen, userName, customInstructions]);

    const saveGdashClientId = async () => {
        if (!window.electron?.setAppData) return;
        try {
            await window.electron.setAppData({ gdash_google_client_id: gdashClientId.trim() });
        } catch (err) {
            console.error('Failed to save G-Dash client ID:', err);
        }
    };

    const saveGdashClientSecret = async () => {
        if (!window.electron?.setAppData) return;
        try {
            await window.electron.setAppData({ gdash_google_client_secret: gdashClientSecret.trim() });
        } catch (err) {
            console.error('Failed to save G-Dash client secret:', err);
        }
    };

    const saveJulesApiKey = async () => {
        if (!window.electron?.setAppData) return;
        try {
            await window.electron.setAppData({ jules_api_key: julesApiKey.trim() });
        } catch (err) {
            console.error('Failed to save Jules API key:', err);
        }
    };

    const saveSupermemoryConfig = async (patch = {}) => {
        if (!window.electron?.supermemoryConfig) return;
        const next = { ...supermemoryConfig, ...patch };
        setSupermemoryConfig(next);
        try {
            const saved = await window.electron.supermemoryConfig(patch);
            if (saved && !saved.error) {
                setSupermemoryConfig(prev => ({ ...prev, ...saved }));
            } else if (saved?.error) {
                setMemoryMessage(saved.error);
            }
        } catch (err) {
            setMemoryMessage(err.message || 'Failed to save Supermemory settings.');
        }
    };

    const saveMemoryBackend = async (backend) => {
        setMemoryBackend(backend);
        if (!window.electron?.supermemoryConfig) return;
        try {
            const enabled = backend === 'supermemory';
            await window.electron.supermemoryConfig({ enabled });
            setSupermemoryConfig(prev => ({ ...prev, enabled }));
            window.dispatchEvent(new CustomEvent('perci-memory-backend-change', { detail: { backend } }));
            setMemoryMessage(enabled ? 'Supermemory selected as the active memory backend.' : 'memU Docker selected as the active memory backend.');
        } catch (err) {
            setMemoryMessage(err.message || 'Failed to save memory backend.');
        }
    };

    const refreshSupermemoryStatus = async () => {
        if (!window.electron?.supermemoryStatus) return;
        try {
            const status = await window.electron.supermemoryStatus();
            setSupermemoryStatus(status || null);
        } catch (err) {
            setMemoryMessage(err.message || 'Failed to refresh Supermemory status.');
        }
    };

    const wipeSupermemoryData = async () => {
        if (!window.electron?.supermemoryConfig) return;
        const ok = window.confirm(
            'This deletes the local Supermemory data directory and clears the saved Supermemory instance key. Export anything you need first. Continue?'
        );
        if (!ok) return;
        setIsWipingMemory(true);
        setMemoryMessage('');
        try {
            const result = await window.electron.supermemoryConfig({ action: 'wipe-data' });
            if (result?.ok) {
                setMemoryMessage('Supermemory data directory wiped.');
                setSupermemoryConfig(prev => ({ ...prev, apiKey: '' }));
                await refreshSupermemoryStatus();
            } else {
                setMemoryMessage(result?.error || 'Could not wipe Supermemory data.');
            }
        } catch (err) {
            setMemoryMessage(err.message || 'Could not wipe Supermemory data.');
        } finally {
            setIsWipingMemory(false);
        }
    };

    const saveLocalOpenClawConfig = async (config) => {
        if (!window.electron?.writeOpenClawConfig) return;
        try {
            const res = await window.electron.writeOpenClawConfig(config);
            if (res?.ok) {
                setConfigNeedsSave(true);
            }
        } catch (err) {
            console.error('Failed to write openclaw config:', err);
        }
    };

    const handleSandboxModeChange = async (e) => {
        const mode = e.target.value;
        setSandboxMode(mode);
        if (!localOpenClawConfig) return;

        const updatedConfig = {
            ...localOpenClawConfig,
            agents: {
                ...localOpenClawConfig.agents,
                defaults: {
                    ...localOpenClawConfig.agents?.defaults,
                    sandbox: {
                        ...localOpenClawConfig.agents?.defaults?.sandbox,
                        mode: mode
                    }
                }
            }
        };
        setLocalOpenClawConfig(updatedConfig);
        await saveLocalOpenClawConfig(updatedConfig);
    };

    const handleToggleDreaming = async () => {
        const enabled = !dreamingEnabled;
        setDreamingEnabled(enabled);
        if (!localOpenClawConfig) return;

        const updatedConfig = {
            ...localOpenClawConfig,
            plugins: {
                ...localOpenClawConfig.plugins,
                entries: {
                    ...localOpenClawConfig.plugins?.entries,
                    'memory-core': {
                        ...localOpenClawConfig.plugins?.entries?.['memory-core'],
                        config: {
                            ...localOpenClawConfig.plugins?.entries?.['memory-core']?.config,
                            dreaming: {
                                ...localOpenClawConfig.plugins?.entries?.['memory-core']?.config?.dreaming,
                                enabled: enabled
                            }
                        }
                    }
                }
            }
        };
        setLocalOpenClawConfig(updatedConfig);
        await saveLocalOpenClawConfig(updatedConfig);
    };

    const handleRestartGateway = async () => {
        if (isRestartingGateway) return;
        setIsRestartingGateway(true);
        setGatewayRestartStatus('Restarting...');
        try {
            const result = await window.electron.restartOpenClawGateway();
            if (result?.ok) {
                setGatewayRestartStatus('Gateway restarted!');
                setConfigNeedsSave(false);
                setTimeout(() => setGatewayRestartStatus(''), 3000);
            } else {
                setGatewayRestartStatus(`Failed: ${result?.error || 'Unknown error'}`);
            }
        } catch (err) {
            setGatewayRestartStatus(`Failed: ${err.message}`);
        } finally {
            setIsRestartingGateway(false);
        }
    };

    const loadProviderDiscovery = async () => {
        if (!window.electron?.discoverModelProviders) {
            setProviderDiscovery({
                generatedAt: Date.now(),
                providers: [
                    { id: 'ollama', name: 'Ollama', status: availableModels.ollama?.length ? 'ready' : 'offline', modelCount: availableModels.ollama?.length || 0, models: availableModels.ollama || [] },
                    { id: 'lmstudio', name: 'LM Studio', status: availableModels.lmstudio?.length ? 'ready' : 'offline', modelCount: availableModels.lmstudio?.length || 0, models: availableModels.lmstudio || [] },
                    { id: 'jan', name: 'Jan', status: availableModels.jan?.length ? 'ready' : 'offline', modelCount: availableModels.jan?.length || 0, models: availableModels.jan || [] },
                ]
            });
            return;
        }

        setIsDiscoveringProviders(true);
        try {
            const discovery = await window.electron.discoverModelProviders();
            setProviderDiscovery(discovery);
            const readyJan = discovery?.providers?.find(provider => provider.id === 'jan' && provider.status === 'ready' && provider.endpoint);
            if (readyJan?.endpoint) {
                setJanUrl(readyJan.endpoint);
            }
        } catch (err) {
            setSetupMessage(err.message || 'Could not check local providers.');
        } finally {
            setIsDiscoveringProviders(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadProviderDiscovery();
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const providers = [
        { id: 'openrouter', name: 'OpenRouter', needsKey: true, color: 'violet', badge: 'Recommended' },
        { id: 'anthropic',  name: 'Anthropic',  needsKey: true, color: 'amber'  },
        { id: 'mistral',    name: 'Mistral',    needsKey: true, color: 'sky'    },
        { id: 'groq',       name: 'Groq',       needsKey: true, color: 'orange' },
        { id: 'openai',     name: 'OpenAI',     needsKey: true, color: 'green'  },
        { id: 'gemini',     name: 'Gemini',     needsKey: true, color: 'blue'   },
        { id: 'ollama',     name: 'Ollama',     needsKey: false, color: 'purple', local: true },
        { id: 'lmstudio',  name: 'LM Studio',  needsKey: false, color: 'pink',   local: true },
        { id: 'jan',        name: 'Jan',        needsKey: false, color: 'teal',   local: true },
    ];

    const currentProviderModels = availableModels[selectedProvider] || [];
    const selectedModelObj = currentProviderModels.find(m => m.id === selectedModel);
    const supermemoryProviderMeta = getSupermemoryProviderMeta(supermemoryConfig.provider || 'openrouter');
    const hasSupermemoryProviderKey = Boolean(
        supermemoryConfig.providerKey ||
        apiKeys[supermemoryProviderMeta.id] ||
        supermemoryStatus?.hasProviderKey
    );
    const supermemoryProviderText = supermemoryProviderMeta.needsKey
        ? hasSupermemoryProviderKey
            ? `Supermemory uses the ${supermemoryProviderMeta.label} key already saved in Perci.`
            : `Add a ${supermemoryProviderMeta.label} key in Settings > Models before starting Supermemory.`
        : `Supermemory uses the local ${supermemoryProviderMeta.label} endpoint.`;

    const filteredModels = modelSearch.trim()
        ? currentProviderModels.filter(m =>
            m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
            m.id.toLowerCase().includes(modelSearch.toLowerCase())
          )
        : currentProviderModels;

    const selectedProviderMeta = providers.find(p => p.id === selectedProvider) || null;
    const discoveryById = (providerDiscovery?.providers || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
    }, {});
    const janDiscovery = discoveryById['jan'];

    const handleSaveName = () => {
        if (editingName.trim() !== userName) setUserName(editingName.trim());
    };

    const handleSaveInstructions = () => {
        if (editingInstructions !== customInstructions) setCustomInstructions(editingInstructions);
    };

    const handleClose = () => {
        handleSaveName();
        handleSaveInstructions();
        onClose();
    };

    const handleRefreshModelSetup = async () => {
        setSetupMessage('');
        refreshModels();
        await loadProviderDiscovery();
    };

    const handleAddCustomModel = () => {
        const id = customModelId.trim();
        if (!id || !selectedProvider) return;
        addCustomModel(selectedProvider, id, customModelName.trim());
        updateModel(id);
        setCustomModelId('');
        setCustomModelName('');
    };

    const handleStartJan = async (modelId) => {
        if (!window.electron?.startJanServer) return;
        setStartingJanModel(modelId || 'default');
        setSetupMessage('');
        try {
            const result = await window.electron.startJanServer({ modelId, port: 6767 });
            if (!result?.ok) {
                setSetupMessage(result?.error || 'Jan did not start.');
                return;
            }
            setSetupMessage(`Jan started ${result.modelId} on port ${result.port}.`);
            if (result.endpoint) {
                setJanUrl(result.endpoint);
            }
            await loadProviderDiscovery();
            refreshModels();
            updateProvider('jan');
        } catch (err) {
            setSetupMessage(err.message || 'Jan did not start.');
        } finally {
            setStartingJanModel(null);
        }
    };

    const updateOpenClawProfile = (profileId, patch) => {
        setOpenClawConfig(prev => ({
            ...prev,
            profiles: prev.profiles.map(profile => (
                profile.id === profileId ? { ...profile, ...patch } : profile
            ))
        }));
    };

    const addOpenClawProfile = () => {
        const id = `profile-${Date.now()}`;
        setOpenClawConfig(prev => ({
            activeProfileId: id,
            profiles: [
                ...prev.profiles,
                {
                    id,
                    name: 'New OpenClaw Gateway',
                    mode: 'appliance',
                    gatewayUrl: 'ws://clawbox.local:18789',
                    controlUrl: 'http://clawbox.local:18789/openclaw',
                    token: ''
                }
            ]
        }));
    };

    const removeOpenClawProfile = (profileId) => {
        setOpenClawConfig(prev => {
            if (prev.profiles.length <= 1) return prev;
            const profiles = prev.profiles.filter(profile => profile.id !== profileId);
            return {
                activeProfileId: prev.activeProfileId === profileId ? profiles[0].id : prev.activeProfileId,
                profiles
            };
        });
    };

    const testOpenClawProfile = async (profile) => {
        setTestingProfileId(profile.id);
        try {
            const result = window.electron?.testOpenClawConnection
                ? await window.electron.testOpenClawConnection(profile)
                : await fetch(profile.controlUrl, { method: 'GET' }).then(response => ({ ok: response.ok, status: response.status, url: profile.controlUrl }));
            setConnectionResults(prev => ({ ...prev, [profile.id]: result }));
        } catch (err) {
            setConnectionResults(prev => ({ ...prev, [profile.id]: { ok: false, error: err.message, url: profile.controlUrl } }));
        } finally {
            setTestingProfileId(null);
        }
    };

    const openOpenClawDashboard = (profile) => {
        setOpenClawConfig(prev => ({ ...prev, activeProfileId: profile.id }));
        setShowOpenClawDashboard(true);
        onClose();
    };

    return createPortal(
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]"
            onClick={handleClose}
        >
            <div
                className="bg-[var(--bg-primary)] w-full max-w-3xl rounded-2xl border border-[var(--border)] flex flex-col"
                style={{ maxHeight: '90vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex-shrink-0 px-6 py-5 border-b border-[var(--border)] bg-[var(--bg-secondary)] rounded-t-2xl flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Settings</h2>
                        <p className="text-sm text-[var(--text-tertiary)] mt-0.5">Manage your profile and preferences</p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-0">

                    {/* Profile */}
                    <Section title="Profile" icon={User} defaultOpen={true}>
                        <input
                            type="text"
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onBlur={handleSaveName}
                            onKeyDown={e => { if (e.key === 'Enter') { handleSaveName(); e.target.blur(); } }}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
                            placeholder="Enter your name..."
                        />
                        <p className="text-xs text-[var(--text-tertiary)]">
                            Used in greetings and referenced by AI models.
                        </p>
                    </Section>

                    <Section title="Appearance" icon={Monitor} defaultOpen={true}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                            {[
                                {
                                    id: 'system',
                                    label: 'System',
                                    description: `Follow your device automatically (${resolvedTheme})`,
                                    icon: Monitor,
                                },
                                {
                                    id: 'light',
                                    label: 'Light',
                                    description: 'Always use the light theme',
                                    icon: Sun,
                                },
                                {
                                    id: 'dark',
                                    label: 'Dark',
                                    description: 'Always use the dark theme',
                                    icon: Moon,
                                },
                            ].map(option => {
                                const Icon = option.icon;
                                const isSelected = themeMode === option.id;

                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setThemeMode(option.id)}
                                        className={`rounded-xl border p-3.5 text-left transition-colors ${
                                            isSelected
                                                ? 'border-[var(--accent)] bg-[var(--accent)]/6'
                                                : 'border-[var(--border)] bg-[var(--bg-tertiary)]/40 hover:bg-[var(--bg-hover)]'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Icon size={15} className={isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'} />
                                                    <span className="text-sm font-semibold text-[var(--text-primary)]">{option.label}</span>
                                                </div>
                                                <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
                                                    {option.description}
                                                </p>
                                            </div>
                                            {isSelected && (
                                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                                                    <Check size={12} />
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </Section>

                    {/* Window Switching */}
                    <Section title="Window Switcher" icon={Keyboard} defaultOpen={true}>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                    Cycling Order
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1.5">
                                    {[
                                        { id: 'dock', label: 'Dock Order', desc: 'Left to right' },
                                        { id: 'mru', label: 'Recently Focused', desc: 'Most recently used' }
                                    ].map(opt => {
                                        const isSelected = cycleOrder === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setCycleOrder(opt.id)}
                                                className={`rounded-xl border p-3.5 text-left transition-colors flex items-center justify-between ${
                                                    isSelected
                                                        ? 'border-[var(--accent)] bg-[var(--accent)]/6'
                                                        : 'border-[var(--border)] bg-[var(--bg-tertiary)]/40 hover:bg-[var(--bg-hover)]'
                                                }`}
                                            >
                                                <div>
                                                    <span className="text-sm font-semibold text-[var(--text-primary)]">{opt.label}</span>
                                                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">{opt.desc}</p>
                                                </div>
                                                {isSelected && (
                                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                                                        <Check size={12} />
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                    Cycling Scope
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1.5">
                                    {[
                                        { id: 'all', label: 'All Open Windows', desc: 'Cycle through all open windows' },
                                        { id: 'maximized', label: 'Only Maximized', desc: 'Ignore normal/minimized windows' }
                                    ].map(opt => {
                                        const isSelected = cycleScope === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setCycleScope(opt.id)}
                                                className={`rounded-xl border p-3.5 text-left transition-colors flex items-center justify-between ${
                                                    isSelected
                                                        ? 'border-[var(--accent)] bg-[var(--accent)]/6'
                                                        : 'border-[var(--border)] bg-[var(--bg-tertiary)]/40 hover:bg-[var(--bg-hover)]'
                                                }`}
                                            >
                                                <div>
                                                    <span className="text-sm font-semibold text-[var(--text-primary)]">{opt.label}</span>
                                                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">{opt.desc}</p>
                                                </div>
                                                {isSelected && (
                                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                                                        <Check size={12} />
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                                Use <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono text-[10px]">Ctrl + Tab</kbd> to cycle windows forward, and <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-mono text-[10px]">Ctrl + Shift + Tab</kbd> to cycle backward.
                            </p>
                        </div>
                    </Section>

                    {/* Custom Instructions */}
                    <Section title="Custom Instructions" icon={ScrollText} defaultOpen={false}>
                        <textarea
                            value={editingInstructions}
                            onChange={e => setEditingInstructions(e.target.value)}
                            onBlur={handleSaveInstructions}
                            className="min-h-[120px] w-full resize-y px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] leading-relaxed text-sm"
                            placeholder="Tell Perci how to respond, what to prioritize, what to avoid..."
                        />
                        <p className="text-xs text-[var(--text-tertiary)]">
                            Reviewed before every response. Saved locally.
                        </p>
                    </Section>

                    {/* Search Settings */}
                    <Section title="Search Settings" icon={Search} defaultOpen={false}>
                        <div>
                            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                Search Engine
                            </label>
                            <select
                                value={searchEngine}
                                onChange={e => setSearchEngine(e.target.value)}
                                className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all text-[var(--text-primary)] text-sm"
                            >
                                <option value="ddg">DuckDuckGo Scraper</option>
                                <option value="searxng">SearxNG</option>
                            </select>
                        </div>
                        {searchEngine === 'searxng' && (
                            <div className="mt-3">
                                <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                    SearxNG API URL
                                </label>
                                <input
                                    type="text"
                                    value={searxngUrl}
                                    onChange={e => setSearxngUrl(e.target.value)}
                                    className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] text-sm"
                                    placeholder="e.g. https://searxng.example.com"
                                    spellCheck={false}
                                    autoComplete="off"
                                />
                            </div>
                        )}
                    </Section>

                    {/* G-Dash — Google account (Bring-Your-Own OAuth client) */}
                    {window.electron && (
                        <Section title="Google · G-Dash" icon={Key} defaultOpen={false}>
                            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                Desktop OAuth client ID
                            </label>
                            <input
                                type="text"
                                value={gdashClientId}
                                onChange={e => setGdashClientId(e.target.value)}
                                onBlur={saveGdashClientId}
                                onKeyDown={e => { if (e.key === 'Enter') { saveGdashClientId(); e.target.blur(); } }}
                                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] text-sm"
                                placeholder="xxxxxxxx.apps.googleusercontent.com"
                                spellCheck={false}
                                autoComplete="off"
                            />
                            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                Desktop OAuth client secret
                            </label>
                            <input
                                type="password"
                                value={gdashClientSecret}
                                onChange={e => setGdashClientSecret(e.target.value)}
                                onBlur={saveGdashClientSecret}
                                onKeyDown={e => { if (e.key === 'Enter') { saveGdashClientSecret(); e.target.blur(); } }}
                                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] text-sm"
                                placeholder="XXXXXXXXXXXXXXXXXXXXXXXX"
                                spellCheck={false}
                                autoComplete="off"
                            />
                            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                                G-Dash connects with <strong>your own</strong> Google credentials — nothing is shared.
                                In{' '}
                                <button
                                    type="button"
                                    onClick={() => window.electron?.openExternal?.('https://console.cloud.google.com/apis/credentials')}
                                    className="text-[var(--accent)] hover:underline"
                                >
                                    Google Cloud Console
                                </button>
                                {' '}create an OAuth client of type <strong>Desktop app</strong>, enable the Drive, Gmail,
                                Calendar and Tasks APIs, then paste the client ID and client secret here. Both
                                are stored encrypted on this device.
                            </p>
                            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)]/60 px-3 py-2.5">
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                    <strong className="text-[var(--text-primary)]">First time?</strong> After creating the client ID and secret, go to{' '}
                                    <button
                                        type="button"
                                        onClick={() => window.electron?.openExternal?.('https://console.cloud.google.com/apis/consent')}
                                        className="text-[var(--accent)] hover:underline"
                                    >
                                        OAuth consent screen
                                    </button>
                                    {' '}→ <strong>Test users</strong> → <strong>Add users</strong>, and add your own Google email.
                                    Without this step you'll get a "has not completed the Google verification process" error when
                                    signing in. This is normal — each user of this open-source app creates their own Google Cloud
                                    project and adds themselves as a test user.
                                </p>
                            </div>
                        </Section>
                    )}

                    {/* Jules — Google cloud coding agent */}
                    {window.electron && (
                        <Section title="Jules · Cloud Agent" icon={Bot} defaultOpen={false}>
                            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                Jules API Key
                            </label>
                            <input
                                type="password"
                                value={julesApiKey}
                                onChange={e => setJulesApiKey(e.target.value)}
                                onBlur={saveJulesApiKey}
                                onKeyDown={e => { if (e.key === 'Enter') { saveJulesApiKey(); e.target.blur(); } }}
                                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] text-sm"
                                placeholder="Get your key at jules.google.com"
                                spellCheck={false}
                                autoComplete="off"
                            />
                            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                                Jules is a cloud-based AI coding agent from Google Labs. It runs
                                autonomously in a Google VM, analyzes your repo, and opens a PR.
                                Requires a GitHub repo and an API key from{' '}
                                <button
                                    type="button"
                                    onClick={() => window.electron?.openExternal?.('https://jules.google.com')}
                                    className="text-[var(--accent)] hover:underline"
                                >
                                    jules.google.com
                                </button>.
                            </p>
                        </Section>
                    )}

                    {window.electron && (
                        <Section title="Memory Backend" icon={Database} defaultOpen={false}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {[
                                    {
                                        id: 'memu',
                                        label: 'memU Docker',
                                        detail: 'memU Docker stack',
                                    },
                                    {
                                        id: 'supermemory',
                                        label: 'Supermemory',
                                        detail: 'Local binary on port 6768',
                                    },
                                ].map(option => {
                                    const selected = memoryBackend === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => saveMemoryBackend(option.id)}
                                            className={`rounded-xl border p-3.5 text-left transition-colors ${
                                                selected
                                                    ? 'border-[var(--accent)] bg-[var(--accent)]/6'
                                                    : 'border-[var(--border)] bg-[var(--bg-tertiary)]/40 hover:bg-[var(--bg-hover)]'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-[var(--text-primary)]">{option.label}</div>
                                                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">{option.detail}</p>
                                                </div>
                                                {selected && (
                                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                                                        <Check size={12} />
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/30 p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Local Supermemory server</h4>
                                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                                            {supermemoryStatus?.binaryFound
                                                ? `${supermemoryStatus.version || 'Installed'} · ${supermemoryStatus.binaryPath || supermemoryConfig.binaryPath || 'Auto-detected'}`
                                                : 'supermemory-server not found'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={refreshSupermemoryStatus}
                                        className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                                    >
                                        <RefreshCw size={13} />
                                        Refresh
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 md:col-span-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Provider key</span>
                                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                            {supermemoryProviderText}
                                        </p>
                                        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                                            No separate provider key is stored here. The local Supermemory instance key is generated by the binary and stored automatically.
                                        </p>
                                    </div>
                                    <label className="space-y-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Model provider</span>
                                        <select
                                            value={supermemoryConfig.provider || 'openrouter'}
                                            onChange={(e) => {
                                                const nextProvider = e.target.value;
                                                const nextProviderMeta = getSupermemoryProviderMeta(nextProvider);
                                                const patch = {
                                                    provider: nextProvider,
                                                    modelBaseURL: nextProviderMeta.baseURL || supermemoryConfig.modelBaseURL || '',
                                                };
                                                setSupermemoryConfig(prev => ({ ...prev, ...patch }));
                                                saveSupermemoryConfig(patch);
                                            }}
                                            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                        >
                                            {SUPERMEMORY_MODEL_PROVIDERS.map(option => (
                                                <option key={option.id} value={option.id}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Model ID</span>
                                        <input
                                            value={supermemoryConfig.model || ''}
                                            onChange={e => setSupermemoryConfig(prev => ({ ...prev, model: e.target.value }))}
                                            onBlur={() => saveSupermemoryConfig({ model: supermemoryConfig.model || 'anthropic/claude-sonnet-4' })}
                                            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                            placeholder="anthropic/claude-sonnet-4"
                                            spellCheck={false}
                                        />
                                    </label>
                                    <label className="space-y-1 md:col-span-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Model API base URL</span>
                                        <input
                                            value={supermemoryConfig.modelBaseURL || ''}
                                            onChange={e => setSupermemoryConfig(prev => ({ ...prev, modelBaseURL: e.target.value }))}
                                            onBlur={() => saveSupermemoryConfig({ modelBaseURL: supermemoryConfig.modelBaseURL || supermemoryProviderMeta.baseURL || '' })}
                                            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                            placeholder={supermemoryProviderMeta.baseURL || 'Provider endpoint'}
                                            spellCheck={false}
                                        />
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Data directory</span>
                                        <input
                                            value={supermemoryConfig.dataDir || ''}
                                            onChange={e => setSupermemoryConfig(prev => ({ ...prev, dataDir: e.target.value }))}
                                            onBlur={() => saveSupermemoryConfig({ dataDir: supermemoryConfig.dataDir || '' })}
                                            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                            spellCheck={false}
                                        />
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Port</span>
                                        <input
                                            type="number"
                                            min="1024"
                                            max="65535"
                                            value={supermemoryConfig.port || 6768}
                                            onChange={e => setSupermemoryConfig(prev => ({ ...prev, port: e.target.value }))}
                                            onBlur={() => saveSupermemoryConfig({ port: supermemoryConfig.port || 6768 })}
                                            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                            spellCheck={false}
                                        />
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Container tag</span>
                                        <input
                                            value={supermemoryConfig.containerTag || ''}
                                            onChange={e => setSupermemoryConfig(prev => ({ ...prev, containerTag: e.target.value }))}
                                            onBlur={() => saveSupermemoryConfig({ containerTag: supermemoryConfig.containerTag || 'perci_memory' })}
                                            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                            placeholder="perci_memory"
                                            spellCheck={false}
                                        />
                                    </label>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5">
                                    <div className="text-xs text-[var(--text-secondary)]">
                                        <span className={supermemoryStatus?.running ? 'text-emerald-500' : supermemoryStatus?.state === 'port-conflict' ? 'text-red-400' : 'text-[var(--text-tertiary)]'}>
                                            {supermemoryStatus?.running ? 'Running' : supermemoryStatus?.state === 'port-conflict' ? 'Port conflict' : 'Stopped'}
                                        </span>
                                        {supermemoryStatus?.port && (
                                            <span className="text-[var(--text-tertiary)]"> · port {supermemoryStatus.port}</span>
                                        )}
                                        {supermemoryStatus?.dataDir && (
                                            <span className="text-[var(--text-tertiary)]"> · {supermemoryStatus.dataDir}</span>
                                        )}
                                        {supermemoryStatus?.dataDirSize && (
                                            <span className="text-[var(--text-tertiary)]">
                                                {' '}· {formatBytes(supermemoryStatus.dataDirSize.bytes)}
                                                {supermemoryStatus.dataDirSize.truncated ? '+' : ''}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={wipeSupermemoryData}
                                        disabled={isWipingMemory}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                                    >
                                        <Trash2 size={13} />
                                        Wipe all memories
                                    </button>
                                </div>
                                {memoryMessage && (
                                    <p className="text-xs text-[var(--text-secondary)]">{memoryMessage}</p>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* Models — providers, keys, model list & custom models in one place */}
                    <Section title="Models" icon={Server} defaultOpen={true}>
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                                Pick a provider, add its key (or connect a local server), then choose a model.
                                Not seeing your model? Add it by id at the bottom.
                            </p>
                            <button
                                type="button"
                                onClick={handleRefreshModelSetup}
                                disabled={isDiscoveringProviders || isLoadingModels}
                                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
                            >
                                <RefreshCw size={13} className={isDiscoveringProviders || isLoadingModels ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>
                        {setupMessage && (
                            <p className="text-xs text-[var(--accent)]">{setupMessage}</p>
                        )}

                        {/* Provider grid — single, always selectable */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                            {providers.map(provider => {
                                const models = availableModels[provider.id] || [];
                                const hasKey = !provider.needsKey || Boolean(apiKeys[provider.id]);
                                const isAvailable = provider.needsKey ? hasKey : models.length > 0;
                                const isSelected = selectedProvider === provider.id;
                                const statusText = provider.needsKey
                                    ? (hasKey ? (models.length ? `${models.length} models` : 'Key set') : 'Needs key')
                                    : (models.length ? `${models.length} models` : 'Offline');
                                return (
                                    <button
                                        key={provider.id}
                                        type="button"
                                        onClick={() => updateProvider(provider.id)}
                                        className={`p-3 rounded-lg border text-left transition-colors relative ${
                                            isSelected
                                                ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                                                : 'border-[var(--border)] hover:border-[var(--accent)]/30'
                                        }`}
                                    >
                                        {provider.badge && (
                                            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold tracking-wide uppercase text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                                {provider.badge}
                                            </span>
                                        )}
                                        <div className="flex items-center gap-2">
                                            {provider.local
                                                ? (isAvailable ? <Wifi size={15} className={`text-${provider.color}-500`} /> : <WifiOff size={15} className="text-gray-500" />)
                                                : <Globe size={15} className={isAvailable ? `text-${provider.color}-500` : 'text-gray-500'} />
                                            }
                                            <span className="font-medium text-sm text-[var(--text-primary)] truncate">{provider.name}</span>
                                            {isSelected && (
                                                <Check size={13} className="ml-auto flex-shrink-0 text-[var(--accent)]" />
                                            )}
                                        </div>
                                        <div className={`mt-1.5 text-xs ${isAvailable ? 'text-emerald-500' : 'text-[var(--text-tertiary)]'}`}>
                                            {statusText}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Selected provider: key / local server config, model list, custom models */}
                        {selectedProviderMeta && (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/30 p-4 space-y-4">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-[var(--text-primary)]">{selectedProviderMeta.name}</span>
                                </div>

                                {/* Hosted provider: API key */}
                                {selectedProviderMeta.needsKey && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                            {selectedProviderMeta.name} API key
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="password"
                                                value={apiKeys[selectedProvider] || ''}
                                                onChange={e => updateApiKey(selectedProvider, e.target.value)}
                                                className={`w-full px-4 py-2.5 rounded-xl border transition-all outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] ${
                                                    apiKeys[selectedProvider]
                                                        ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5 focus:ring-2 ring-[var(--accent)]'
                                                        : 'border-[var(--border)] bg-[var(--bg-primary)] focus:ring-2 ring-[var(--accent)]'
                                                }`}
                                                placeholder={`${selectedProviderMeta.name} API key`}
                                            />
                                            {apiKeys[selectedProvider] && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400" title="Key set" />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* LM Studio config */}
                                {selectedProvider === 'lmstudio' && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Base URL (Local API Server)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={lmStudioUrl}
                                                onChange={e => setLmStudioUrl(e.target.value)}
                                                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                                                placeholder="http://localhost:1234"
                                            />
                                            <button
                                                onClick={refreshModels}
                                                className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg text-xs font-medium text-[var(--text-secondary)] transition-colors"
                                            >
                                                Connect
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-[var(--text-tertiary)]">
                                            Use http://localhost:1234 when LM Studio is running on this Mac.
                                        </p>
                                    </div>
                                )}

                                {/* Jan config */}
                                {selectedProvider === 'jan' && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Base URL (Local API Server)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={janUrl}
                                                onChange={e => setJanUrl(e.target.value)}
                                                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                                                placeholder="http://127.0.0.1:6767"
                                            />
                                            {janDiscovery?.status === 'installed-stopped' && janDiscovery?.models?.length > 0 ? (
                                                <button
                                                    onClick={() => handleStartJan(janDiscovery.models[0]?.id)}
                                                    disabled={Boolean(startingJanModel)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                                                >
                                                    <RefreshCw size={13} className={startingJanModel ? 'animate-spin' : ''} />
                                                    Start Jan
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={handleRefreshModelSetup}
                                                    className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg text-xs font-medium text-[var(--text-secondary)] transition-colors"
                                                >
                                                    Connect
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Ollama hint */}
                                {selectedProvider === 'ollama' && currentProviderModels.length === 0 && (
                                    <p className="text-xs text-[var(--text-tertiary)]">
                                        Start Ollama on this machine, then hit Refresh to load its models.
                                    </p>
                                )}

                                {/* Model list */}
                                {currentProviderModels.length > 0 ? (
                                    <div className="space-y-2">
                                        {currentProviderModels.length > 8 && (
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                                <input
                                                    type="text"
                                                    value={modelSearch}
                                                    onChange={e => setModelSearch(e.target.value)}
                                                    placeholder={`Search ${currentProviderModels.length} models...`}
                                                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                                                />
                                            </div>
                                        )}

                                        {selectedModelObj && (
                                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                                                <Check size={14} className="text-[var(--accent)] flex-shrink-0" />
                                                <span className="text-sm font-medium text-[var(--text-primary)] truncate">{selectedModelObj.name}</span>
                                                {selectedModelObj.contextWindow && (
                                                    <span className="ml-auto flex-shrink-0 text-xs text-[var(--text-tertiary)]">
                                                        {(selectedModelObj.contextWindow / 1000).toFixed(0)}K ctx
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className="border border-[var(--border)] rounded-xl overflow-hidden" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                            {filteredModels.length === 0 ? (
                                                <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
                                                    No models match "{modelSearch}"
                                                </div>
                                            ) : filteredModels.map(model => (
                                                <div
                                                    key={model.id}
                                                    className={`flex items-center transition-colors hover:bg-[var(--bg-hover)] ${
                                                        model.id === selectedModel ? 'bg-[var(--accent)]/8' : ''
                                                    }`}
                                                >
                                                    <button
                                                        onClick={() => updateModel(model.id)}
                                                        className="flex-1 min-w-0 px-4 py-2.5 text-left flex items-center justify-between gap-3"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-[var(--text-primary)] truncate flex items-center gap-1.5">
                                                                {model.name}
                                                                {model.custom && (
                                                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded-full">Custom</span>
                                                                )}
                                                            </div>
                                                            {model.contextWindow && (
                                                                <div className="text-xs text-[var(--text-tertiary)]">
                                                                    {(model.contextWindow / 1000).toFixed(0)}K tokens
                                                                </div>
                                                            )}
                                                        </div>
                                                        {model.id === selectedModel && (
                                                            <Check size={15} className="flex-shrink-0 text-[var(--accent)]" />
                                                        )}
                                                    </button>
                                                    {model.custom && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeCustomModel(selectedProvider, model.id)}
                                                            title="Remove custom model"
                                                            className="px-3 py-2.5 text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="px-4 py-6 rounded-xl border border-dashed border-[var(--border)] text-center">
                                        <p className="text-sm text-[var(--text-secondary)]">
                                            {selectedProviderMeta.needsKey
                                                ? 'Add an API key above to load models — or add one manually below.'
                                                : 'No models found yet — start the server and Refresh, or add one manually below.'}
                                        </p>
                                    </div>
                                )}

                                {/* Add custom model */}
                                <div className="pt-3 border-t border-[var(--border)] space-y-2">
                                    <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Add a model manually</label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            value={customModelId}
                                            onChange={e => setCustomModelId(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleAddCustomModel(); }}
                                            placeholder="model id (e.g. claude-opus-4-8)"
                                            className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                                        />
                                        <input
                                            type="text"
                                            value={customModelName}
                                            onChange={e => setCustomModelName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleAddCustomModel(); }}
                                            placeholder="Display name (optional)"
                                            className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddCustomModel}
                                            disabled={!customModelId.trim()}
                                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                                        >
                                            <Plus size={14} />
                                            Add
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-tertiary)]">
                                        Adds the model id to {selectedProviderMeta.name} and selects it. Use this for models your provider supports that aren't auto-listed.
                                    </p>
                                </div>
                            </div>
                        )}
                    </Section>

                    {/* GitHub access token (not a model provider) */}
                    <Section title="GitHub" icon={Key} defaultOpen={false}>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                GitHub Token
                            </label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={apiKeys.github || ''}
                                    onChange={e => updateApiKey('github', e.target.value)}
                                    className={`w-full px-4 py-2.5 rounded-xl border transition-all outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] ${
                                        apiKeys.github
                                            ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5 focus:ring-2 ring-[var(--accent)]'
                                            : 'border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)]'
                                    }`}
                                    placeholder="GitHub personal access token"
                                />
                                {apiKeys.github && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400" title="Token set" />
                                )}
                            </div>
                            <p className="text-[10px] text-[var(--text-tertiary)]">Used for GitHub integrations, not for model access.</p>
                        </div>
                    </Section>

                    <Section title="OpenClaw" icon={Server} defaultOpen={false}>
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                                Configure local and appliance Gateway profiles for OpenClaw client/controller mode.
                            </p>
                            <button
                                type="button"
                                onClick={addOpenClawProfile}
                                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                                <Plus size={13} />
                                Add
                            </button>
                        </div>

                        <div className="space-y-3">
                            {openClawConfig.profiles.map(profile => {
                                const result = connectionResults[profile.id];
                                const isActive = openClawConfig.activeProfileId === profile.id;
                                return (
                                    <div key={profile.id} className={`rounded-xl border p-3.5 space-y-3 ${isActive ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--bg-tertiary)]/40'}`}>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setOpenClawConfig(prev => ({ ...prev, activeProfileId: profile.id }))}
                                                className={`w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border)]'}`}
                                                title="Use this OpenClaw profile"
                                            >
                                                {isActive && <Check size={10} className="text-white" />}
                                            </button>
                                            <input
                                                value={profile.name}
                                                onChange={e => updateOpenClawProfile(profile.id, { name: e.target.value })}
                                                className="flex-1 bg-transparent border-none outline-none text-sm font-semibold text-[var(--text-primary)]"
                                            />
                                            <select
                                                value={profile.mode}
                                                onChange={e => updateOpenClawProfile(profile.id, { mode: e.target.value })}
                                                className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-xs text-[var(--text-secondary)] outline-none"
                                            >
                                                <option value="local">Local</option>
                                                <option value="appliance">Appliance</option>
                                            </select>
                                            {openClawConfig.profiles.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeOpenClawProfile(profile.id)}
                                                    className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                    title="Remove profile"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                            <label className="space-y-1">
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Gateway URL</span>
                                                <input
                                                    value={profile.gatewayUrl}
                                                    onChange={e => updateOpenClawProfile(profile.id, { gatewayUrl: e.target.value })}
                                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                                />
                                            </label>
                                            <label className="space-y-1">
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Dashboard URL</span>
                                                <input
                                                    value={profile.controlUrl}
                                                    onChange={e => updateOpenClawProfile(profile.id, { controlUrl: e.target.value })}
                                                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                                />
                                            </label>
                                        </div>

                                        <label className="block space-y-1">
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Gateway Token</span>
                                            <input
                                                type="password"
                                                value={profile.token}
                                                onChange={e => updateOpenClawProfile(profile.id, { token: e.target.value })}
                                                placeholder="Optional token"
                                                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                            />
                                        </label>

                                        <div className="flex items-center justify-between gap-3">
                                            <div className={`text-xs ${result?.ok ? 'text-emerald-500' : result ? 'text-red-400' : 'text-[var(--text-tertiary)]'}`}>
                                                {result
                                                    ? result.ok
                                                        ? `Connected${result.status ? ` (${result.status})` : ''}${result.latencyMs ? ` in ${result.latencyMs}ms` : ''}`
                                                        : `Unavailable${result.error ? `: ${result.error}` : result.status ? ` (${result.status})` : ''}`
                                                    : 'Not tested'
                                                }
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => testOpenClawProfile(profile)}
                                                    disabled={testingProfileId === profile.id}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
                                                >
                                                    <RefreshCw size={13} className={testingProfileId === profile.id ? 'animate-spin' : ''} />
                                                    Test
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openOpenClawDashboard(profile)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
                                                >
                                                    <img src={LOCAL_IMAGE_PATHS.openclaw} alt="OpenClaw Logo" className="w-4 h-4" />
                                                    Open
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Local Gateway Sandbox & Dreaming Toggles */}
                        {localOpenClawConfig && (
                            <div className="mt-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/20 space-y-4 text-left">
                                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Local Gateway Settings</h4>
                                        <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Configure Watson's sandbox and dreaming features.</p>
                                    </div>
                                    {configNeedsSave && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-[var(--accent)] font-medium">
                                                {gatewayRestartStatus || 'Restart required'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleRestartGateway}
                                                disabled={isRestartingGateway}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                                            >
                                                <RefreshCw size={11} className={isRestartingGateway ? 'animate-spin' : ''} />
                                                Restart
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <span className="text-xs font-semibold text-[var(--text-primary)]">OpenShell Sandbox</span>
                                        <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Wrap agent tools in a secure isolated environment.</p>
                                    </div>
                                    <select
                                        value={sandboxMode}
                                        onChange={handleSandboxModeChange}
                                        className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-xs text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] transition-colors"
                                    >
                                        <option value="off">Disabled (Host Mode)</option>
                                        <option value="non-main">Subagents Only</option>
                                        <option value="all">Enabled (All Operations)</option>
                                    </select>
                                </div>

                                <div className="flex items-center justify-between gap-4 pt-1">
                                    <div>
                                        <span className="text-xs font-semibold text-[var(--text-primary)]">Dreaming Mode</span>
                                        <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Let Watson preemptively research and draft tasks in the background.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleToggleDreaming}
                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${dreamingEnabled ? 'bg-[var(--accent)]' : 'bg-gray-200 dark:bg-gray-700'}`}
                                    >
                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${dreamingEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </Section>

                    <Section title="Design Taste" icon={Palette} defaultOpen={false}>
                        <TasteSkillDial onApply={(config) => {
                            console.log('Taste skill config:', config);
                        }} />
                    </Section>

                    {/* Bottom padding */}
                    <div className="h-4" />
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-[var(--border)] flex justify-end rounded-b-2xl">
                    <button
                        onClick={handleClose}
                        className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors text-sm"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
