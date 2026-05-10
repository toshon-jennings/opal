import React, { useState, useRef } from 'react';
import { FileText, Image as ImageIcon, X, FileSpreadsheet, FileType } from 'lucide-react';

export function AttachmentMenu({ onUploadImage, onUploadFile, disabled = false }) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    // Close menu when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled}
                className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors disabled:opacity-50"
                title="Attachments"
                type="button"
            >
                <div className="relative">
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
                    <div className="flex items-center justify-center">
                        <span className="text-xl font-bold">+</span>
                    </div>
                </div>
            </button>

            {isOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-48 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden z-50 py-1">
                    <button
                        onClick={() => { onUploadImage(); setIsOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <ImageIcon size={16} />
                        Upload Image
                    </button>
                    <button
                        onClick={() => { onUploadFile(); setIsOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <FileType size={16} />
                        Attach File
                    </button>
                </div>
            )}
        </div>
    );
}

export function AttachmentPreview({ attachment, onRemove }) {
    const { type, name, previewUrl } = attachment;
    
    let Icon = FileText;
    if (type === 'image') Icon = ImageIcon;
    if (type === 'table') Icon = FileSpreadsheet;

    return (
        <div className="relative flex items-center gap-2 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-md text-xs text-[var(--text-secondary)] max-w-[200px] group">
            {type === 'image' && previewUrl && (
                <img src={previewUrl} alt="preview" className="w-4 h-4 rounded object-cover" />
            )}
            <Icon size={12} className="shrink-0" />
            <span className="truncate max-w-[100px]">{name}</span>
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="ml-1 p-0.5 hover:bg-red-500/20 hover:text-red-500 rounded transition-colors"
                title="Remove"
            >
                <X size={12} />
            </button>
        </div>
    );
}
