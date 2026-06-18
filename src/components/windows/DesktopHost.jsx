import { useMode } from '../../context/ModeContext';
import WindowFrame from './WindowFrame';
import WindowErrorBoundary from './WindowErrorBoundary';

// Overlay layer that renders the open windows above the Chat base. The host
// itself is click-through (pointer-events: none); each window re-enables
// pointer events. Windows are painted in z-index order; the top non-minimized
// window is the active one. `renderContent(modeId)` supplies the mode UI so the
// caller can pass any props a mode needs (e.g. Mission Control).
export default function DesktopHost({ renderContent }) {
    const { windows } = useMode();
    if (!windows.length) return null;

    const sorted = [...windows].sort((a, b) => a.z - b.z);
    const activeId = [...sorted].reverse().find(w => w.state !== 'minimized')?.id;

    return (
        <div className="perci-desktop-host">
            {sorted.map(win => (
                <WindowFrame key={win.id} win={win} active={win.id === activeId} modeId={win.modeId}>
                    <WindowErrorBoundary label={win.title}>
                        {renderContent(win.modeId)}
                    </WindowErrorBoundary>
                </WindowFrame>
            ))}
        </div>
    );
}
