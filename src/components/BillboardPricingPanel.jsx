import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Calculator,
    Database,
    ExternalLink,
    RefreshCw,
    Search,
    Sparkles,
    X,
} from 'lucide-react';
import {
    BILLBOARD_PRICING_PROVIDERS,
    estimateModelCost,
    fetchPricingCatalog,
    getUnpricedTokenTypes,
    matchPricingProvider,
} from '../lib/billboardPricing';
import { IntelligentSearchTool } from '../lib/IntelligentSearchTool';

const MILLION = 1_000_000;

function formatDollars(value, maximumFractionDigits = 4) {
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
        maximumFractionDigits,
    }).format(value);
}

function humanizeUnit(value) {
    return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function WorkloadInput({ id, label, value, onChange }) {
    return (
        <label className="cn-pricing-workload-field" htmlFor={id}>
            <span>{label}</span>
            <span className="cn-pricing-number-wrap">
                <input
                    id={id}
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.1"
                    value={value}
                    onChange={event => onChange(event.target.value)}
                />
                <span>M tokens</span>
            </span>
        </label>
    );
}

export default function BillboardPricingPanel({ account, onClose }) {
    const closeButtonRef = useRef(null);
    const matchedProvider = matchPricingProvider(account);
    const [provider, setProvider] = useState(matchedProvider || 'openai');
    const [catalog, setCatalog] = useState(null);
    const [catalogStatus, setCatalogStatus] = useState('loading');
    const [catalogError, setCatalogError] = useState('');
    const [modelSearch, setModelSearch] = useState('');
    const [modelId, setModelId] = useState('');
    const [mode, setMode] = useState('standard');
    const [usage, setUsage] = useState({
        input: '1',
        output: '0.25',
        cacheRead: '0',
        cacheWrite: '0',
    });
    const [refreshKey, setRefreshKey] = useState(0);
    const [research, setResearch] = useState({ status: 'idle', sources: [], error: '' });

    const providerInfo = BILLBOARD_PRICING_PROVIDERS.find(candidate => candidate.id === provider);

    useEffect(() => {
        const opener = document.activeElement;
        closeButtonRef.current?.focus();
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            window.removeEventListener('keydown', closeOnEscape);
            opener?.focus?.();
        };
    }, [onClose]);

    useEffect(() => {
        const controller = new AbortController();
        setCatalogStatus('loading');
        setCatalogError('');
        setCatalog(null);
        setModelId('');
        setModelSearch('');
        setMode('standard');
        setResearch({ status: 'idle', sources: [], error: '' });

        fetchPricingCatalog(provider, {
            fetchImpl: url => fetch(url, { signal: controller.signal }),
        }).then(nextCatalog => {
            setCatalog(nextCatalog);
            setCatalogStatus('ready');
        }).catch(error => {
            if (error?.name === 'AbortError') return;
            setCatalogError(error?.message || 'Pricing catalog unavailable');
            setCatalogStatus('error');
        });

        return () => controller.abort();
    }, [provider, refreshKey]);

    const matchingModels = useMemo(() => {
        const query = modelSearch.trim().toLowerCase();
        if (!query || !catalog) return [];
        return catalog.models
            .filter(model => model.id.toLowerCase().includes(query))
            .slice(0, 8);
    }, [catalog, modelSearch]);

    const selectedModel = catalog?.models.find(model => model.id === modelId) || null;
    const activeRates = mode === 'batch' && selectedModel?.batchRates
        ? selectedModel.batchRates
        : selectedModel?.rates;
    const tokenUsage = {
        inputTokens: Number(usage.input) * MILLION,
        outputTokens: Number(usage.output) * MILLION,
        cacheReadTokens: Number(usage.cacheRead) * MILLION,
        cacheWriteTokens: Number(usage.cacheWrite) * MILLION,
    };
    const unpricedTokenTypes = selectedModel
        ? getUnpricedTokenTypes(activeRates, tokenUsage)
        : [];
    const estimate = selectedModel && unpricedTokenTypes.length === 0
        ? estimateModelCost(selectedModel, tokenUsage, mode)
        : null;

    const selectModel = (id) => {
        setModelId(id);
        setModelSearch(id);
        const model = catalog?.models.find(candidate => candidate.id === id);
        if (!model?.batchRates) setMode('standard');
        setResearch({ status: 'idle', sources: [], error: '' });
    };

    const researchLatest = async () => {
        const query = [
            providerInfo?.label,
            modelId || modelSearch,
            'current official API pricing',
            providerInfo?.officialPricingUrl
                ? `site:${new URL(providerInfo.officialPricingUrl).hostname}`
                : '',
        ].filter(Boolean).join(' ');
        setResearch({ status: 'loading', sources: [], error: '' });
        try {
            const results = await new IntelligentSearchTool().performSearch(query, {
                maxResults: 3,
                skipReformulate: true,
            });
            setResearch({ status: 'ready', sources: results.sources || [], error: '' });
        } catch (error) {
            setResearch({
                status: 'error',
                sources: [],
                error: error?.message || 'Live research is unavailable',
            });
        }
    };

    const setUsageField = (field, value) => {
        setUsage(current => ({ ...current, [field]: value }));
    };

    return (
        <div className="cn-dialog" onClick={onClose}>
            <section
                className="cn-dialog-panel cn-pricing-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="billboard-pricing-title"
                onClick={event => event.stopPropagation()}
            >
                <header className="cn-pricing-heading">
                    <div className="cn-pricing-heading-icon" aria-hidden="true">
                        <Calculator size={18} />
                    </div>
                    <div>
                        <span className="cn-pricing-kicker">Live model catalog</span>
                        <h2 id="billboard-pricing-title">Pricing calculator</h2>
                        <p>{account ? `Opened from ${account.name}. ` : ''}Compare list rates before you run a workload.</p>
                    </div>
                    <button ref={closeButtonRef} type="button" className="cn-pricing-close" onClick={onClose} aria-label="Close pricing calculator">
                        <X size={16} />
                    </button>
                </header>

                <div className="cn-pricing-controls">
                    <label className="cn-pricing-field" htmlFor="billboard-pricing-provider">
                        <span>Provider / service</span>
                        <select
                            id="billboard-pricing-provider"
                            value={provider}
                            onChange={event => setProvider(event.target.value)}
                        >
                            {BILLBOARD_PRICING_PROVIDERS.map(candidate => (
                                <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                            ))}
                        </select>
                    </label>

                    <div className="cn-pricing-field">
                        <label htmlFor="billboard-pricing-model">Model / service</label>
                        <div className="cn-pricing-search-wrap">
                            <Search size={14} aria-hidden="true" />
                            <input
                                id="billboard-pricing-model"
                                type="search"
                                value={modelSearch}
                                onChange={event => {
                                    setModelSearch(event.target.value);
                                    if (event.target.value !== modelId) setModelId('');
                                }}
                                placeholder={catalogStatus === 'loading' ? 'Loading catalog…' : 'Search exact model ID'}
                                disabled={catalogStatus !== 'ready'}
                                autoComplete="off"
                            />
                        </div>
                        {matchingModels.length > 0 && !selectedModel && (
                            <div className="cn-pricing-model-results" role="listbox" aria-label="Matching models">
                                {matchingModels.map(model => (
                                    <button type="button" role="option" aria-selected="false" key={model.id} onClick={() => selectModel(model.id)}>
                                        {model.id}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {catalogStatus === 'loading' && (
                    <div className="cn-pricing-state" role="status">
                        <RefreshCw className="cn-pricing-spin" size={18} />
                        Loading {providerInfo?.label} pricing…
                    </div>
                )}

                {catalogStatus === 'error' && (
                    <div className="cn-pricing-state cn-pricing-state-error" role="alert">
                        <span>{catalogError}</span>
                        <button type="button" onClick={() => setRefreshKey(key => key + 1)}>Retry catalog</button>
                    </div>
                )}

                {catalogStatus === 'ready' && !selectedModel && (
                    <div className="cn-pricing-state">
                        <Database size={18} />
                        {modelSearch
                            ? `No exact model selected. ${matchingModels.length ? 'Choose a match above.' : 'Try another model name.'}`
                            : `Search ${catalog.models.length.toLocaleString()} catalog models.`}
                    </div>
                )}

                {selectedModel && (
                    <>
                        <div className="cn-pricing-selection">
                            <div>
                                <span>Selected model</span>
                                <strong>{selectedModel.id}</strong>
                            </div>
                            {selectedModel.batchRates && (
                                <div className="cn-pricing-mode" aria-label="Pricing mode">
                                    <button type="button" className={mode === 'standard' ? 'active' : ''} onClick={() => setMode('standard')}>Standard</button>
                                    <button type="button" className={mode === 'batch' ? 'active' : ''} onClick={() => setMode('batch')}>Batch</button>
                                </div>
                            )}
                        </div>

                        <div className="cn-pricing-rate-grid">
                            <div><span>Input</span><strong>{formatDollars(activeRates?.input)}/M</strong></div>
                            <div><span>Output</span><strong>{formatDollars(activeRates?.output)}/M</strong></div>
                            <div><span>Cache read</span><strong>{formatDollars(activeRates?.cacheRead)}/M</strong></div>
                            <div><span>Cache write</span><strong>{formatDollars(activeRates?.cacheWrite)}/M</strong></div>
                        </div>

                        <div className="cn-pricing-workload">
                            <WorkloadInput id="billboard-price-input" label="Uncached input" value={usage.input} onChange={value => setUsageField('input', value)} />
                            <WorkloadInput id="billboard-price-output" label="Output" value={usage.output} onChange={value => setUsageField('output', value)} />
                            <WorkloadInput id="billboard-price-cache-read" label="Cache reads" value={usage.cacheRead} onChange={value => setUsageField('cacheRead', value)} />
                            <WorkloadInput id="billboard-price-cache-write" label="Cache writes" value={usage.cacheWrite} onChange={value => setUsageField('cacheWrite', value)} />
                        </div>

                        <div className="cn-pricing-estimate" aria-live="polite">
                            <div>
                                <span>Estimated workload</span>
                                <strong>{formatDollars(estimate?.total, 6)}</strong>
                            </div>
                            <small>
                                {unpricedTokenTypes.length > 0
                                    ? `No estimate: ${unpricedTokenTypes.join(', ')} pricing is not listed for this model.`
                                    : selectedModel.additionalUnits.length > 0
                                        ? 'Token-price estimate only; additional metered units shown below are excluded. Taxes, discounts, and routing premiums are also excluded.'
                                        : 'List-price estimate; taxes, negotiated discounts, and routing premiums are excluded.'}
                            </small>
                        </div>

                        {selectedModel.additionalUnits.length > 0 && (
                            <div className="cn-pricing-extras">
                                <span>Additional metered units</span>
                                <div>
                                    {selectedModel.additionalUnits.slice(0, 6).map(unit => (
                                        <span key={unit.id}>{humanizeUnit(unit.id)} · {formatDollars(unit.dollarsPerUnit, 6)}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                <footer className="cn-pricing-footer">
                    <a
                        className="cn-pricing-source"
                        href={`https://configs.portkey.ai/pricing/${provider}.json`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Database size={13} />
                        <span>
                            Portkey catalog
                            {catalog?.retrievedAt && ` · retrieved ${new Date(catalog.retrievedAt).toLocaleString()}`}
                        </span>
                    </a>
                    <div className="cn-pricing-footer-actions">
                        <button type="button" onClick={researchLatest} disabled={research.status === 'loading'}>
                            <Sparkles size={13} />
                            {research.status === 'loading' ? 'Researching…' : 'Research latest'}
                        </button>
                        <a href={providerInfo?.officialPricingUrl} target="_blank" rel="noopener noreferrer">
                            Official pricing <ExternalLink size={12} />
                        </a>
                    </div>
                </footer>

                {research.status === 'ready' && (
                    <div className="cn-pricing-research" aria-live="polite">
                        <strong>Live research leads</strong>
                        {research.sources.map(source => (
                            <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                                <span>{source.title}</span>
                                <ExternalLink size={11} />
                            </a>
                        ))}
                    </div>
                )}
                {research.status === 'error' && (
                    <p className="cn-pricing-research-error" role="status">
                        {research.error} Use the official pricing link for a live source check.
                    </p>
                )}
            </section>
        </div>
    );
}
