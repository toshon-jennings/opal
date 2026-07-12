import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Tv, Search, RefreshCw, Star, Globe, Loader2, X,
  ChevronLeft, ChevronRight, ListFilter, Heart, Zap, Youtube, Video, Plus, Trash2
} from 'lucide-react';
import RetroTvPlayer from './RetroTvPlayer';
import useIptvPlaylist from '../hooks/useIptvPlaylist';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';
import './IptvMode.css';

// ── YouTube Helpers ─────────────────────────────────────────────────────────

const YOUTUBE_WIDGET_REFERRER = 'https://com.perci.ai/';

function buildYouTubeEmbedUrl(path, params) {
  const embedUrl = new URL(path, 'https://www.youtube.com');
  for (const [key, value] of Object.entries(params)) {
    embedUrl.searchParams.set(key, value);
  }
  embedUrl.searchParams.set('widget_referrer', YOUTUBE_WIDGET_REFERRER);
  return embedUrl.toString();
}

function isYouTubeChannelUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes('youtube.com') && urlObj.hostname !== 'youtu.be') return false;
    const path = urlObj.pathname;
    // Channel patterns: /@handle, /channel/ID, /c/name, /user/name
    return /^\/@[^/]+\/?$/.test(path) ||
           /^\/channel\/[^/]+\/?$/.test(path) ||
           /^\/c\/[^/]+\/?$/.test(path) ||
           /^\/user\/[^/]+\/?$/.test(path);
  } catch (e) {
    return false;
  }
}

function isYouTubeVideoUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'youtu.be') return urlObj.pathname.length > 1;
    if (!urlObj.hostname.includes('youtube.com')) return false;
    return Boolean(
      urlObj.searchParams.get('v') ||
      urlObj.pathname.startsWith('/embed/') ||
      urlObj.pathname.startsWith('/shorts/')
    );
  } catch {
    return /(?:v=|youtu\.be\/|embed\/|shorts\/)[^?&%#\s]+/.test(url);
  }
}

function extractVimeoId(url) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    if (!/(^|\.)vimeo\.com$/.test(urlObj.hostname)) return null;
    const match = urlObj.pathname.match(/(?:\/video)?\/(\d+)/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function isSupportedVideoUrl(url) {
  return isYouTubeVideoUrl(url) || Boolean(extractVimeoId(url));
}

function extractChannelId(url) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    // /@handle
    const handleMatch = path.match(/^\/@([^/]+)\/?$/);
    if (handleMatch) return `@${handleMatch[1]}`;
    // /channel/UC...
    const channelMatch = path.match(/^\/channel\/([^/]+)\/?$/);
    if (channelMatch) return channelMatch[1];
    // /c/name or /user/name
    const userMatch = path.match(/^\/(?:c|user)\/([^/]+)\/?$/);
    if (userMatch) return userMatch[1];
  } catch {
    return null;
  }
  return null;
}

function getYouTubeEmbedUrl(url) {
  if (!url) return null;

  // Check if it's a channel URL
  if (isYouTubeChannelUrl(url)) {
    const channelId = extractChannelId(url);
    if (channelId) {
      // Use live_stream embed for channels and keep YouTube's native controls
      // visible; without them Electron can render the live player at a tiny
      // intrinsic size inside the otherwise full-size webview.
      return buildYouTubeEmbedUrl('/embed/live_stream', {
        channel: channelId,
        autoplay: '1',
        mute: '1',
        controls: '1',
        playsinline: '1',
      });
    }
    return null;
  }

  // Video URL handling
  let videoId = null;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'youtu.be') {
      videoId = urlObj.pathname.slice(1);
    } else if (urlObj.hostname.includes('youtube.com')) {
      videoId = urlObj.searchParams.get('v');
      if (!videoId && urlObj.pathname.startsWith('/embed/')) {
        videoId = urlObj.pathname.split('/')[2];
      } else if (!videoId && urlObj.pathname.startsWith('/shorts/')) {
        videoId = urlObj.pathname.split('/')[2];
      }
    }
  } catch {
    // Fall back to loose matching below for pasted fragments.
  }

  if (!videoId) {
    const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^?&%#\s]+)/);
    if (match) videoId = match[1];
  }

  if (!videoId) return null;
  return buildYouTubeEmbedUrl(`/embed/${videoId}`, {
    autoplay: '1',
    mute: '1',
    rel: '0',
    controls: '1',
  });
}

