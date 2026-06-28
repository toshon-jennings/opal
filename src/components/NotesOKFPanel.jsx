import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, FileText, Link, Calendar, Tag, Type, AlignLeft, X } from 'lucide-react';

const OKF_TYPES = ['Note', 'Decision', 'Concept', 'Reference', 'Playbook', 'Entity'];

export function NotesOKFPanel({ fields, onFieldChange, onTagsChange, disabled }) {
    const [expanded, setExpanded] = useState(false);
    const [tagInput, setTagInput] = useState('');

    useEffect(() => {
        setTagInput('');
    }, [fields.title]);

    const handleFieldUpdate = useCallback((key, value) => {
        onFieldChange({ ...fields, [key]: value });
    }, [fields, onFieldChange]);

    const handleAddTag = useCallback(() => {
        const tag = tagInput.trim();
        if (!tag) return;
        if (fields.tags.includes(tag)) {
            setTagInput('');
            return;
        }
        onTagsChange([...fields.tags, tag]);
        setTagInput('');
    }, [tagInput, fields.tags, onTagsChange]);

    const handleRemoveTag = useCallback((tagToRemove) => {
        onTagsChange(fields.tags.filter(t => t !== tagToRemove));
    }, [fields.tags, onTagsChange]);

    const handleTagKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
            e.preventDefault();
            handleAddTag();
        }
        if (e.key === 'Backspace' && !tagInput && fields.tags.length > 0) {
            handleRemoveTag(fields.tags[fields.tags.length - 1]);
        }
    };

    const summaryParts = [];
    if (fields.type) summaryParts.push(`type: ${fields.type}`);
    if (fields.tags.length > 0) summaryParts.push(`${fields.tags.length} tag${fields.tags.length > 1 ? 's' : ''}`);
    if (fields.title) summaryParts.push(fields.title);
    const summary = summaryParts.join(' | ') || 'No metadata';

    return (
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)] select-none">
            {/* Collapsible Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-1.5 flex items-center gap-2 text-xs hover:bg-[var(--bg-hover)] transition-colors"
            >
                {expanded ? (
                    <ChevronUp size={12} className="text-[var(--text-tertiary)]" />
                ) : (
                    <ChevronDown size={12} className="text-[var(--text-tertiary)]" />
                )}
                <span className="font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    OKF
                </span>
                <span className="text-[var(--text-secondary)] truncate flex-1 text-left">
                    {summary}
                </span>
            </button>

            {/* Expanded Fields */}
            {expanded && (
                <div className="px-4 pb-3 space-y-2 border-t border-[var(--border)]/50">
                    {/* Type + Title Row */}
                    <div className="flex items-center gap-3 pt-2">
                        <div className="flex-1">
                            <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                                <Type size={10} />
                                Type
                            </label>
                            <select
                                value={fields.type}
                                onChange={(e) => handleFieldUpdate('type', e.target.value)}
                                disabled={disabled}
                                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                            >
                                {OKF_TYPES.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-[2]">
                            <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                                <FileText size={10} />
                                Title
                            </label>
                            <input
                                type="text"
                                value={fields.title}
                                onChange={(e) => handleFieldUpdate('title', e.target.value)}
                                disabled={disabled}
                                placeholder="Auto-derived from H1 or filename"
                                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder-[var(--text-tertiary)] disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                            <AlignLeft size={10} />
                            Description
                        </label>
                        <input
                            type="text"
                            value={fields.description}
                            onChange={(e) => handleFieldUpdate('description', e.target.value)}
                            disabled={disabled}
                            placeholder="Auto-derived from first line"
                            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder-[var(--text-tertiary)] disabled:opacity-50"
                        />
                    </div>

                    {/* Resource */}
                    <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                            <Link size={10} />
                            Resource (URL)
                        </label>
                        <input
                            type="url"
                            value={fields.resource}
                            onChange={(e) => handleFieldUpdate('resource', e.target.value)}
                            disabled={disabled}
                            placeholder="https://..."
                            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder-[var(--text-tertiary)] disabled:opacity-50"
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                            <Tag size={10} />
                            Tags
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {fields.tags.map(tag => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]"
                                >
                                    #{tag}
                                    {!disabled && (
                                        <button
                                            onClick={() => handleRemoveTag(tag)}
                                            className="text-[var(--text-tertiary)] hover:text-rose-300 transition-colors"
                                        >
                                            <X size={8} />
                                        </button>
                                    )}
                                </span>
                            ))}
                            {!disabled && (
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={handleTagKeyDown}
                                    onBlur={handleAddTag}
                                    placeholder="Add tag..."
                                    className="min-w-[5rem] flex-1 bg-transparent text-[10px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none"
                                />
                            )}
                        </div>
                    </div>

                    {/* Timestamp (read-only, auto-managed) */}
                    <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                            <Calendar size={10} />
                            Timestamp
                        </label>
                        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                            {fields.timestamp || 'Auto-set on save'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
