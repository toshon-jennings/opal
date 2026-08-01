import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, ChevronUp, ChevronDown, Star, StarOff, Radio, Power } from 'lucide-react';

// RetroTvPlayer — CRT-styled TV that plays an HLS stream.
//
// Uses an iframe loading a player page (public/iptv-player.html) that
// handles HLS.js + native <video> playback. The stream URL is passed as
// a query parameter (?url=...) so the player auto-loads on open.
//
// Mute/unmute is forwarded to the iframe player so the already-playing stream
// can change audio state without reloading.

// Resolve the player page relative to the current document so it works both in
// dev (http://localhost:5173/iptv-player.html) and in the packaged Electron
// build, which loads the renderer over file:// — there an absolute "/…" path
// would resolve to the filesystem root and fail to load.
const PLAYER_HTML = new URL('iptv-player.html', window.location.href).href;

function buildPlayerUrl(streamUrl) {
  if (!streamUrl) return PLAYER_HTML;
  const params = new URLSearchParams();
  params.set('url', streamUrl);
  return `${PLAYER_HTML}?${params.toString()}`;
}

// YouTube's /embed/ endpoint now serves a bare player with no native controls —
// the control chrome (CC toggle, settings gear) isn't rendered at all, so
// hovering does nothing. The full /watch and channel pages still render the
// full control bar. In Electron the YouTube player is a <webview> (a full
// top-level browsing context), so load the full page there; in a plain
// <iframe> we must keep the embed URL because YouTube refuses to be framed.
// The embed URL remains what's stored/rendered elsewhere, so map it to its
// full-page equivalent at render time.
function fullPageUrlFromEmbed(embedUrl) {
  if (!embedUrl) return embedUrl;
  try {
    const url = new URL(embedUrl);
    if (!url.hostname.includes('youtube.com')) return embedUrl;

    if (url.pathname === '/embed/live_stream') {
      const channel = url.searchParams.get('channel');
      if (channel) {
        return channel.startsWith('@')
          ? `https://www.youtube.com/${channel}`
          : `https://www.youtube.com/channel/${channel}`;
      }
      return embedUrl;
    }

    const videoId = /^\/embed\/([^/]+)/.exec(url.pathname)?.[1];
    if (!videoId) return embedUrl;

    const params = new URLSearchParams();
    if (url.searchParams.get('autoplay') === '1') params.set('autoplay', '1');
    if (url.searchParams.get('mute') === '1') params.set('mute', '1');
    const query = params.toString();
    return `https://www.youtube.com/watch?v=${videoId}${query ? `&${query}` : ''}`;
  } catch {
    return embedUrl;
  }
}

function canUseWebview() {
  return typeof window !== 'undefined' && !!window.electron;
}

// The YouTube <webview> guest is a separate top-level browsing context, not a
// child iframe, so the postMessage-based IFrame Player API (which relies on a
// parent/child window relationship) doesn't reach it. Its page still exposes
// the player instance's controls directly on the #movie_player element though,
// so drive mute/volume by running them inside the guest via executeJavaScript.
function runYouTubePlayerCommand(webview, expr) {
  webview?.executeJavaScript(`
    (function() {
      var p = document.getElementById('movie_player');
      if (p) { ${expr} }
    })();
  `, true).catch(() => {});
}