function getVideoEmbedUrl(url) {
  const vimeoId = extractVimeoId(url);
  if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1`;
  return getYouTubeEmbedUrl(url);
}

function getVideoProvider(url) {
  return extractVimeoId(url) ? 'vimeo' : 'youtube';
}

function extractYouTubeId(url) {
  if (!url) return null;

  // Check for channel URL first
  if (isYouTubeChannelUrl(url)) {
    const channelId = extractChannelId(url);
    return channelId ? `channel:${channelId}` : null;
  }

  // Video URL handling
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'youtu.be') return urlObj.pathname.slice(1);
    if (urlObj.hostname.includes('youtube.com')) {
      const v = urlObj.searchParams.get('v');
      if (v) return v;
      if (urlObj.pathname.startsWith('/embed/')) return urlObj.pathname.split('/')[2];
      if (urlObj.pathname.startsWith('/shorts/')) return urlObj.pathname.split('/')[2];
    }
  } catch {
    // Fall back to loose matching below for pasted fragments.
  }
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^?&%#\s]+)/);
  return match ? match[1] : null;
}

function loadYouTubeBookmarks() {
  try {
    return JSON.parse(readStringStorage('perci_iptv_youtube_bookmarks', '[]'));
  } catch {
    return [];
  }
}

function saveYouTubeBookmarks(bookmarks) {
  writeStringStorage('perci_iptv_youtube_bookmarks', JSON.stringify(bookmarks));
}

async function fetchVideoTitle(url) {
  try {
    const endpoint = new URL(
      getVideoProvider(url) === 'vimeo'
        ? 'https://vimeo.com/api/oembed.json'
        : 'https://www.youtube.com/oembed'
    );
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('format', 'json');
    const response = await fetch(endpoint);
    if (!response.ok) return null;
    const metadata = await response.json();
    return typeof metadata.title === 'string' ? metadata.title.trim() : null;
  } catch {
    return null;
  }
}

// ── YouTube Link Modal ──────────────────────────────────────────────────────

function VideoLinkModal({ onSave, onCancel }) {
  const [url, setUrl] = useState('');
  const isValid = isSupportedVideoUrl(url);
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div className="w-[400px] bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video size={20} className="text-red-500" />
            <h2 className="text-base font-semibold">Video PiP</h2>
          </div>
          <button onClick={onCancel} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={18} /></button>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Save a video to play it in the TV.
        </p>
        <input
          autoFocus
          placeholder="Paste a YouTube or Vimeo video link"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && isValid && onSave(url)}
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-red-500 transition-all"
        />
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
          <button disabled={!isValid} onClick={() => onSave(url)} className="px-6 py-2 bg-red-500 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40 text-white rounded-lg text-sm font-semibold shadow-lg transition-colors">Save &amp; Play</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const FILTERS = [
  { id: 'all', label: 'All Channels', icon: Globe, tone: 'all' },
  { id: 'favorites', label: 'Favorites', icon: Heart, tone: 'favorites' },
  { id: 'youtube', label: 'Saved videos', icon: Video, tone: 'youtube' },
];

const ChannelItem = React.memo(function ChannelItem({
  channel,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
  onRemoveYouTube,
}) {
  const isYouTube = channel.isYouTube;

  return (
    <div className={`iptv-channel ${isActive ? 'iptv-channel--active' : ''}`}>
      <button
        type="button"
        className="iptv-channel__select"
        onClick={() => onSelect(channel.id)}
        title={channel.name}
      >
        {isYouTube ? (
          channel.provider === 'vimeo'
            ? <Video size={16} className="iptv-channel__logo-placeholder" style={{ color: '#1ab7ea' }} />
            : <Youtube size={16} className="iptv-channel__logo-placeholder" style={{ color: '#ff0000' }} />
        ) : channel.logo ? (
          <img
            src={channel.logo}
            alt=""
            className="iptv-channel__logo"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <Tv size={16} className="iptv-channel__logo-placeholder" />
        )}
        <div className="iptv-channel__info">
          <span className="iptv-channel__name">{channel.name}</span>
          {channel.group && <span className="iptv-channel__group">{channel.group}</span>}
        </div>
      </button>
      {isYouTube ? (
        <button
          type="button"
          className="iptv-channel__favorite iptv-channel__youtube-delete"
          onClick={() => onRemoveYouTube(channel.videoId)}
          title="Remove from saved"
          aria-label={`Remove ${channel.name} from saved`}
        >
          <Trash2 size={13} />
        </button>
      ) : (
        <button
          type="button"
          className={`iptv-channel__favorite ${isFavorite ? 'iptv-channel__favorite--active' : ''}`}
          onClick={() => onToggleFavorite(channel.id)}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFavorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}
          aria-pressed={isFavorite}
        >
          <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
});

export default function IptvMode() {
  const {
    channels,
    loading,
    error,
    activeSource,
    setActiveSource,
    sources,
    categories,
    countries,
    favorites,
    favoriteChannels,
    favoriteSources,
    toggleFavorite,
    lastChannelId,
    setLastChannel,
    reload,
  } = useIptvPlaylist();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(FILTERS[0].id);
  const [activeCategory, setActiveCategory] = useState('');
  const [activeCountry, setActiveCountry] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [youtubeBookmarks, setYoutubeBookmarks] = useState(loadYouTubeBookmarks);
  const [showYouTubeModal, setShowYouTubeModal] = useState(false);
  const [activeYouTubeUrl, setActiveYouTubeUrl] = useState(null);
  const sidebarScrollRef = useRef(null);
  const scrollRef = useRef(null);
  const initializedRef = useRef(false);

  // YouTube handlers
  const handlePlayYouTube = useCallback((url) => {
    const embedUrl = getVideoEmbedUrl(url);
    if (!embedUrl) return;
    setActiveYouTubeUrl(embedUrl);
    setShowYouTubeModal(false);
  }, []);

  const handleAddYouTubeBookmark = useCallback(async (url, type) => {
    const provider = getVideoProvider(url);
    const rawVideoId = provider === 'vimeo' ? extractVimeoId(url) : extractYouTubeId(url);
    const videoId = provider === 'vimeo' ? `vimeo:${rawVideoId}` : rawVideoId;
    if (!videoId) return;
    const embedUrl = getVideoEmbedUrl(url);
    if (!embedUrl) return;
    const title = await fetchVideoTitle(url);

    setYoutubeBookmarks(prev => {
      if (prev.some(b => b.videoId === videoId)) return prev;
      const next = [...prev, {
        videoId,
        url,
        embedUrl,
        type,
        provider,
        title: title || `${provider === 'vimeo' ? 'Vimeo' : 'YouTube'} video ${rawVideoId}`,
        addedAt: Date.now(),
      }];
      saveYouTubeBookmarks(next);
      return next;
    });
  }, []);

  // Upgrade the placeholder labels created by earlier versions without
  // altering or removing any saved entries.
  useEffect(() => {
    const unresolved = youtubeBookmarks.filter((bookmark) =>
      bookmark.type !== 'channel' && (!bookmark.title || /^(?:YouTube|Vimeo) (?:video )?[^ ]+$/.test(bookmark.title))
    );
    if (unresolved.length === 0) return;

    let cancelled = false;
    Promise.all(unresolved.map(async (bookmark) => ({
      videoId: bookmark.videoId,
      title: await fetchVideoTitle(bookmark.url),
    }))).then((resolved) => {
      if (cancelled) return;
      const titles = new Map(resolved.filter((item) => item.title).map((item) => [item.videoId, item.title]));
      if (titles.size === 0) return;
      setYoutubeBookmarks((previous) => {
        const next = previous.map((bookmark) => (
          titles.has(bookmark.videoId) ? { ...bookmark, title: titles.get(bookmark.videoId) } : bookmark
        ));
        saveYouTubeBookmarks(next);
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [youtubeBookmarks]);

  const handleRemoveYouTubeBookmark = useCallback((videoId) => {
    setYoutubeBookmarks(prev => {
      const next = prev.filter(b => b.videoId !== videoId);
      saveYouTubeBookmarks(next);
      return next;
    });
  }, []);

  // Initialize: pick last channel or first one
  useEffect(() => {
    if (channels.length === 0) return;
    if (selectedChannelId && channels.some((c) => c.id === selectedChannelId)) return;
    const initialId = lastChannelId && channels.some((c) => c.id === lastChannelId)
      ? lastChannelId
      : channels[0].id;
    setSelectedChannelId(initialId);
    setActiveYouTubeUrl(null);
    initializedRef.current = true;
  }, [channels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived: filtered channel list
  const filteredChannels = useMemo(() => {
    let list = channels;

    // Tab filter
    if (filter === 'favorites') {
      list = favoriteChannels;
    } else if (filter === 'youtube') {
      // YouTube bookmarks as pseudo-channels
      list = youtubeBookmarks.map(b => ({
        id: `yt-${b.videoId}`,
        name: b.title || `YouTube ${b.videoId}`,
        url: b.embedUrl,
        group: 'YouTube',
        country: '',
        lang: '',
        logo: '',
        isYouTube: true,
        videoId: b.videoId,
        provider: b.provider || (String(b.videoId).startsWith('vimeo:') ? 'vimeo' : 'youtube'),
      }));
      // Apply search to YouTube list
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(ch => ch.name.toLowerCase().includes(q));
      }
      return list;
    }

    // Category filter (match against semicolon-split groups too)
    if (activeCategory) {
      list = list.filter((ch) => {
        if (!ch.group) return false;
        return ch.group.split(';').some((g) => g.trim() === activeCategory);
      });
    }

    // Country filter
    if (activeCountry) {
      list = list.filter((ch) => ch.country === activeCountry);
    }

    // Search (filter the already-filtered list, not replace it)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (ch) =>
          ch.name.toLowerCase().includes(q) ||
          ch.group.toLowerCase().includes(q) ||
          ch.country.toLowerCase().includes(q)
      );
    }

    return list;
  }, [channels, filter, favoriteChannels, youtubeBookmarks, activeCategory, activeCountry, search]);

  // When category/country/filter-tab changes (after initial load),
  // auto-select the first channel in the new filtered list so the TV
  // always reflects the current filter.
  useEffect(() => {
    if (!initializedRef.current) return;
    if (filteredChannels.length === 0) return;
    const nextChannel = filteredChannels[0];
    setSelectedChannelId(nextChannel.id);
    setActiveYouTubeUrl(nextChannel.isYouTube ? nextChannel.url : null);
  }, [activeCategory, activeCountry, filter, filteredChannels]);

  // Auto-switch source when Favorites tab is clicked but the current
  // source doesn't have any matching channels — only works when
  // favorites carry src info (new format). Legacy favorites (src: null)
  // are upgraded silently by the hook when their source is encountered.
  useEffect(() => {
    if (filter !== 'favorites') return;
    if (!initializedRef.current) return;
    if (favorites.length === 0) return;
    if (favoriteChannels.length > 0) return;
    if (favoriteSources.length > 0) {
      setActiveSource(favoriteSources[0]);
    }
  }, [filter, favoriteChannels, favoriteSources, favorites.length, setActiveSource]);

  const selectedChannel = useMemo(
    () => filteredChannels.find((c) => c.id === selectedChannelId) || filteredChannels[0] || null,
    [selectedChannelId, filteredChannels]
  );
  const selectedIsFavorite = selectedChannel ? favorites.some((f) => f.id === selectedChannel.id) : false;
  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  const handleSelectChannel = useCallback((channelId) => {
    const sidebarScrollTop = sidebarScrollRef.current?.scrollTop || 0;
    const listScrollTop = scrollRef.current?.scrollTop || 0;
    const nextChannel = filteredChannels.find((channel) => channel.id === channelId);
    setSelectedChannelId(channelId);
    setActiveYouTubeUrl(nextChannel?.isYouTube ? nextChannel.url : null);
    setLastChannel(channelId);
    requestAnimationFrame(() => {
      if (sidebarScrollRef.current) sidebarScrollRef.current.scrollTop = sidebarScrollTop;
      if (scrollRef.current) scrollRef.current.scrollTop = listScrollTop;
    });
  }, [filteredChannels, setLastChannel]);

  const handleChannelUp = useCallback(() => {
    if (filteredChannels.length === 0) return;
    const idx = filteredChannels.findIndex((c) => c.id === selectedChannelId);
    let nextChannel;
    if (idx <= 0) {
      nextChannel = filteredChannels[filteredChannels.length - 1];
    } else {
      nextChannel = filteredChannels[idx - 1];
    }
    setSelectedChannelId(nextChannel.id);
    setActiveYouTubeUrl(nextChannel.isYouTube ? nextChannel.url : null);
  }, [filteredChannels, selectedChannelId]);

  const handleChannelDown = useCallback(() => {
    if (filteredChannels.length === 0) return;
    const idx = filteredChannels.findIndex((c) => c.id === selectedChannelId);
    let nextChannel;
    if (idx < 0 || idx >= filteredChannels.length - 1) {
      nextChannel = filteredChannels[0];
    } else {
      nextChannel = filteredChannels[idx + 1];
    }
    setSelectedChannelId(nextChannel.id);
    setActiveYouTubeUrl(nextChannel.isYouTube ? nextChannel.url : null);
  }, [filteredChannels, selectedChannelId]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleChannelUp();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleChannelDown();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleChannelUp, handleChannelDown]);

  const youTubeEmbedUrl = selectedChannel?.isYouTube ? selectedChannel.url : activeYouTubeUrl;

  return (
    <div className="iptv-mode">
      {showYouTubeModal && (
        <VideoLinkModal
          onSave={(url) => {
            handlePlayYouTube(url);
            handleAddYouTubeBookmark(url, 'video');
            }}
          onCancel={() => setShowYouTubeModal(false)}
        />
      )}
      {/* Player area */}
      <div className="iptv-player-area">
        <RetroTvPlayer
          streamUrl={selectedChannel?.isYouTube ? '' : (selectedChannel?.url || '')}
          youtubeUrl={youTubeEmbedUrl}
          videoProvider={selectedChannel?.provider || 'youtube'}
          channelName={selectedChannel?.name || ''}
          isFavorite={selectedIsFavorite}
          onToggleFavorite={() => {
            if (selectedChannel?.isYouTube) {
              handleRemoveYouTubeBookmark(selectedChannel.videoId);
            } else if (selectedChannel) {
              toggleFavorite(selectedChannel.id);
            }
          }}
          onChannelUp={handleChannelUp}
          onChannelDown={handleChannelDown}
        />

        {/* Channel info bar */}
        {selectedChannel && (
          <div className="iptv-channel-bar">
            <div className="iptv-channel-bar__left">
              <span className="iptv-channel-bar__name">{selectedChannel.name}</span>
              {selectedChannel.group && (
                <span className="iptv-channel-bar__group">{selectedChannel.group}</span>
              )}
            </div>
            <div className="iptv-channel-bar__right">
              {selectedChannel.isYouTube ? (
                <button
                  type="button"
                  className="iptv-channel-bar__favorite iptv-channel-bar__favorite--youtube"
                  onClick={() => handleRemoveYouTubeBookmark(selectedChannel.videoId)}
                  title="Remove from saved"
                >
                  <Trash2 size={13} />
                  <span>Remove</span>
                </button>
              ) : (
                <button
                  type="button"
                  className={`iptv-channel-bar__favorite ${selectedIsFavorite ? 'iptv-channel-bar__favorite--active' : ''}`}
                  onClick={() => toggleFavorite(selectedChannel.id)}
                  aria-pressed={selectedIsFavorite}
                >
                  <Star size={13} fill={selectedIsFavorite ? 'currentColor' : 'none'} />
                  <span>{selectedIsFavorite ? 'Favorited' : 'Favorite'}</span>
                </button>
              )}
              {selectedChannel.country && (
                <span className="iptv-channel-bar__country">{selectedChannel.country}</span>
              )}
              {selectedChannel.lang && (
                <span className="iptv-channel-bar__lang">{selectedChannel.lang}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className={`iptv-sidebar ${sidebarCollapsed ? 'iptv-sidebar--collapsed' : ''}`}>
        <button
          className="iptv-sidebar__toggle"
          onClick={() => setSidebarCollapsed((c) => !c)}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          {sidebarCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        {sidebarCollapsed ? (
          <div className="iptv-sidebar__collapsed-hint">
            <ListFilter size={14} />
          </div>
        ) : (
          <div className="iptv-sidebar__inner" ref={sidebarScrollRef}>
            {/* Source selector */}
            <div className="iptv-sidebar__section">
              <label className="iptv-sidebar__label">
                <Zap size={12} /> Playlist
              </label>
              <select
                value={activeSource}
                onChange={(e) => setActiveSource(e.target.value)}
                className="iptv-sidebar__select"
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <button
                className="iptv-sidebar__reload"
                onClick={reload}
                disabled={loading}
                title="Reload playlist"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Filter tabs */}
            <div className="iptv-sidebar__section">
              <div className="iptv-filter-tabs">
                {FILTERS.map(({ id, label, icon: Icon, tone }) => {
                  const count = id === 'all'
                    ? channels.length
                    : id === 'favorites'
                      ? favorites.length
                      : youtubeBookmarks.length;
                  return (
                  <button
                    key={id}
                    className={`iptv-filter-tab iptv-filter-tab--${tone} ${filter === id ? 'iptv-filter-tab--active' : ''}`}
                    onClick={() => setFilter(id)}
                    title={id === 'youtube' ? `${youtubeBookmarks.length} saved video links` : label}
                    aria-label={label}
                  >
                    <Icon size={12} />
                    <span className="iptv-filter-tab__count">{count}</span>
                  </button>
                  );
                })}
              </div>
            </div>

            {/* Search */}
            <div className="iptv-sidebar__section">
              <div className="iptv-search">
                <Search size={14} className="iptv-search__icon" />
                <input
                  type="text"
                  placeholder="Search channels…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="iptv-search__input"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="iptv-search__clear">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Category / Country quick filters */}
            {filter === 'all' && (
              <>
                {categories.length > 0 && (
                  <div className="iptv-sidebar__section">
                    <label className="iptv-sidebar__label">Category</label>
                    <select
                      value={activeCategory}
                      onChange={(e) => setActiveCategory(e.target.value)}
                      className="iptv-sidebar__select"
                    >
                      <option value="">All</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
                {countries.length > 0 && (
                  <div className="iptv-sidebar__section">
                    <label className="iptv-sidebar__label">Country</label>
                    <select
                      value={activeCountry}
                      onChange={(e) => setActiveCountry(e.target.value)}
                      className="iptv-sidebar__select"
                    >
                      <option value="">All</option>
                      {countries.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {/* Channel list */}
            <div className="iptv-sidebar__section iptv-sidebar__section--channels">
              <div className="iptv-channel-count">
                {filteredChannels.length} channel{filteredChannels.length !== 1 ? 's' : ''}
              </div>
              {loading ? (
                <div className="iptv-loading">
                  <Loader2 size={24} className="animate-spin" />
                  <span>Loading channels…</span>
                </div>
              ) : error ? (
                <div className="iptv-error">
                  <span className="iptv-error__msg">{error}</span>
                  <button onClick={reload} className="iptv-error__retry">Retry</button>
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="iptv-empty">
                  {filter === 'favorites' && favorites.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                      {favorites[0]?.name ? (
                        <span>&ldquo;{favorites[0].name}&rdquo; was favorited from a different playlist.</span>
                      ) : (
                        <span>Your favorite is from a different playlist.</span>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', maxWidth: 220, lineHeight: 1.5 }}>
                        Try switching the <strong>Playlist</strong> dropdown above to find it.{' '}
                        Available: {sources.map(s => s.label).join(', ')}
                      </div>
                    </div>
                  ) : (
                    'No channels match.'
                  )}
                </div>
              ) : (
                <div className="iptv-channel-list" ref={scrollRef}>
                  {filteredChannels.map((ch) => (
                    <ChannelItem
                      key={ch.id}
                      channel={ch}
                      isActive={ch.id === selectedChannelId}
                      isFavorite={favoriteIds.has(ch.id)}
                      onSelect={handleSelectChannel}
                      onToggleFavorite={toggleFavorite}
                      onRemoveYouTube={handleRemoveYouTubeBookmark}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Saved-video section — grouped separately from IPTV controls. */}
            <div className="iptv-sidebar__section iptv-sidebar__youtube-section">
              <label className="iptv-sidebar__label">
                <Video size={12} /> Videos
              </label>
              <button
                className="iptv-sidebar__youtube-btn"
                onClick={() => setShowYouTubeModal(true)}
                title="Add YouTube or Vimeo video"
              >
                <Video size={14} />
                <span>Add video</span>
                <Plus size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
