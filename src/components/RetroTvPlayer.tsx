import { useMemo, useState } from 'react';

const STREAM_BASE_URL = 'https://www.youtube.com/embed/21X5lGlDOfg';

type RetroTvPlayerProps = {
    className?: string;
};

export default function RetroTvPlayer({ className = '' }: RetroTvPlayerProps) {
    const [powered, setPowered] = useState<boolean>(true);
    const [muted, setMuted] = useState<boolean>(true);

    const streamUrl = useMemo(() => {
        const params = new URLSearchParams({
            autoplay: '1',
            mute: muted ? '1' : '0',
            controls: '0',
            modestbranding: '1',
            rel: '0',
            playsinline: '1',
        });
        return `${STREAM_BASE_URL}?${params.toString()}`;
    }, [muted]);

    return (
        <section className={`retro-tv ${className}`.trim()} aria-label="Retro TV live stream">
            <div className="retro-tv__bezel">
                <div className="retro-tv__screen">
                    {powered ? (
                        <iframe
                            key={streamUrl}
                            className="retro-tv__iframe"
                            src={streamUrl}
                            title="24/7 ambient office stream"
                            allow="autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                        />
                    ) : (
                        <div className="retro-tv__off" aria-hidden="true">
                            <span />
                        </div>
                    )}
                </div>
                <div className="retro-tv__foot" />
            </div>

            <div className="retro-tv__controls">
                <span className="retro-tv__label">AMBIENT SCREEN</span>
                <button type="button" onClick={() => setPowered((value) => !value)}>
                    {powered ? 'Power Off' : 'Power On'}
                </button>
                <button type="button" onClick={() => setMuted((value) => !value)} disabled={!powered}>
                    {muted ? 'Unmute' : 'Mute'}
                </button>
            </div>
        </section>
    );
}
