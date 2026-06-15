import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ModelService, getModelCapabilities } from '../lib/llm/ModelService';
import {
    API_KEY_STORAGE_KEYS,
    clearLocalApiKeys,
    getLocalApiKeySnapshot,
    getLocalPersistenceSnapshot,
    hasElectronStore,
    hasPersistedUserData,
    loadElectronPersistence,
    readJsonStorage,
    readStringStorage,
    saveElectronPersistence,
    serializeJson,
    writeLocalPersistenceSnapshot
} from '../lib/persistentStore';
import { normalizeAssistantSpacing } from '../lib/textFormatting';
import { fetchWeather, fetchWeatherForLocale } from '../lib/weatherService';

const modelService = new ModelService();
const ChatContext = createContext();
const DEFAULT_LM_STUDIO_URL = 'http://localhost:1234';
const DEFAULT_JAN_URL = 'http://127.0.0.1:6767';
const LEGACY_LM_STUDIO_URL = 'http://172.20.10.10:1234';
const API_KEY_PROVIDERS = API_KEY_STORAGE_KEYS.reduce((providers, storageKey) => {
    providers[storageKey.replace(/_key$/, '')] = storageKey;
    return providers;
}, {});

function normalizeLocalServerUrl(url, fallback = DEFAULT_LM_STUDIO_URL) {
    const trimmedUrl = typeof url === 'string' ? url.trim() : '';
    if (!trimmedUrl || trimmedUrl === LEGACY_LM_STUDIO_URL) return fallback;
    if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
        return trimmedUrl.replace(/\/$/, '');
    }
    return `http://${trimmedUrl.replace(/\/$/, '')}`;
}

function readApiKeysFromStorage() {
    return Object.entries(API_KEY_PROVIDERS).reduce((keys, [provider, storageKey]) => {
        keys[provider] = localStorage.getItem(storageKey) || '';
        return keys;
    }, {});
}

function readApiKeysFromSnapshot(snapshot = {}, fallbackSnapshot = {}) {
    return Object.entries(API_KEY_PROVIDERS).reduce((keys, [provider, storageKey]) => {
        keys[provider] = snapshot[storageKey] || fallbackSnapshot[storageKey] || '';
        return keys;
    }, {});
}

function apiKeysToStorageSnapshot(keys) {
    return Object.entries(API_KEY_PROVIDERS).reduce((snapshot, [provider, storageKey]) => {
        snapshot[storageKey] = keys?.[provider] || '';
        return snapshot;
    }, {});
}

function nonEmptyApiKeysToStorageSnapshot(keys) {
    return Object.entries(API_KEY_PROVIDERS).reduce((snapshot, [provider, storageKey]) => {
        const value = keys?.[provider];
        if (typeof value === 'string' && value.length > 0) {
            snapshot[storageKey] = value;
        }
        return snapshot;
    }, {});
}

// Merge user-added custom models into the fetched model map (dedupe by id)
function mergeCustomModels(fetchedModels, customModels) {
    if (!customModels || Object.keys(customModels).length === 0) {
        return fetchedModels;
    }
    const merged = { ...fetchedModels };
    for (const [provider, models] of Object.entries(customModels)) {
        if (!Array.isArray(models) || models.length === 0) continue;
        const base = merged[provider] || [];
        const existingIds = new Set(base.map(m => m.id));
        const extras = models.filter(m => m && m.id && !existingIds.has(m.id));
        merged[provider] = extras.length ? [...base, ...extras] : base;
    }
    return merged;
}

