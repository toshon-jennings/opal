import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Tv, Search, RefreshCw, Star, Globe, Loader2, X,
  ChevronLeft, ChevronRight, ListFilter, Heart, Zap
} from 'lucide-react';
import RetroTvPlayer from './RetroTvPlayer';
import useIptvPlaylist from '../hooks/useIptvPlaylist';
import './IptvMode.css';

const FILTERS = [
  { id: 'all', label: 'All Channels', icon: Globe },
  { id: 'favorites', label: 'Favorites', icon: Heart },
];

const ChannelItem = React.memo(function ChannelItem({
  channel,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
}) {
  return (
    <div className={`iptv-channel ${isActive ? 'iptv-channel--active' : ''}`}>
      <button
        type="button"
        className="iptv-channel__select"
        onClick={() => onSelect(channel.id)}
        title={channel.name}
      >
        {channel.logo ? (
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
  const sidebarScrollRef = useRef(null);
  const scrollRef = useRef(null);
  const initializedRef = useRef(false);

  // Initialize: pick last channel or first one
  useEffect(() => {
    if (channels.length === 0) return;
    if (selectedChannelId && channels.some((c) => c.id === selectedChannelId)) return;
    const initialId = lastChannelId && channels.some((c) => c.id === lastChannelId)
      ? lastChannelId
      : channels[0].id;
    setSelectedChannelId(initialId);
    initializedRef.current = true;
  }, [channels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived: filtered channel list
  const filteredChannels = useMemo(() => {
    let list = channels;

    // Source filter is implicit (handled by activeSource → channels list)

    // Tab filter
    if (filter === 'favorites') {
      list = favoriteChannels;
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
  }, [channels, filter, favoriteChannels, activeCategory, activeCountry, search]);

  // When category/country/filter-tab changes (after initial load),
  // auto-select the first channel in the new filtered list so the TV
  // always reflects the current filter.
  useEffect(() => {
    if (!initializedRef.current) return;
    if (filteredChannels.length === 0) return;
    setSelectedChannelId(filteredChannels[0].id);
  }, [activeCategory, activeCountry, filter, filteredChannels]);

  const selectedChannel = useMemo(
    () => filteredChannels.find((c) => c.id === selectedChannelId) || filteredChannels[0] || null,
    [selectedChannelId, filteredChannels]
  );
  const selectedIsFavorite = selectedChannel ? favorites.includes(selectedChannel.id) : false;
  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);

  const handleSelectChannel = useCallback((channelId) => {
    const sidebarScrollTop = sidebarScrollRef.current?.scrollTop || 0;
    const listScrollTop = scrollRef.current?.scrollTop || 0;
    setSelectedChannelId(channelId);
    setLastChannel(channelId);
    requestAnimationFrame(() => {
      if (sidebarScrollRef.current) sidebarScrollRef.current.scrollTop = sidebarScrollTop;
      if (scrollRef.current) scrollRef.current.scrollTop = listScrollTop;
    });
  }, [setLastChannel]);

  const handleChannelUp = useCallback(() => {
    if (filteredChannels.length === 0) return;
    const idx = filteredChannels.findIndex((c) => c.id === selectedChannelId);
    if (idx <= 0) {
      setSelectedChannelId(filteredChannels[filteredChannels.length - 1].id);
    } else {
      setSelectedChannelId(filteredChannels[idx - 1].id);
    }
  }, [filteredChannels, selectedChannelId]);

  const handleChannelDown = useCallback(() => {
    if (filteredChannels.length === 0) return;
    const idx = filteredChannels.findIndex((c) => c.id === selectedChannelId);
    if (idx < 0 || idx >= filteredChannels.length - 1) {
      setSelectedChannelId(filteredChannels[0].id);
    } else {
      setSelectedChannelId(filteredChannels[idx + 1].id);
    }
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

  return (
    <div className="iptv-mode">
      {/* Player area */}
      <div className="iptv-player-area">
        <RetroTvPlayer
          streamUrl={selectedChannel?.url || ''}
          channelName={selectedChannel?.name || ''}
          isFavorite={selectedIsFavorite}
          onToggleFavorite={() => selectedChannel && toggleFavorite(selectedChannel.id)}
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
              <button
                type="button"
                className={`iptv-channel-bar__favorite ${selectedIsFavorite ? 'iptv-channel-bar__favorite--active' : ''}`}
                onClick={() => toggleFavorite(selectedChannel.id)}
                aria-pressed={selectedIsFavorite}
              >
                <Star size={13} fill={selectedIsFavorite ? 'currentColor' : 'none'} />
                <span>{selectedIsFavorite ? 'Favorited' : 'Favorite'}</span>
              </button>
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
                {FILTERS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    className={`iptv-filter-tab ${filter === id ? 'iptv-filter-tab--active' : ''}`}
                    onClick={() => setFilter(id)}
                  >
                    <Icon size={12} />
                    <span>{label}</span>
                    {id === 'favorites' && favorites.length > 0 && (
                      <span className="iptv-filter-tab__count">{favorites.length}</span>
                    )}
                  </button>
                ))}
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
            {filter !== 'favorites' && (
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
                  No channels match.
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
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