export default function RetroTvPlayer({
  streamUrl,
  youtubeUrl = null,
  videoProvider = 'youtube',
  channelName = '',
  isFavorite = false,
  onToggleFavorite,
  onChannelUp,
  onChannelDown,
  className = '',
}) {
  const iframeRef = useRef(null);
  const youtubeWebviewRef = useRef(null);
  const [powered, setPowered] = useState(true);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(50); // 0–100
  const prevVolumeRef = useRef(50);

  const isEmbeddedVideo = !!youtubeUrl;
  const isYouTube = isEmbeddedVideo && videoProvider === 'youtube';
  const useWebview = isEmbeddedVideo && canUseWebview();

  // Reset mute on stream change
  useEffect(() => {
    setMuted(true);
  }, [streamUrl, youtubeUrl]);

  // Sync volume/mute to iframe when it mounts (new stream URL → new iframe)
  // Skip for YouTube: it manages its own audio inside the iframe.
  useEffect(() => {
    if (isEmbeddedVideo) return;
    // iframe won't be available until next paint — delay slightly
    const timer = setTimeout(() => {
      if (iframeRef.current?.contentWindow) {
        const vol = muted ? 0 : volume;
        iframeRef.current.contentWindow.postMessage({
          source: 'perci-iptv-host',
          type: 'set-volume',
          volume: vol / 100,
        }, '*');
        iframeRef.current.contentWindow.postMessage({
          source: 'perci-iptv-host',
          type: 'set-muted',
          muted,
        }, '*');
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [streamUrl]);  // eslint-disable-line react-hooks/exhaustive-deps

  const postMuteState = useCallback((nextMuted) => {
    if (isYouTube) {
      runYouTubePlayerCommand(youtubeWebviewRef.current, nextMuted ? 'p.mute();' : 'p.unMute();');
      return;
    }
    iframeRef.current?.contentWindow?.postMessage({
      source: 'perci-iptv-host',
      type: 'set-muted',
      muted: nextMuted,
    }, '*');
  }, [isYouTube]);

  const postVolumeState = useCallback((nextVolume) => {
    if (isYouTube) {
      runYouTubePlayerCommand(youtubeWebviewRef.current, `p.setVolume(${nextVolume});`);
      return;
    }
    iframeRef.current?.contentWindow?.postMessage({
      source: 'perci-iptv-host',
      type: 'set-volume',
      volume: nextVolume / 100,
    }, '*');
  }, [isYouTube]);

  const handlePower = useCallback(() => {
    setPowered((p) => !p);
  }, []);

  const handleUnmute = useCallback(() => {
    setMuted(false);
    postMuteState(false);
    // Restore previous volume
    const restored = prevVolumeRef.current;
    setVolume(restored);
    postVolumeState(restored);
  }, [postMuteState, postVolumeState]);

  const handleMute = useCallback(() => {
    prevVolumeRef.current = volume;
    setMuted(true);
    postMuteState(true);
    setVolume(0);
    postVolumeState(0);
  }, [volume, postMuteState, postVolumeState]);

  const handleVolumeChange = useCallback((e) => {
    const v = Number(e.target.value);
    setVolume(v);
    prevVolumeRef.current = v > 0 ? v : prevVolumeRef.current;
    postVolumeState(v);
    if (v > 0 && muted) {
      setMuted(false);
      postMuteState(false);
    }
  }, [muted, postMuteState, postVolumeState]);

  const showNoSignal = powered && !streamUrl && !isEmbeddedVideo;
  const playerUrl = buildPlayerUrl(streamUrl);

  return (
    <section className={`retro-tv ${className}`.trim()} aria-label="IPTV television">
      <div className="retro-tv__bezel">
        <div className="retro-tv__screen">
          {powered ? (
            showNoSignal ? (
              <div className="retro-tv__no-signal" aria-hidden="true">
                <div className="retro-tv__no-signal-text">
                  <Radio size={28} className="animate-pulse" />
                  <span>NO SIGNAL</span>
                </div>
                <div className="retro-tv__scanlines" />
              </div>
            ) : youtubeUrl ? (
              useWebview ? (
                React.createElement('webview', {
                  key: `${videoProvider}-webview-${youtubeUrl}`,
                  ref: youtubeWebviewRef,
                  src: fullPageUrlFromEmbed(youtubeUrl),
                  className: 'retro-tv__iframe',
                  partition: `persist:perci-${videoProvider}`,
                  useragent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  style: { width: '100%', height: '100%' },
                })
              ) : (
                <iframe
                  ref={iframeRef}
                  className="retro-tv__iframe"
                  key={`youtube-iframe-${youtubeUrl}`}
                  src={youtubeUrl}
                  title={`${videoProvider === 'vimeo' ? 'Vimeo' : 'YouTube'} Player`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              )
            ) : (
              <iframe
                ref={iframeRef}
                className="retro-tv__iframe"
                key={streamUrl || 'empty'}
                src={playerUrl}
                title="IPTV Stream Player"
                allow="autoplay; encrypted-media; picture-in-picture"
              />
            )
          ) : (
            <div className="retro-tv__off" aria-hidden="true">
              <span />
            </div>
          )}
        </div>
        <div className="retro-tv__foot" />
      </div>

      <div className="retro-tv__controls">
        <span className="retro-tv__label">{channelName || 'IPTV'}</span>
        <div className="retro-tv__btn-group">
          <button
            type="button"
            onClick={handlePower}
            className={powered ? 'retro-tv__power-on' : ''}
            title={powered ? 'Power Off' : 'Power On'}
          >
            <Power size={14} />
          </button>
          {(!isEmbeddedVideo || (isYouTube && useWebview)) && (
            <>
              <button
                type="button"
                onClick={muted ? handleUnmute : handleMute}
                disabled={!powered}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input
                type="range"
                className="retro-tv__volume-slider"
                min="0"
                max="100"
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                disabled={!powered}
                title={`Volume ${muted ? 0 : volume}%`}
                aria-label="Volume"
              />
            </>
          )}
          {onChannelUp && (
            <button type="button" onClick={onChannelUp} disabled={!powered} title="Channel Up">
              <ChevronUp size={14} />
            </button>
          )}
          {onChannelDown && (
            <button type="button" onClick={onChannelDown} disabled={!powered} title="Channel Down">
              <ChevronDown size={14} />
            </button>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              className={isFavorite ? 'retro-tv__fav-active' : ''}
            >
              {isFavorite ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