export function ChatProvider({ children }) {
    const createDefaultProjects = () => {
        const now = Date.now();
        return [
            {
                id: 'sample-linkedin',
                name: 'LinkedIn',
                description: 'Redesign LinkedIn pages',
                memory: 'Use this project to keep LinkedIn redesign notes, page references, and iteration goals together.',
                instructions: '',
                files: [],
                createdAt: now - 4 * 24 * 60 * 60 * 1000,
                updatedAt: now - 4 * 24 * 60 * 60 * 1000,
                isPinned: true
            },
            {
                id: 'sample-daily-assistant',
                name: 'Daily Assistant',
                description: 'Follow up on important tasks, reminders, and loose ends.',
                memory: 'Keep a running sense of recurring tasks, preferred routines, and active priorities.',
                instructions: '',
                files: [],
                createdAt: now - 30 * 24 * 60 * 60 * 1000,
                updatedAt: now - 30 * 24 * 60 * 60 * 1000,
                isPinned: false
            }
        ];
    };

    const createDefaultChat = () => ({
        id: Date.now().toString(),
        title: 'New Chat',
        messages: [],
        artifacts: [],
        createdAt: Date.now()
    });

    const electronPersistenceReadyRef = useRef(!hasElectronStore());

    const [projects, setProjects] = useState(() => {
        const parsed = readJsonStorage('perci_projects', null);
        return Array.isArray(parsed) ? parsed : createDefaultProjects();
    });

    // Chat History
    const [chats, setChats] = useState(() => {
        const parsed = readJsonStorage('chat_history', null);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : [createDefaultChat()];
    });

    const [currentChatId, setCurrentChatId] = useState(() => {
        return readStringStorage('current_chat_id', chats[0]?.id);
    });

    // Current chat state
    const currentChat = chats.find(c => c.id === currentChatId) || chats[0];
    const [messages, setMessages] = useState(currentChat?.messages || []);
    const [artifacts, setArtifacts] = useState(currentChat?.artifacts || []);

    const [isLoading, setIsLoading] = useState(false);
    const activeRequestRef = useRef(null);
    const abortGeneration = useCallback(() => {
        activeRequestRef.current?.abort();
    }, []);

    // Incognito Mode - chats won't be saved when enabled
    const [isIncognitoMode, setIsIncognitoMode] = useState(false);

    const toggleIncognitoMode = useCallback(() => {
        setIsIncognitoMode(prev => !prev);
    }, []);

    // User Name - persisted to localStorage
    const [userName, setUserNameState] = useState(() => {
        return readStringStorage('user_name');
    });

    const setUserName = useCallback((name) => {
        setUserNameState(name);
        localStorage.setItem('user_name', name);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ user_name: name }).catch(err => console.error('Failed to persist user name:', err));
        }
    }, []);

    const [customInstructions, setCustomInstructionsState] = useState(() => {
        return readStringStorage('custom_instructions');
    });

    const setCustomInstructions = useCallback((instructions) => {
        setCustomInstructionsState(instructions);
        localStorage.setItem('custom_instructions', instructions);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ custom_instructions: instructions }).catch(err => console.error('Failed to persist custom instructions:', err));
        }
    }, []);

    const [weatherSyncEnabled, setWeatherSyncEnabledState] = useState(() => {
        return readStringStorage('weather_sync_enabled', 'true') === 'true';
    });

    const [weatherLocation, setWeatherLocationState] = useState(() => {
        return readStringStorage('weather_location', '');
    });

    const [weatherCondition, setWeatherCondition] = useState('clear');

    const setWeatherSyncEnabled = useCallback((enabled) => {
        const strVal = enabled ? 'true' : 'false';
        setWeatherSyncEnabledState(enabled);
        localStorage.setItem('weather_sync_enabled', strVal);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ weather_sync_enabled: strVal }).catch(err => console.error('Failed to persist weather sync enabled:', err));
        }
    }, []);

    const setWeatherLocation = useCallback((location) => {
        setWeatherLocationState(location);
        localStorage.setItem('weather_location', location);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ weather_location: location }).catch(err => console.error('Failed to persist weather location:', err));
        }
    }, []);

    useEffect(() => {
        if (!weatherSyncEnabled) {
            setWeatherCondition('clear');
            return;
        }

        let active = true;
        const update = async () => {
            const location = weatherLocation.trim();
            const res = location ? await fetchWeather(location) : await fetchWeatherForLocale();
            if (active && res && res.condition) {
                setWeatherCondition(res.condition);
            }
        };

        void update();
        const interval = setInterval(update, 15 * 60 * 1000); // 15 minutes
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [weatherSyncEnabled, weatherLocation]);

    const [lmStudioUrl, setLmStudioUrlState] = useState(() => {
        return normalizeLocalServerUrl(readStringStorage('lm_studio_url', DEFAULT_LM_STUDIO_URL));
    });

    const setLmStudioUrl = useCallback((url) => {
        const normalizedUrl = normalizeLocalServerUrl(url);
        setLmStudioUrlState(normalizedUrl);
        localStorage.setItem('lm_studio_url', normalizedUrl);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ lm_studio_url: normalizedUrl }).catch(err => console.error('Failed to persist LM Studio URL:', err));
        }
        // Clear cache so it fetches from the new URL
        modelService.clearCache('lmstudio');
    }, []);

    useEffect(() => {
        localStorage.setItem('lm_studio_url', lmStudioUrl);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ lm_studio_url: lmStudioUrl }).catch(err => console.error('Failed to persist LM Studio URL:', err));
        }
    }, [lmStudioUrl]);

    const [janUrl, setJanUrlState] = useState(() => {
        return normalizeLocalServerUrl(readStringStorage('jan_url', DEFAULT_JAN_URL), DEFAULT_JAN_URL);
    });

    const setJanUrl = useCallback((url) => {
        const normalizedUrl = normalizeLocalServerUrl(url, DEFAULT_JAN_URL);
        setJanUrlState(normalizedUrl);
        localStorage.setItem('jan_url', normalizedUrl);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ jan_url: normalizedUrl }).catch(err => console.error('Failed to persist Jan URL:', err));
        }
        modelService.clearCache('jan');
    }, []);

    useEffect(() => {
        localStorage.setItem('jan_url', janUrl);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ jan_url: janUrl }).catch(err => console.error('Failed to persist Jan URL:', err));
        }
    }, [janUrl]);

    useEffect(() => {
        if (!hasElectronStore()) return;

        let isMounted = true;
        async function hydrateElectronPersistence() {
            try {
                const electronData = await loadElectronPersistence();
                if (!isMounted) return;
                const localApiKeys = getLocalApiKeySnapshot();

                if (hasPersistedUserData(electronData)) {
                    writeLocalPersistenceSnapshot(electronData);
                    const nextApiKeys = readApiKeysFromSnapshot(electronData, localApiKeys);

                    const persistedChats = readJsonStorage('chat_history', null);
                    const nextChats = Array.isArray(persistedChats) && persistedChats.length > 0
                        ? persistedChats
                        : [createDefaultChat()];
                    const persistedProjects = readJsonStorage('perci_projects', null);
                    const nextCurrentChatId = readStringStorage('current_chat_id', nextChats[0]?.id);
                    const nextCurrentChat = nextChats.find(chat => chat.id === nextCurrentChatId) || nextChats[0];

                    setChats(nextChats);
                    setCurrentChatId(nextCurrentChat?.id);
                    setMessages(nextCurrentChat?.messages || []);
                    setArtifacts(nextCurrentChat?.artifacts || []);
                    setProjects(Array.isArray(persistedProjects) ? persistedProjects : createDefaultProjects());
                    setUserNameState(readStringStorage('user_name'));
                    setCustomInstructionsState(readStringStorage('custom_instructions'));
                    setWeatherSyncEnabledState(readStringStorage('weather_sync_enabled', 'true') === 'true');
                    setWeatherLocationState(readStringStorage('weather_location', ''));
                    setLmStudioUrlState(normalizeLocalServerUrl(readStringStorage('lm_studio_url', DEFAULT_LM_STUDIO_URL)));
                    setJanUrlState(normalizeLocalServerUrl(readStringStorage('jan_url', DEFAULT_JAN_URL), DEFAULT_JAN_URL));
                    setSelectedProvider(readStringStorage('selected_provider', 'groq'));
                    setSelectedModel(readStringStorage('selected_model'));
                    setApiKeys(nextApiKeys);
                    await saveElectronPersistence({
                        ...getLocalPersistenceSnapshot(),
                        ...nonEmptyApiKeysToStorageSnapshot(nextApiKeys)
                    });
                } else {
                    await saveElectronPersistence({
                        ...getLocalPersistenceSnapshot(),
                        ...nonEmptyApiKeysToStorageSnapshot(readApiKeysFromSnapshot(localApiKeys))
                    });
                }
                clearLocalApiKeys();
            } catch (err) {
                console.error('Failed to hydrate Electron persistence:', err);
            } finally {
                if (isMounted) {
                    electronPersistenceReadyRef.current = true;
                }
            }
        }

        hydrateElectronPersistence();
        return () => {
            isMounted = false;
        };
    }, []);

    // Save chats to localStorage whenever they change (but not in incognito mode)
    useEffect(() => {
        if (!isIncognitoMode) {
            const serializedChats = serializeJson(chats);
            localStorage.setItem('chat_history', serializedChats);
            localStorage.setItem('current_chat_id', currentChatId);
            if (electronPersistenceReadyRef.current) {
                saveElectronPersistence({
                    chat_history: serializedChats,
                    current_chat_id: currentChatId || ''
                }).catch(err => console.error('Failed to persist chat history:', err));
            }
        }
    }, [chats, currentChatId, isIncognitoMode]);

    useEffect(() => {
        const serializedProjects = serializeJson(projects);
        localStorage.setItem('perci_projects', serializedProjects);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ perci_projects: serializedProjects }).catch(err => console.error('Failed to persist projects:', err));
        }
    }, [projects]);

    // Update current chat when messages or artifacts change
    useEffect(() => {
        // Only update chats if we have a current chat and either messages or artifacts have actually changed
        // from what's stored in the chats array.
        setChats(prev => {
            const chat = prev.find(c => c.id === currentChatId);
            if (!chat) return prev;

            // Check if anything actually changed to avoid infinite loops or unnecessary updates
            if (chat.messages === messages && chat.artifacts === artifacts) return prev;

            return prev.map(c =>
                c.id === currentChatId
                    ? { ...c, messages, artifacts, updatedAt: Date.now() }
                    : c
            );
        });
        const chat = chats.find(c => c.id === currentChatId);
        if (chat?.projectId && (messages.length > 0 || artifacts.length > 0)) {
            setProjects(prev => prev.map(project =>
                project.id === chat.projectId
                    ? { ...project, updatedAt: Date.now() }
                    : project
            ));
        }
    }, [messages, artifacts]);

    // Load chat when switching
    useEffect(() => {
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) {
            setMessages(chat.messages || []);
            setArtifacts(chat.artifacts || []);
        }
    }, [currentChatId]);

    // Chat history functions
    const createNewChat = useCallback((options = {}) => {
        const newChat = {
            id: Date.now().toString(),
            title: options.title || 'New Chat',
            messages: options.messages || [],
            artifacts: options.artifacts || [],
            projectId: options.projectId || null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        setChats(prev => [newChat, ...prev]);
        setCurrentChatId(newChat.id);
        setMessages(newChat.messages);
        setArtifacts(newChat.artifacts);
        return newChat.id;
    }, []);

    const switchToChat = useCallback((chatId) => {
        setCurrentChatId(chatId);
    }, []);

    const deleteChat = useCallback((chatId) => {
        setChats(prev => {
            const filtered = prev.filter(c => c.id !== chatId);
            // If deleting current chat, switch to first remaining chat
            if (chatId === currentChatId && filtered.length > 0) {
                setCurrentChatId(filtered[0].id);
            }
            return filtered.length > 0 ? filtered : [{
                id: Date.now().toString(),
                title: 'New Chat',
                messages: [],
                artifacts: [],
                createdAt: Date.now()
            }];
        });
    }, [currentChatId]);

    const createProject = useCallback(({ name, description }) => {
        const trimmedName = name.trim();
        const trimmedDescription = description.trim();
        const now = Date.now();
        const project = {
            id: `project-${now}`,
            name: trimmedName || 'Untitled project',
            description: trimmedDescription,
            memory: trimmedDescription ? `Project goal: ${trimmedDescription}` : '',
            instructions: '',
            files: [],
            createdAt: now,
            updatedAt: now,
            isPinned: false
        };
        setProjects(prev => [project, ...prev]);
        return project;
    }, []);

    const updateProject = useCallback((projectId, updates) => {
        setProjects(prev => prev.map(project =>
            project.id === projectId
                ? { ...project, ...updates, updatedAt: Date.now() }
                : project
        ));
    }, []);

    // Provider and Model Selection
    const [selectedProvider, setSelectedProvider] = useState(
        readStringStorage('selected_provider', 'groq')
    );
    const [selectedModel, setSelectedModel] = useState(
        readStringStorage('selected_model')
    );

    // Available models from all providers
    const [availableModels, setAvailableModels] = useState({
        groq: [],
        ollama: [],
        lmstudio: [],
        jan: [],
        openai: [],
        gemini: [],
        openrouter: [],
        anthropic: [],
        mistral: []
    });

    // User-added custom models, persisted and merged into availableModels.
    // Shape: { [provider]: [{ id, name, custom: true }] }
    const [customModels, setCustomModels] = useState(() => {
        const parsed = readJsonStorage('custom_models', null);
        return parsed && typeof parsed === 'object' ? parsed : {};
    });

    useEffect(() => {
        const serialized = serializeJson(customModels);
        localStorage.setItem('custom_models', serialized);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ custom_models: serialized }).catch(err => console.error('Failed to persist custom models:', err));
        }
    }, [customModels]);

    const combinedModels = useMemo(
        () => mergeCustomModels(availableModels, customModels),
        [availableModels, customModels]
    );

    // Current model capabilities
    const [currentModelCapabilities, setCurrentModelCapabilities] = useState({
        text: true,
        image: false,
        audio: false,
        video: false
    });

    const [isLoadingModels, setIsLoadingModels] = useState(false);

    // Artifacts
    const [currentArtifactId, setCurrentArtifactId] = useState(null);
    const [isArtifactOpen, setIsArtifactOpen] = useState(false);

    const addArtifact = useCallback((artifact) => {
        const newArtifact = { ...artifact, id: Date.now().toString(), createdAt: Date.now() };
        setArtifacts(prev => [newArtifact, ...prev]);
        setCurrentArtifactId(newArtifact.id);
        setIsArtifactOpen(true);
        return newArtifact.id;
    }, []);

    const updateArtifactContent = useCallback((id, content) => {
        setArtifacts(prev => prev.map(art =>
            art.id === id ? { ...art, content } : art
        ));
    }, []);

    const getArtifact = useCallback((id) => {
        return artifacts.find(a => a.id === id);
    }, [artifacts]);

    // API Keys
    const [apiKeys, setApiKeys] = useState(readApiKeysFromStorage);

    const updateApiKey = (provider, key) => {
        setApiKeys(prev => ({ ...prev, [provider]: key }));
        const storageKey = API_KEY_PROVIDERS[provider] || `${provider}_key`;
        if (hasElectronStore()) {
            localStorage.removeItem(storageKey);
            saveElectronPersistence({ [storageKey]: key }).catch(err => console.error(`Failed to persist ${provider} API key:`, err));
        } else {
            localStorage.setItem(storageKey, key);
        }
    };

    const updateProvider = (provider) => {
        setSelectedProvider(provider);
        localStorage.setItem('selected_provider', provider);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ selected_provider: provider }).catch(err => console.error('Failed to persist selected provider:', err));
        }
        // Auto-select first model if current selection is from different provider
        const modelsForProvider = combinedModels[provider];
        if (modelsForProvider && modelsForProvider.length > 0) {
            if (!selectedModel || !modelsForProvider.find(m => m.id === selectedModel)) {
                updateModel(modelsForProvider[0].id);
            }
        }
    };

    const updateModel = (modelId) => {
        setSelectedModel(modelId);
        localStorage.setItem('selected_model', modelId);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({ selected_model: modelId }).catch(err => console.error('Failed to persist selected model:', err));
        }
    };

    const addCustomModel = useCallback((provider, modelId, name) => {
        const id = (modelId || '').trim();
        if (!provider || !id) return;
        setCustomModels(prev => {
            const existing = prev[provider] || [];
            if (existing.some(m => m.id === id)) return prev;
            const entry = { id, name: (name || '').trim() || id, custom: true };
            return { ...prev, [provider]: [...existing, entry] };
        });
    }, []);

    const removeCustomModel = useCallback((provider, modelId) => {
        setCustomModels(prev => {
            const existing = prev[provider];
            if (!existing) return prev;
            const next = existing.filter(m => m.id !== modelId);
            if (next.length === existing.length) return prev;
            const updated = { ...prev };
            if (next.length) updated[provider] = next;
            else delete updated[provider];
            return updated;
        });
    }, []);

    const fetchModels = useCallback(async () => {
        setIsLoadingModels(true);
        try {
            const models = await modelService.getAllModels({ ...apiKeys, lmStudioUrl, janUrl });
            setAvailableModels(models);

            // Auto-select a model if none is selected, or if the stored model
            // is no longer present in the freshly-loaded list (e.g. after a refresh).
            // User-added custom models count as valid so a refresh never deselects them.
            const customModelIds = Object.values(customModels).flat().map(m => m.id);
            const allModelIds = [...Object.values(models).flat().map(m => m.id), ...customModelIds];
            const storedModelStillValid = selectedModel && allModelIds.includes(selectedModel);
            if (!storedModelStillValid) {
                // OpenRouter's list now loads without a key (public catalog), so
                // don't auto-select a provider the user can't actually use yet —
                // skip key-required providers that have no key configured.
                const needsKey = new Set(['openrouter', 'groq', 'openai', 'anthropic', 'mistral', 'gemini']);
                for (const provider of ['openrouter', 'groq', 'openai', 'anthropic', 'mistral', 'gemini', 'ollama', 'lmstudio', 'jan']) {
                    if (!models[provider] || models[provider].length === 0) continue;
                    if (needsKey.has(provider) && !apiKeys[provider]) continue;
                    setSelectedProvider(provider);
                    setSelectedModel(models[provider][0].id);
                    break;
                }
            }
        } catch (error) {
            console.error('Error fetching models:', error);
        } finally {
            setIsLoadingModels(false);
        }
    }, [apiKeys, selectedModel, lmStudioUrl, janUrl, customModels]);

    // Fetch models on mount and whenever API keys or local model endpoints change
    useEffect(() => {
        fetchModels();
    }, [apiKeys.groq, apiKeys.openai, apiKeys.gemini, apiKeys.openrouter, apiKeys.anthropic, apiKeys.mistral, lmStudioUrl, janUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    // Update capabilities when model changes
    useEffect(() => {
        if (selectedModel) {
            const capabilities = getModelCapabilities(selectedModel);
            setCurrentModelCapabilities(capabilities);
        }
    }, [selectedModel]);

    const addMessage = useCallback((role, content, metadata = {}, thinking = null, images = []) => {
        const safeMetadata = metadata || {};
        const safeContent = role === 'assistant' ? normalizeAssistantSpacing(content) : content;
        const newMessage = {
            role,
            content: safeContent,
            id: Date.now().toString(),
            timestamp: Date.now(),
            metadata: safeMetadata, // Store full metadata object
            // Legacy fields for backward compatibility
            thinking: thinking || safeMetadata.thinking || null,
            thinkingTokens: safeMetadata.thinkingTokens || null,
            duration: safeMetadata.duration || null,
            // Image support
            images: images || []
        };
        setMessages(prev => {
            const updated = [...prev, newMessage];

            // Update chat title from first user message
            if (role === 'user' && prev.length === 0) {
                const titleContent = content || (images.length > 0 ? '[Image]' : '');
                const title = titleContent.length > 50 ? titleContent.substring(0, 50) + '...' : titleContent || 'New Chat';
                setChats(prevChats => prevChats.map(chat =>
                    chat.id === currentChatId ? { ...chat, title } : chat
                ));
            }

            return updated;
        });
    }, [currentChatId]);

    const clearChat = useCallback(() => {
        setMessages([]);
        setArtifacts([]);
        setCurrentArtifactId(null);
    }, []);

    const refreshModels = useCallback(() => {
        modelService.clearCache();
        fetchModels();
    }, [fetchModels]);

    return (
        <ChatContext.Provider value={{
            messages,
            addMessage,
            isLoading,
            setIsLoading,
            selectedProvider,
            selectedModel,
            updateProvider,
            updateModel,
            availableModels: combinedModels,
            addCustomModel,
            removeCustomModel,
            isLoadingModels,
            fetchModels,
            refreshModels,
            apiKeys,
            updateApiKey,
            clearChat,
            artifacts,
            addArtifact,
            updateArtifactContent,
            getArtifact,
            currentArtifactId,
            setCurrentArtifactId,
            isArtifactOpen,
            setIsArtifactOpen,
            // Chat history
            chats,
            currentChatId,
            createNewChat,
            switchToChat,
            deleteChat,
            // Projects
            projects,
            createProject,
            updateProject,
            // Incognito mode
            isIncognitoMode,
            toggleIncognitoMode,
            // User settings
            userName,
            setUserName,
            customInstructions,
            setCustomInstructions,
            lmStudioUrl,
            setLmStudioUrl,
            janUrl,
            setJanUrl,
            // Weather sync
            weatherSyncEnabled,
            setWeatherSyncEnabled,
            weatherLocation,
            setWeatherLocation,
            weatherCondition,
            // Model capabilities
            currentModelCapabilities,
            supportsImages: currentModelCapabilities.image,
            supportsAudio: currentModelCapabilities.audio,
            supportsVideo: currentModelCapabilities.video,
            // Abort control
            activeRequestRef,
            abortGeneration
        }}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
}
