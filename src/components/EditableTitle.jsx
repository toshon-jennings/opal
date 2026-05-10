import React, { useState, useRef, useEffect } from 'react';
import { Edit2, Check, X } from 'lucide-react';

export function EditableTitle({ initialTitle, onSave, className = "", textClassName = "" }) {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(initialTitle);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleSave = () => {
        if (title.trim() && title !== initialTitle) {
            onSave(title.trim());
        } else {
            setTitle(initialTitle);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setTitle(initialTitle);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div className={`flex items-center gap-1 w-full ${className}`} onClick={e => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSave}
                    className={`bg-[var(--bg-primary)] border border-[var(--accent)] rounded px-1.5 py-0.5 text-sm w-full outline-none text-[var(--text-primary)] font-medium`}
                />
            </div>
        );
    }

    return (
        <div className={`group flex items-center gap-2 min-w-0 ${className}`}>
            <div className={`truncate ${textClassName}`}>
                {initialTitle}
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--bg-hover)] rounded transition-all shrink-0"
            >
                <Edit2 size={12} className="text-[var(--text-tertiary)] hover:text-[var(--accent)]" />
            </button>
        </div>
    );
}
