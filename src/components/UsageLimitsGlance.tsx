import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Globe,
    Plus,
    Timer,
} from 'lucide-react';

const DEFAULT_SUBSCRIPTIONS = {
    version: 1,
    timezone: 'utc',
    services: [
        {
            id: 'claude-code',
            name: 'Claude Code',
            type: 'weekly_reset',
            reset_date: '2026-06-29T00:00:00',
            reset_cycle: 'weekly',
            notes: 'Weekly usage limit. Resets Monday 00:00 UTC.',
        },
        {
            id: 'openrouter',
            name: 'OpenRouter',
            type: 'balance',
            balance: null,
            currency: 'credits',
            daily_burn_estimate: null,
            top_up_url: 'https://openrouter.ai/credits',
            check_url: 'https://openrouter.ai/api/v1/auth/key',
            notes: 'API key billing.',
        },
        {
            id: 'fal-ai',
            name: 'fal.ai',
            type: 'balance',
            balance: null,
            currency: 'credits',
            daily_burn_estimate: null,
            top_up_url: 'https://fal.ai/dashboard/billing',
            notes: 'Subscription + pay-as-you-go.',
        },
        {
            id: 'codex-personal',
            name: 'Codex (Personal)',
            account_label: 'toshon.tech@gmail.com',
            type: 'weekly_reset',
            reset_date: null,
            reset_cycle: 'monthly',
            notes: 'Codex subscription.',
        },
        {
            id: 'codex-work',
            name: 'Codex (Work)',
            account_label: 'tjennings@cityschool.org',
            type: 'weekly_reset',
            reset_date: null,
            reset_cycle: 'monthly',
            notes: 'Codex subscription.',
        },
    ],
};

function daysUntilReset(resetDate, cycle) {
    if (!resetDate) return null;
    // Parse as UTC since stored dates have no timezone suffix
    const reset = parseUtc(resetDate);
    if (Number.isNaN(reset.getTime())) return null;
    const now = new Date();
    reset.setUTCHours(0, 0, 0, 0);
    const nowDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let diff = Math.round((reset.getTime() - nowDay.getTime()) / 86400000);
    if (diff < 0) {
        if (cycle === 'weekly') diff += 7;
        else diff += 30;
    }
    return diff;
}

function daysFromBalance(balance, dailyBurn) {
    if (balance == null || dailyBurn == null || dailyBurn <= 0) return null;
    return Math.floor(balance / dailyBurn);
}

function toneForDays(days) {
    if (days == null) return 'neutral';
    if (days < 3) return 'red';
    if (days <= 7) return 'yellow';
    return 'green';
}

function toneColor(tone) {
    if (tone === 'red') return '#ef4444';
    if (tone === 'yellow') return '#eab308';
    if (tone === 'green') return '#22c55e';
    return '#6b7280';
}

function parseUtc(isoString) {
    // Treat strings without timezone suffix as UTC
    const str = isoString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoString)
        ? isoString
        : `${isoString}Z`;
    return new Date(str);
}

