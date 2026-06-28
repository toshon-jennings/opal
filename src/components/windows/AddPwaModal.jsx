import { useState, useRef, useEffect } from 'react';
import { Globe, Loader2, X, Plus, ExternalLink } from 'lucide-react';
import { addPwa, originToId, normalizePwaUrl, getPwaRegistry } from '../../lib/pwaRegistry';

// AddPwaModal — modal for registering a new PWA shortcut.
// Props:
//   isOpen: boolean
//   onClose: () => void
//   onAdded: (entry) => void  — called after successful registration so parent can refresh
export default function AddPwaModal({ isOpen, onClose, onAdded }) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState('input'); // 'input' | 'preview' | 'adding' | 'error'
  const [preview, setPreview] = useState(null); // { title, faviconDataUri, origin, url }
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setPhase('input');
      setPreview(null);
      setError('');
      // Focus input after mount
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePreview = async () => {
    setError('');
    const normalized = normalizePwaUrl(url);
    if (!normalized) {
      setError('Please enter a valid URL (e.g. twitter.com or https://example.com)');
      return;
    }

    // Check for duplicate
    const id = originToId(normalized.origin);
    const existing = getPwaRegistry().find((p) => p.id === id);
    if (existing) {
      setError(`"${normalized.origin}" is already added.`);
      return;
    }

    setPhase('preview');

    if (!window.electron?.extractPwaMetadata) {
      // Web fallback — no favicon extraction available
      setPreview({
        title: normalized.origin,
        faviconDataUri: null,
        origin: normalized.origin,
        url: normalized.url,
      });
      return;
    }

    try {
      const result = await window.electron.extractPwaMetadata(normalized.url);
      if (!result?.ok) {
        // Still allow adding even if extraction failed — use fallback
        setPreview({
          title: normalized.origin,
          faviconDataUri: null,
          origin: normalized.origin,
          url: normalized.url,
        });
        return;
      }
      setPreview({
        title: result.title || normalized.origin,
        faviconDataUri: result.faviconDataUri || null,
        origin: result.origin || normalized.origin,
        url: result.url || normalized.url,
      });
    } catch (err) {
      // Extraction failed — still allow adding with fallback
      setPreview({
        title: normalized.origin,
        faviconDataUri: null,
        origin: normalized.origin,
        url: normalized.url,
      });
    }
  };

  const handleAdd = () => {
    if (!preview) return;
    setPhase('adding');

    const entry = {
      id: originToId(preview.origin),
      url: preview.url,
      origin: preview.origin,
      title: preview.title,
      favicon: preview.faviconDataUri,
      hue: '#6b7280',
      addedAt: new Date().toISOString(),
    };

    addPwa(entry);
    onAdded(entry);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (phase === 'input') handlePreview();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Add Web App
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {phase === 'input' && (
            <>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                URL
              </label>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="twitter.com or https://example.com"
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={!url.trim()}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  Preview
                </button>
              </div>
              {error && (
                <p className="mt-2 text-xs text-red-500">{error}</p>
              )}
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                The site's icon will be used as the tile logo.
              </p>
            </>
          )}

          {phase === 'preview' && preview && (
            <>
              <p className="mb-3 text-xs font-medium text-[var(--text-secondary)]">
                Preview
              </p>
              <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                  {preview.faviconDataUri ? (
                    <img
                      src={preview.faviconDataUri}
                      alt=""
                      className="h-8 w-8 object-contain"
                    />
                  ) : (
                    <Globe size={24} className="text-[var(--text-tertiary)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {preview.title}
                  </p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">
                    {preview.origin}
                  </p>
                </div>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  aria-label="Open in browser"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
              {error && (
                <p className="mt-2 text-xs text-red-500">{error}</p>
              )}
            </>
          )}

          {phase === 'adding' && (
            <div className="flex items-center gap-3 py-4">
              <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
              <span className="text-sm text-[var(--text-secondary)]">Adding...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'preview' && preview && (
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
            <button
              type="button"
              onClick={() => { setPhase('input'); setPreview(null); }}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Add to Perci
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
