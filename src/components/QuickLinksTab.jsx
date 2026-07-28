import { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Search, ExternalLink, Edit3, Trash2, FolderPlus, Grid, List, Bookmark, ChevronUp, ChevronDown, X, Link2, RefreshCw } from 'lucide-react';
import { readJsonStorage, writeJsonStorage } from '../lib/persistentStore';

const CATEGORY_COLORS = [
    '#10b981', // Emerald / Dev
    '#8b5cf6', // Purple / Design
    '#f59e0b', // Amber / Research
    '#ef4444', // Red / Communication
    '#06b6d4', // Cyan / Productivity
    '#ec4899', // Pink
    '#3b82f6', // Blue
    '#64748b', // Slate
];

const DEFAULT_CATEGORIES = [
    { id: 'cat-dev', name: 'Development', color: '#10b981', order: 0 },
    { id: 'cat-design', name: 'Design', color: '#8b5cf6', order: 1 },
    { id: 'cat-research', name: 'Research', color: '#f59e0b', order: 2 },
    { id: 'cat-comm', name: 'Communication', color: '#ef4444', order: 3 },
    { id: 'cat-prod', name: 'Productivity', color: '#06b6d4', order: 4 },
];

function extractDomain(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        return parsed.hostname;
    } catch {
        return url;
    }
}

function getFaviconUrl(url) {
    const domain = extractDomain(url);
    if (!domain) return null;
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;
}