function formatDateLocal(isoString) {
    const d = parseUtc(isoString);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateUtc(isoString) {
    const d = parseUtc(isoString);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatTimeLocal(isoString) {
    const d = parseUtc(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTimeUtc(isoString) {
    const d = parseUtc(isoString);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function computeServiceMeta(service) {
    if (service.type === 'weekly_reset') {
        const days = daysUntilReset(service.reset_date, service.reset_cycle);
        return {
            type: 'reset',
            days,
            tone: toneForDays(days),
            label: days == null ? 'No date set' : `${days}d`,
        };
    }
    const days = daysFromBalance(service.balance, service.daily_burn_estimate);
    return {
        type: 'balance',
        days,
        tone: toneForDays(days),
        label: days == null ? '—' : `${days}d`,
    };
}

function formatBalance(balance) {
    if (balance == null) return '—';
    return balance.toLocaleString();
}

const TIMEZONE_OPTIONS = [
    { value: 'utc', label: 'UTC only' },
    { value: 'local', label: 'Local only' },
    { value: 'both', label: 'Both' },
];

export default function UsageLimitsGlance() {
    const [data, setData] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        if (!window.electron?.usageTracker) {
            setData(DEFAULT_SUBSCRIPTIONS);
            setLoading(false);
            return;
        }
        try {
            const result = await window.electron.usageTracker.get();
            setData(result || DEFAULT_SUBSCRIPTIONS);
        } catch {
            setData(DEFAULT_SUBSCRIPTIONS);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleSave = useCallback(async (next) => {
        if (window.electron?.usageTracker) {
            try {
                await window.electron.usageTracker.save(next);
            } catch (err) {
                console.error('Failed to save usage tracker data:', err);
            }
        }
        setData(next);
    }, []);

    const timezone = data?.timezone || 'utc';

    const cycleTimezone = useCallback((mode) => {
        if (!data) return;
        handleSave({ ...data, timezone: mode });
    }, [data, handleSave]);

    const services = useMemo(() => {
        if (!data?.services) return [];
        return data.services.map((service) => ({
            ...service,
            meta: computeServiceMeta(service),
        }));
    }, [data]);

    const summaryCounts = useMemo(() => {
        let green = 0, yellow = 0, red = 0;
        for (const s of services) {
            if (s.meta.tone === 'red') red++;
            else if (s.meta.tone === 'yellow') yellow++;
            else if (s.meta.tone === 'green') green++;
        }
        return { green, yellow, red };
    }, [services]);

    const worstTone = summaryCounts.red > 0 ? 'red' : summaryCounts.yellow > 0 ? 'yellow' : 'green';
    const accentColor = toneColor(worstTone);

    const toggleExpanded = () => setExpanded((prev) => !prev);

    if (loading) {
        return (
            <div className="dash-usage-glance" style={{ '--usage-accent': '#6b7280' }}>
                <div className="dash-usage-head">
                    <span className="dash-usage-title">
                        <Timer size={15} />
                        <span>Usage</span>
                    </span>
                    <span className="dash-usage-loading">Loading…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="dash-usage-glance" style={{ '--usage-accent': accentColor }}>
            <button
                type="button"
                className="dash-usage-trigger"
                onClick={toggleExpanded}
                aria-expanded={expanded}
                aria-label="Toggle usage limits panel"
            >
                <span className="dash-usage-head">
                    <span className="dash-usage-title">
                        <Timer size={15} />
                        <span>Usage</span>
                    </span>
                    <span className="dash-usage-count">
                        {services.length} service{services.length === 1 ? '' : 's'}
                    </span>
                </span>
                <span className="dash-usage-badges" aria-hidden="true">
                    {services.slice(0, 4).map((service) => (
                        <span
                            key={service.id}
                            className={`dash-usage-badge is-${service.meta.tone}`}
                            title={`${service.name}: ${service.meta.label}`}
                        >
                            <span className="dash-usage-badge-dot" />
                            <span className="dash-usage-badge-label">{service.name.split(' ')[0]}</span>
                            <span className="dash-usage-badge-days">{service.meta.label}</span>
                        </span>
                    ))}
                    {services.length > 4 && (
                        <span className="dash-usage-badge is-more">
                            +{services.length - 4}
                        </span>
                    )}
                </span>
                <span className="dash-usage-chevron">
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
            </button>

            {expanded && (
                <div className="dash-usage-panel">
                    <div className="dash-usage-tz-bar">
                        <Globe size={12} />
                        <span className="dash-usage-tz-label">Timezone</span>
                        {TIMEZONE_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                className={`dash-usage-tz-btn${timezone === opt.value ? ' is-active' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    cycleTimezone(opt.value);
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {services.map((service) => (
                        <ServiceRow
                            key={service.id}
                            service={service}
                            allServices={services}
                            timezone={timezone}
                            onSave={handleSave}
                        />
                    ))}
                    <button
                        type="button"
                        className="dash-usage-add"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleAddService(handleSave, services, setData);
                        }}
                    >
                        <Plus size={13} />
                        Add service
                    </button>
                </div>
            )}
        </div>
    );
}

function ServiceRow({ service, allServices, timezone, onSave }) {
    const [editing, setEditing] = useState(false);
    const { meta } = service;
    const tone = meta.tone;
    const accent = toneColor(tone);

    const updateField = (key, value) => {
        const updated = {
            version: 1,
            timezone: timezone,
            services: allServices.map((s) =>
                s.id === service.id ? { ...s, [key]: value } : s
            ),
        };
        onSave(updated);
    };

    const handleTypeChange = (e) => {
        const val = e.target.value;
        if (val === service.type) return;
        const next = { ...service, type: val };
        if (val === 'balance' && !service.currency) next.currency = 'credits';
        if (val === 'weekly_reset' && !service.reset_cycle) next.reset_cycle = 'weekly';
        const updated = {
            version: 1,
            timezone: timezone,
            services: allServices.map((s) => s.id === service.id ? next : s),
        };
        onSave(updated);
    };

    const handleDelete = () => {
        const updated = {
            version: 1,
            timezone: timezone,
            services: allServices.filter((s) => s.id !== service.id),
        };
        onSave(updated);
    };

    const showUtc = timezone === 'utc' || timezone === 'both';
    const showLocal = timezone === 'local' || timezone === 'both';

    const startEditing = (e) => { e.stopPropagation(); setEditing(true); };
    const stopEditing = (e) => { e.stopPropagation(); setEditing(false); };

    if (editing) {
        return (
            <div className="dash-usage-service is-editing" style={{ '--service-accent': accent }}>
                <div className="dash-usage-service-head">
                    <span className="dash-usage-service-dot" />
                    <input
                        className="dash-usage-edit-name"
                        value={service.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Name for ${service.name}`}
                        autoFocus
                    />
                    <span className={`dash-usage-service-tone is-${tone}`}>{meta.label}</span>
                </div>

                <div className="dash-usage-service-controls">
                    <select
                        className="dash-usage-edit-select"
                        value={service.type}
                        onChange={handleTypeChange}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Service type"
                    >
                        <option value="weekly_reset">Reset (weekly/monthly)</option>
                        <option value="balance">Balance (credits)</option>
                    </select>
                    <button
                        type="button"
                        className="dash-usage-delete"
                        onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                        aria-label={`Delete ${service.name}`}
                        title="Delete service"
                    >
                        ×
                    </button>
                    <button
                        type="button"
                        className="dash-usage-done"
                        onClick={stopEditing}
                        aria-label="Done editing"
                        title="Done"
                    >
                        Done
                    </button>
                </div>

                {meta.type === 'reset' && (
                    <div className="dash-usage-service-detail">
                        <div className="dash-usage-edit-row">
                            <label className="dash-usage-label">Cycle</label>
                            <select
                                className="dash-usage-edit-select-sm"
                                value={service.reset_cycle || 'weekly'}
                                onChange={(e) => { e.stopPropagation(); updateField('reset_cycle', e.target.value); }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                        <div className="dash-usage-edit-row">
                            <label className="dash-usage-label">Reset date</label>
                            <div className="dash-usage-datetime-row">
                                <input
                                    type="date"
                                    className="dash-usage-edit-date"
                                    value={service.reset_date ? service.reset_date.slice(0, 10) : ''}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        const datePart = e.target.value;
                                        const timePart = service.reset_date ? service.reset_date.slice(11, 16) : '00:00';
                                        updateField('reset_date', datePart ? `${datePart}T${timePart}:00` : null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <input
                                    type="time"
                                    className="dash-usage-edit-time"
                                    value={service.reset_date ? service.reset_date.slice(11, 16) : '00:00'}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        const timePart = e.target.value;
                                        const datePart = service.reset_date ? service.reset_date.slice(0, 10) : new Date().toISOString().slice(0, 10);
                                        updateField('reset_date', `${datePart}T${timePart}:00`);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                        <div className="dash-usage-edit-row">
                            <label className="dash-usage-label">Account label</label>
                            <input
                                type="text"
                                className="dash-usage-edit-input"
                                value={service.account_label || ''}
                                placeholder="e.g. toshon.tech@gmail.com"
                                onChange={(e) => updateField('account_label', e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                )}

                {meta.type === 'balance' && (
                    <div className="dash-usage-service-detail">
                        <div className="dash-usage-edit-row">
                            <label className="dash-usage-label">Balance</label>
                            <input
                                type="number"
                                className="dash-usage-edit-input"
                                value={service.balance ?? ''}
                                placeholder="0"
                                onChange={(e) => {
                                    e.stopPropagation();
                                    const val = e.target.value === '' ? null : Number(e.target.value);
                                    updateField('balance', val);
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="dash-usage-edit-row">
                            <label className="dash-usage-label">Currency</label>
                            <input
                                type="text"
                                className="dash-usage-edit-input"
                                value={service.currency || ''}
                                placeholder="credits"
                                onChange={(e) => updateField('currency', e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="dash-usage-edit-row">
                            <label className="dash-usage-label">Daily burn est.</label>
                            <input
                                type="number"
                                className="dash-usage-edit-input"
                                value={service.daily_burn_estimate ?? ''}
                                placeholder="0"
                                onChange={(e) => {
                                    e.stopPropagation();
                                    const val = e.target.value === '' ? null : Number(e.target.value);
                                    updateField('daily_burn_estimate', val);
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <div className="dash-usage-edit-row">
                            <label className="dash-usage-label">Top-up URL</label>
                            <input
                                type="url"
                                className="dash-usage-edit-input"
                                value={service.top_up_url || ''}
                                placeholder="https://..."
                                onChange={(e) => updateField('top_up_url', e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                )}

                <div className="dash-usage-edit-row">
                    <label className="dash-usage-label">Notes</label>
                    <input
                        type="text"
                        className="dash-usage-edit-input"
                        value={service.notes || ''}
                        placeholder="Optional notes..."
                        onChange={(e) => updateField('notes', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </div>
        );
    }

    // View mode — clean, human-readable
    return (
        <div className="dash-usage-service" style={{ '--service-accent': accent }}>
            <div className="dash-usage-service-head">
                <span className="dash-usage-service-dot" />
                <span className="dash-usage-service-name">{service.name}</span>
                <span className={`dash-usage-service-tone is-${tone}`}>{meta.label}</span>
                <button
                    type="button"
                    className="dash-usage-edit-btn"
                    onClick={startEditing}
                    aria-label={`Edit ${service.name}`}
                    title="Edit service"
                >
                    Edit
                </button>
            </div>

            {meta.type === 'reset' && (
                <div className="dash-usage-service-detail">
                    <span className="dash-usage-label">
                        {service.reset_cycle === 'weekly' ? 'Weekly reset' : 'Monthly reset'}
                    </span>
                    {service.reset_date ? (
                        <>
                            {showUtc && (
                                <span className="dash-usage-value">
                                    UTC: {formatDateUtc(service.reset_date)} at {formatTimeUtc(service.reset_date)} ({meta.label})
                                </span>
                            )}
                            {showLocal && (
                                <span className="dash-usage-value is-muted">
                                    Local: {formatDateLocal(service.reset_date)} at {formatTimeLocal(service.reset_date)}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="dash-usage-value is-muted">No reset date set</span>
                    )}
                    {service.account_label && (
                        <span className="dash-usage-value is-muted">{service.account_label}</span>
                    )}
                </div>
            )}

            {meta.type === 'balance' && (
                <div className="dash-usage-service-detail">
                    <span className="dash-usage-label">Balance</span>
                    <span className="dash-usage-value">
                        {formatBalance(service.balance)} {service.currency || ''}
                    </span>
                    {service.daily_burn_estimate != null && (
                        <span className="dash-usage-value is-muted">
                            Daily burn: ~{service.daily_burn_estimate.toLocaleString()}
                        </span>
                    )}
                    {meta.days != null && (
                        <span className="dash-usage-value">
                            Exhausts in: {meta.days}d
                        </span>
                    )}
                    {service.top_up_url && (
                        <a
                            className="dash-usage-topup"
                            href={service.top_up_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink size={12} />
                            Top up
                        </a>
                    )}
                </div>
            )}

            {service.notes && (
                <p className="dash-usage-notes">{service.notes}</p>
            )}
        </div>
    );
}

function handleAddService(onSave, currentServices, setData) {
    const newId = `service-${Date.now()}`;
    const newService = {
        id: newId,
        name: 'New Service',
        type: 'weekly_reset',
        reset_date: null,
        reset_cycle: 'monthly',
        notes: '',
    };
    const updated = {
        version: 1,
        services: [...currentServices, newService],
    };
    onSave(updated);
}
