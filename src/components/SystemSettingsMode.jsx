import { useCallback, useEffect, useState } from 'react';
import { Wifi, Lock, RefreshCw, Loader2 } from 'lucide-react';
import './SystemSettingsMode.css';

// Perci OS Settings — WiFi/display/power/volume, D-Bus-backed. Only ever
// mounted when usePerciOS() is true (see App.jsx routing), so this never
// renders on macOS/Windows or a plain Linux desktop install.
//
// WiFi is real (NetworkManager over D-Bus, electron/perci-os.cjs).
// Display/power/volume are honest placeholders, not mocked controls —
// they render nothing interactive rather than a toggle that does nothing,
// per the house rule against decorative status.

function SignalBars({ strength }) {
    const bars = [1, 2, 3, 4];
    const filled = Math.ceil((strength / 100) * 4);
    return (
        <span className="sys-signal" aria-label={`Signal strength ${strength}%`}>
            {bars.map((bar) => (
                <span
                    key={bar}
                    className="sys-signal-bar"
                    data-filled={bar <= filled}
                    style={{ height: `${bar * 3 + 3}px` }}
                />
            ))}
        </span>
    );
}

function WifiSection() {
    const [status, setStatus] = useState(null);
    const [networks, setNetworks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [connectingTo, setConnectingTo] = useState(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [statusResult, listResult] = await Promise.all([
                window.electron.perciOS.getWifiStatus(),
                window.electron.perciOS.listWifiNetworks(),
            ]);
            setStatus(statusResult);
            setNetworks(listResult.networks || []);
            if (listResult.error) setError(listResult.error);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleConnect = useCallback(async (network) => {
        if (network.secured && connectingTo !== network.ssid) {
            setConnectingTo(network.ssid);
            setPassword('');
            return;
        }
        setError(null);
        try {
            await window.electron.perciOS.connectToWifi(network.ssid, network.secured ? password : undefined);
            setConnectingTo(null);
            setPassword('');
            await refresh();
        } catch (err) {
            setError(err.message);
        }
    }, [connectingTo, password, refresh]);

    return (
        <section className="sys-section">
            <div className="sys-section-head">
                <h2>WiFi</h2>
                <button className="sys-icon-btn" onClick={refresh} disabled={loading} aria-label="Refresh networks">
                    {loading ? <Loader2 size={15} className="sys-spin" /> : <RefreshCw size={15} />}
                </button>
            </div>

            {status && (
                <p className="sys-status-line">
                    {status.connected ? `Connected to ${status.ssid}` : status.supported ? 'Not connected' : 'No WiFi hardware found'}
                </p>
            )}

            {error && <p className="sys-error">{error}</p>}

            <ul className="sys-network-list">
                {networks.map((network) => (
                    <li key={network.ssid} className="sys-network-row">
                        <div className="sys-network-info">
                            <Wifi size={16} className="sys-network-icon" />
                            <span className="sys-network-name">{network.ssid}</span>
                            {network.secured && <Lock size={12} className="sys-lock-icon" />}
                        </div>
                        <div className="sys-network-actions">
                            <SignalBars strength={network.strength} />
                            {network.active ? (
                                <span className="sys-connected-chip">Connected</span>
                            ) : (
                                <button className="sys-connect-btn" onClick={() => handleConnect(network)}>
                                    Connect
                                </button>
                            )}
                        </div>
                        {connectingTo === network.ssid && (
                            <div className="sys-password-row">
                                <input
                                    type="password"
                                    placeholder="Network password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoFocus
                                />
                                <button className="sys-connect-btn" onClick={() => handleConnect(network)}>Join</button>
                                <button className="sys-text-btn" onClick={() => setConnectingTo(null)}>Cancel</button>
                            </div>
                        )}
                    </li>
                ))}
                {!loading && networks.length === 0 && (
                    <li className="sys-empty">No networks found.</li>
                )}
            </ul>
        </section>
    );
}

function PlannedSection({ title }) {
    return (
        <section className="sys-section">
            <div className="sys-section-head">
                <h2>{title}</h2>
            </div>
            <p className="sys-planned">Not available yet — planned for a future phase.</p>
        </section>
    );
}

export default function SystemSettingsMode() {
    return (
        <div className="sys-settings-root">
            <header className="sys-header">
                <h1>Settings</h1>
                <p>Perci OS system settings</p>
            </header>
            <WifiSection />
            <PlannedSection title="Display" />
            <PlannedSection title="Power" />
            <PlannedSection title="Volume" />
        </div>
    );
}