function cleanUrlDisplay(url) {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

const DEFAULT_LINKS = [
    {
        id: 'link-1',
        title: 'GitHub',
        url: 'https://github.com',
        description: 'Code hosting & version control',
        categoryId: 'cat-dev',
        favicon: getFaviconUrl('https://github.com'),
        createdAt: Date.now(),
    },
    {
        id: 'link-2',
        title: 'Stack Overflow',
        url: 'https://stackoverflow.com',
        description: 'Developer Q&A and knowledge sharing',
        categoryId: 'cat-dev',
        favicon: getFaviconUrl('https://stackoverflow.com'),
        createdAt: Date.now() + 1,
    },
    {
        id: 'link-3',
        title: 'Tailwind CSS',
        url: 'https://tailwindcss.com',
        description: 'Rapid UI development framework',
        categoryId: 'cat-design',
        favicon: getFaviconUrl('https://tailwindcss.com'),
        createdAt: Date.now() + 2,
    },
    {
        id: 'link-4',
        title: 'Figma',
        url: 'https://figma.com',
        description: 'Interface design and prototyping',
        categoryId: 'cat-design',
        favicon: getFaviconUrl('https://figma.com'),
        createdAt: Date.now() + 3,
    },
    {
        id: 'link-5',
        title: 'Google Scholar',
        url: 'https://scholar.google.com',
        description: 'Academic articles and citations',
        categoryId: 'cat-research',
        favicon: getFaviconUrl('https://scholar.google.com'),
        createdAt: Date.now() + 4,
    },
    {
        id: 'link-6',
        title: 'Discord',
        url: 'https://discord.com',
        description: 'Community chat & discussions',
        categoryId: 'cat-comm',
        favicon: getFaviconUrl('https://discord.com'),
        createdAt: Date.now() + 5,
    },
    {
        id: 'link-7',
        title: 'Notion',
        url: 'https://notion.so',
        description: 'Notes, docs & workspace',
        categoryId: 'cat-prod',
        favicon: getFaviconUrl('https://notion.so'),
        createdAt: Date.now() + 6,
    },
];

const STORAGE_KEYS = {
    CATEGORIES: 'perci_quicklinks_categories',
    LINKS: 'perci_quicklinks_links',
};

/**
 * Robust Favicon component with multi-stage fallback chain:
 * 1. gstatic faviconV2 (Direct 200 PNG)
 * 2. IconHorse API (https://icon.horse/icon/${domain})
 * 3. Google s2 (https://www.google.com/s2/favicons?domain=${domain}&sz=64)
 * 4. DuckDuckGo ico (https://icons.duckduckgo.com/ip3/${domain}.ico)
 * 5. Direct origin favicon.ico
 * 6. Clean Letter Avatar Badge
 */
function FaviconImage({ link, categoryColor, className = "h-5 w-5" }) {
    const domain = extractDomain(link.url);
    const initialFavicon = link.favicon && !link.favicon.includes('sz=128')
        ? link.favicon
        : getFaviconUrl(link.url);

    const [imgSrc, setImgSrc] = useState(initialFavicon);
    const [failed, setFailed] = useState(false);
    const [retryStep, setRetryStep] = useState(0);

    useEffect(() => {
        const fresh = link.favicon && !link.favicon.includes('sz=128')
            ? link.favicon
            : getFaviconUrl(link.url);
        setImgSrc(fresh);
        setFailed(false);
        setRetryStep(0);
    }, [link.favicon, link.url]);

    const handleImgError = () => {
        if (retryStep === 0) {
            // Step 1: IconHorse
            setRetryStep(1);
            setImgSrc(`https://icon.horse/icon/${domain}`);
        } else if (retryStep === 1) {
            // Step 2: Google s2
            setRetryStep(2);
            setImgSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
        } else if (retryStep === 2) {
            // Step 3: DuckDuckGo
            setRetryStep(3);
            setImgSrc(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
        } else if (retryStep === 3) {
            // Step 4: Direct Origin favicon
            setRetryStep(4);
            setImgSrc(`https://${domain}/favicon.ico`);
        } else {
            // Final: Letter Avatar
            setFailed(true);
        }
    };

    if (failed || !imgSrc) {
        const initial = (link.title || domain || '?')[0].toUpperCase();
        return (
            <div
                className="flex h-full w-full items-center justify-center rounded-lg font-bold text-white shadow-xs select-none text-xs"
                style={{ backgroundColor: categoryColor || '#64748b' }}
                title={link.title}
            >
                {initial}
            </div>
        );
    }

    return (
        <img
            src={imgSrc}
            alt=""
            className={`${className} object-contain`}
            onError={handleImgError}
        />
    );
}

export default function QuickLinksTab({ onNavigate, isKlipit }) {
    const [categories, setCategories] = useState(() => {
        return readJsonStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    });

    const [links, setLinks] = useState(() => {
        const loaded = readJsonStorage(STORAGE_KEYS.LINKS, DEFAULT_LINKS);
        // Automatically migrate any stored links missing favicons or having outdated sz=128 URLs
        const migrated = loaded.map(link => {
            const freshFavicon = getFaviconUrl(link.url);
            if (!link.favicon || link.favicon.includes('sz=128')) {
                return { ...link, favicon: freshFavicon };
            }
            return link;
        });
        return migrated;
    });

    const [selectedCategoryId, setSelectedCategoryId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

    // Modals
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [editingLink, setEditingLink] = useState(null);
    const [linkFormData, setLinkFormData] = useState({ title: '', url: '', description: '', categoryId: '', favicon: '' });

    const [catModalOpen, setCatModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [catFormData, setCatFormData] = useState({ name: '', color: CATEGORY_COLORS[0] });

    // Save helper
    const saveCategories = useCallback((nextCats) => {
        setCategories(nextCats);
        writeJsonStorage(STORAGE_KEYS.CATEGORIES, nextCats);
    }, []);

    const saveLinks = useCallback((nextLinks) => {
        setLinks(nextLinks);
        writeJsonStorage(STORAGE_KEYS.LINKS, nextLinks);
    }, []);

    // Link Actions
    const handleOpenLinkModal = (linkToEdit = null, presetCatId = '') => {
        if (linkToEdit) {
            setEditingLink(linkToEdit);
            setLinkFormData({
                title: linkToEdit.title,
                url: linkToEdit.url,
                description: linkToEdit.description || '',
                categoryId: linkToEdit.categoryId,
                favicon: linkToEdit.favicon || '',
            });
        } else {
            setEditingLink(null);
            setLinkFormData({
                title: '',
                url: '',
                description: '',
                categoryId: presetCatId || (selectedCategoryId !== 'all' ? selectedCategoryId : categories[0]?.id || ''),
                favicon: '',
            });
        }
        setLinkModalOpen(true);
    };

    const handleSaveLink = (e) => {
        e.preventDefault();
        const rawUrl = linkFormData.url.trim();
        if (!rawUrl) return;

        const formattedUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
            ? rawUrl
            : `https://${rawUrl}`;

        const categoryId = linkFormData.categoryId || categories[0]?.id || 'cat-dev';
        const title = linkFormData.title.trim() || cleanUrlDisplay(formattedUrl);
        const favicon = linkFormData.favicon.trim() || getFaviconUrl(formattedUrl);

        if (editingLink) {
            const next = links.map(l => l.id === editingLink.id
                ? { ...l, title, url: formattedUrl, description: linkFormData.description.trim(), categoryId, favicon, updatedAt: Date.now() }
                : l
            );
            saveLinks(next);
        } else {
            const newLink = {
                id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title,
                url: formattedUrl,
                description: linkFormData.description.trim(),
                categoryId,
                favicon,
                createdAt: Date.now(),
            };
            saveLinks([...links, newLink]);
        }
        setLinkModalOpen(false);
    };

    const handleDeleteLink = (id) => {
        saveLinks(links.filter(l => l.id !== id));
    };

    const handleMoveLink = (linkId, direction) => {
        const index = links.findIndex(l => l.id === linkId);
        if (index === -1) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= links.length) return;

        const cloned = [...links];
        const [moved] = cloned.splice(index, 1);
        cloned.splice(targetIndex, 0, moved);
        saveLinks(cloned);
    };

    const handleRefreshFavicon = (link) => {
        const domain = extractDomain(link.url);
        const nextFavicon = `https://icon.horse/icon/${domain}`;
        const updated = links.map(l => l.id === link.id ? { ...l, favicon: nextFavicon } : l);
        saveLinks(updated);
    };

    const handleResetAllFavicons = () => {
        const reset = links.map(l => ({ ...l, favicon: getFaviconUrl(l.url) }));
        saveLinks(reset);
    };

    // Category Actions
    const handleOpenCatModal = (catToEdit = null) => {
        if (catToEdit) {
            setEditingCategory(catToEdit);
            setCatFormData({ name: catToEdit.name, color: catToEdit.color });
        } else {
            setEditingCategory(null);
            setCatFormData({ name: '', color: CATEGORY_COLORS[0] });
        }
        setCatModalOpen(true);
    };

    const handleSaveCategory = (e) => {
        e.preventDefault();
        const name = catFormData.name.trim();
        if (!name) return;

        if (editingCategory) {
            const next = categories.map(c => c.id === editingCategory.id
                ? { ...c, name, color: catFormData.color }
                : c
            );
            saveCategories(next);
        } else {
            const newCat = {
                id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name,
                color: catFormData.color,
                order: categories.length,
            };
            saveCategories([...categories, newCat]);
        }
        setCatModalOpen(false);
    };

    const handleDeleteCategory = (catId) => {
        if (categories.length <= 1) return;
        const remainingCats = categories.filter(c => c.id !== catId);
        const fallbackCatId = remainingCats[0].id;

        // Reassign links in deleted category to fallback category
        const updatedLinks = links.map(l => l.categoryId === catId ? { ...l, categoryId: fallbackCatId } : l);

        saveCategories(remainingCats);
        saveLinks(updatedLinks);
        if (selectedCategoryId === catId) {
            setSelectedCategoryId('all');
        }
    };

    // Filtering logic
    const filteredLinks = useMemo(() => {
        return links.filter(link => {
            const matchesCat = selectedCategoryId === 'all' || link.categoryId === selectedCategoryId;
            const query = searchQuery.toLowerCase().trim();
            const matchesSearch = !query || (
                link.title.toLowerCase().includes(query) ||
                link.url.toLowerCase().includes(query) ||
                (link.description && link.description.toLowerCase().includes(query))
            );
            return matchesCat && matchesSearch;
        });
    }, [links, selectedCategoryId, searchQuery]);

    // Grouping by category
    const linksByCategory = useMemo(() => {
        const groups = [];
        categories.forEach(cat => {
            const catLinks = filteredLinks.filter(l => l.categoryId === cat.id);
            if (catLinks.length > 0 || (selectedCategoryId === cat.id && !searchQuery)) {
                groups.push({ category: cat, links: catLinks });
            }
        });
        return groups;
    }, [categories, filteredLinks, selectedCategoryId, searchQuery]);

    const themeBorderClass = isKlipit ? 'border-[#dac39c] dark:border-[#322c20]' : 'border-[var(--border)]';
    const themeBgHeaderClass = isKlipit ? 'bg-[#f1e4cf] dark:bg-[#141009]' : 'bg-[var(--bg-secondary)]/40';
    const themeCardClass = isKlipit
        ? 'border-[#dac39c] dark:border-[#494030] bg-[#fff8e9] dark:bg-[#211c14] hover:border-[#c5ab82] dark:hover:border-[#63533c]'
        : 'border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent)]/50';

    return (
        <div className="flex h-full w-full flex-col bg-[var(--bg-primary)] overflow-hidden">
            {/* Header Controls */}
            <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 ${themeBorderClass} ${themeBgHeaderClass}`}>
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-sm">
                        <Bookmark size={16} className="text-[var(--accent)]" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">QuickLinks</h2>
                        <p className="text-[11px] text-[var(--text-tertiary)]">{links.length} total saved links</p>
                    </div>
                </div>

                {/* Search & Actions */}
                <div className="flex items-center gap-2">
                    {/* Search Input */}
                    <div className="relative flex items-center">
                        <Search size={13} className="absolute left-2.5 text-[var(--text-tertiary)] pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter links..."
                            className="h-8 w-44 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] pl-8 pr-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex items-center rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`rounded p-1 transition-colors ${viewMode === 'grid' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                            title="Grid view"
                        >
                            <Grid size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={`rounded p-1 transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                            title="List view"
                        >
                            <List size={14} />
                        </button>
                    </div>

                    {/* Refresh Favicons Button */}
                    <button
                        type="button"
                        onClick={handleResetAllFavicons}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Re-sync all favicons"
                    >
                        <RefreshCw size={13} />
                        <span className="hidden md:inline">Favicons</span>
                    </button>

                    {/* Add Category Button */}
                    <button
                        type="button"
                        onClick={() => handleOpenCatModal()}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Add Category"
                    >
                        <FolderPlus size={13} />
                        <span className="hidden sm:inline">Category</span>
                    </button>

                    {/* Add Link Button */}
                    <button
                        type="button"
                        onClick={() => handleOpenLinkModal()}
                        className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-[var(--accent-hover)]"
                        title="Add Link"
                    >
                        <Plus size={14} />
                        <span>Add Link</span>
                    </button>
                </div>
            </div>

            {/* Category Filter Pills Bar */}
            <div className={`flex items-center gap-1.5 overflow-x-auto border-b px-4 py-2 text-xs scrollbar-none ${themeBorderClass} bg-[var(--bg-secondary)]/10`}>
                <button
                    type="button"
                    onClick={() => setSelectedCategoryId('all')}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                        selectedCategoryId === 'all'
                            ? 'bg-[var(--accent)] text-white shadow-xs'
                            : 'border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                >
                    <span>All</span>
                    <span className={`rounded-md px-1.5 py-0.2 text-[10px] ${selectedCategoryId === 'all' ? 'bg-white/20 text-white' : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]'}`}>
                        {links.length}
                    </span>
                </button>

                {categories.map((cat) => {
                    const count = links.filter(l => l.categoryId === cat.id).length;
                    const isSelected = selectedCategoryId === cat.id;
                    return (
                        <div key={cat.id} className="group relative flex items-center shrink-0">
                            <button
                                type="button"
                                onClick={() => setSelectedCategoryId(cat.id)}
                                onDoubleClick={() => handleOpenCatModal(cat)}
                                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                                    isSelected
                                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)] pr-7'
                                        : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                                }`}
                                title="Click to filter, double click to edit title"
                            >
                                <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ backgroundColor: cat.color }} />
                                <span>{cat.name}</span>
                                <span className="text-[10px] text-[var(--text-tertiary)]">({count})</span>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenCatModal(cat);
                                }}
                                className={`absolute right-1.5 p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-hover)] transition-opacity ${
                                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                }`}
                                title="Edit category title & color"
                            >
                                <Edit3 size={11} />
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Main Links Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {filteredLinks.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-tertiary)]">
                            <Bookmark size={22} />
                        </div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">No QuickLinks found</h3>
                        <p className="mt-1 max-w-xs text-xs text-[var(--text-tertiary)]">
                            {searchQuery ? `No links matching "${searchQuery}"` : 'Add your frequently used websites and tools here.'}
                        </p>
                        <button
                            type="button"
                            onClick={() => handleOpenLinkModal()}
                            className="mt-4 flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                        >
                            <Plus size={13} />
                            Add First Link
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {linksByCategory.map(({ category, links: catLinks }) => (
                            <div key={category.id} className="flex flex-col gap-2.5">
                                {/* Category Header */}
                                <div className="flex items-center justify-between border-b border-[var(--border)]/60 pb-1.5">
                                    <div
                                        className="group/title flex items-center gap-2 cursor-pointer"
                                        onClick={() => handleOpenCatModal(category)}
                                        title="Click to edit category title & color"
                                    >
                                        <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: category.color }} />
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] group-hover/title:text-[var(--accent)] group-hover/title:underline">
                                            {category.name}
                                        </h3>
                                        <Edit3 size={11} className="opacity-0 group-hover/title:opacity-100 text-[var(--text-tertiary)] transition-opacity" />
                                        <span className="text-xs text-[var(--text-tertiary)]">({catLinks.length})</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleOpenLinkModal(null, category.id)}
                                            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                            title="Add link to category"
                                        >
                                            <Plus size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleOpenCatModal(category)}
                                            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                            title="Edit category title & color"
                                        >
                                            <Edit3 size={13} />
                                        </button>
                                        {categories.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteCategory(category.id)}
                                                className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-red-400"
                                                title="Delete category"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                 {/* Category Links Grid / List */}
                                {viewMode === 'grid' ? (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {catLinks.map((link) => (
                                            <div
                                                key={link.id}
                                                className={`group relative flex flex-col justify-between rounded-xl border p-3.5 shadow-xs transition-all duration-200 hover:shadow-md ${themeCardClass}`}
                                            >
                                                <div className="flex items-start gap-3 min-w-0">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-2xs">
                                                        <FaviconImage link={link} categoryColor={category.color} className="h-5 w-5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="truncate text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                                                            {link.title}
                                                        </h4>
                                                        <p className="truncate text-[11px] text-[var(--text-tertiary)] mt-0.5">
                                                            {cleanUrlDisplay(link.url)}
                                                        </p>
                                                        {link.description && (
                                                            <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                                                                {link.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Card Bottom / Action Bar */}
                                                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)]/40 pt-2 text-[11px]">
                                                    <button
                                                        type="button"
                                                        onClick={() => onNavigate?.(link.url)}
                                                        className="flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                                                    >
                                                        <span>Open tab</span>
                                                        <ExternalLink size={11} />
                                                    </button>
                                                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRefreshFavicon(link)}
                                                            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                                            title="Refresh favicon"
                                                        >
                                                            <RefreshCw size={11} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleMoveLink(link.id, 'up')}
                                                            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                                            title="Move up"
                                                        >
                                                            <ChevronUp size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleMoveLink(link.id, 'down')}
                                                            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                                            title="Move down"
                                                        >
                                                            <ChevronDown size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenLinkModal(link)}
                                                            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                                            title="Edit link"
                                                        >
                                                            <Edit3 size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteLink(link.id)}
                                                            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-red-400"
                                                            title="Delete link"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    /* List View */
                                    <div className="flex flex-col gap-1.5">
                                        {catLinks.map((link) => (
                                            <div
                                                key={link.id}
                                                className={`group flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${themeCardClass}`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white p-1 shadow-2xs">
                                                        <FaviconImage link={link} categoryColor={category.color} className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => onNavigate?.(link.url)}
                                                                className="truncate text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline text-left"
                                                            >
                                                                {link.title}
                                                            </button>
                                                            <span className="truncate text-[11px] text-[var(--text-tertiary)]">
                                                                — {cleanUrlDisplay(link.url)}
                                                            </span>
                                                        </div>
                                                        {link.description && (
                                                            <p className="truncate text-[11px] text-[var(--text-secondary)]">
                                                                {link.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => onNavigate?.(link.url)}
                                                        className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)]"
                                                    >
                                                        <span>Open</span>
                                                        <ExternalLink size={10} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenLinkModal(link)}
                                                        className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Edit"
                                                    >
                                                        <Edit3 size={12} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteLink(link.id)}
                                                        className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add / Edit Link Modal */}
            {linkModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                                {editingLink ? 'Edit QuickLink' : 'Add New QuickLink'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setLinkModalOpen(false)}
                                className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveLink} className="flex flex-col gap-3.5">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">URL *</label>
                                <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5">
                                    <Link2 size={13} className="text-[var(--text-tertiary)] shrink-0" />
                                    <input
                                        type="text"
                                        required
                                        value={linkFormData.url}
                                        onChange={(e) => setLinkFormData({ ...linkFormData, url: e.target.value })}
                                        placeholder="e.g. github.com or https://example.com"
                                        className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Title</label>
                                <input
                                    type="text"
                                    value={linkFormData.title}
                                    onChange={(e) => setLinkFormData({ ...linkFormData, title: e.target.value })}
                                    placeholder="Link name (optional, defaults to domain)"
                                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Category</label>
                                <select
                                    value={linkFormData.categoryId}
                                    onChange={(e) => setLinkFormData({ ...linkFormData, categoryId: e.target.value })}
                                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
                                >
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Favicon URL (Optional)</label>
                                <input
                                    type="text"
                                    value={linkFormData.favicon}
                                    onChange={(e) => setLinkFormData({ ...linkFormData, favicon: e.target.value })}
                                    placeholder="Auto-detected if left empty"
                                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Description</label>
                                <textarea
                                    value={linkFormData.description}
                                    onChange={(e) => setLinkFormData({ ...linkFormData, description: e.target.value })}
                                    placeholder="Brief summary or notes..."
                                    rows={2}
                                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none resize-none"
                                />
                            </div>

                            <div className="mt-2 flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                                <button
                                    type="button"
                                    onClick={() => setLinkModalOpen(false)}
                                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
                                >
                                    {editingLink ? 'Save Changes' : 'Add Link'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add / Edit Category Modal */}
            {catModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-2xl">
                        <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                                {editingCategory ? 'Edit Category' : 'Add Category'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setCatModalOpen(false)}
                                className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveCategory} className="flex flex-col gap-3.5">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Category Name *</label>
                                <input
                                    type="text"
                                    required
                                    value={catFormData.name}
                                    onChange={(e) => setCatFormData({ ...catFormData, name: e.target.value })}
                                    placeholder="e.g. Work, Tools, AI"
                                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Color Accent</label>
                                <div className="flex flex-wrap gap-2">
                                    {CATEGORY_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setCatFormData({ ...catFormData, color })}
                                            className={`h-7 w-7 rounded-lg transition-transform hover:scale-110 ${
                                                catFormData.color === color ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-primary)]' : ''
                                            }`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="mt-2 flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                                <button
                                    type="button"
                                    onClick={() => setCatModalOpen(false)}
                                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
                                >
                                    {editingCategory ? 'Save Changes' : 'Create Category'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
