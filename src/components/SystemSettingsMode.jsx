import { useCallback, useEffect, useState } from 'react';
import { Wifi, Lock, RefreshCw, Loader2, Sun, BatteryFull, Moon, Power, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import './SystemSettingsMode.css';

// Perci OS Settings — WiFi/display/power/volume, all D-Bus/sysfs-backed
// (electron/perci-os.cjs). Only ever mounted when usePerciOS() is true
// (see App.jsx routing), so this never renders on macOS/Windows or a
// plain Linux desktop install.
//
// Every section here renders its real "not supported" state honestly
// (no backlight device found, no battery present, etc.) rather than a
// slider or toggle that looks interactive but does nothing — the house
// rule against decorative status. That's also literally what every VM
// this was tested against reports, since none have real display/audio
// hardware — display/power-actions/volume are unverified against real
// hardware; see the comments in perci-os.cjs for exactly what each
// section's "supported: true" path has and hasn't been run against.

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

// Two-step confirm — avoids a native confirm() dialog (jarring with no
// window chrome to anchor it in a kiosk session) while still requiring a
// deliberate second action before something as disruptive as a reboot.
function ConfirmButton({ icon: Icon, label, confirmLabel, onConfirm }) {
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) return undefined;
        const timer = setTimeout(() => setArmed(false), 3000);
        return () => clearTimeout(timer);
    }, [armed]);

    return (
        <button
            className={armed ? 'sys-power-btn sys-power-btn-armed' : 'sys-power-btn'}
            onClick={() => (armed ? onConfirm() : setArmed(true))}
        >
            <Icon size={15} />
            {armed ? confirmLabel : label}
        </button>
    );
}

function DisplaySection() {
    const [brightness, setBrightnessState] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        window.electron.perciOS.getBrightness().then(setBrightnessState);
    }, []);

    const handleChange = useCallback(async (e) => {
        const percent = Number(e.target.value);
        setBrightnessState((prev) => ({ ...prev, percentage: percent }));
        try {
            await window.electron.perciOS.setBrightness(percent);
        } catch (err) {
            setError(err.message);
        }
    }, []);

    return (
        <section className="sys-section">
            <div className="sys-section-head"><h2>Display</h2></div>
            {error && <p className="sys-error">{error}</p>}
            {brightness?.supported ? (
                <div className="sys-slider-row">
                    <Sun size={16} className="sys-network-icon" />
                    <input type="range" min="0" max="100" value={brightness.percentage} onChange={handleChange} />
                    <span className="sys-slider-value">{brightness.percentage}%</span>
                </div>
            ) : (
                <p className="sys-planned">No adjustable display backlight found.</p>
            )}
        </section>
    );
}

function PowerSection() {
    const [battery, setBattery] = useState(null);
    const [actions, setActions] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        window.electron.perciOS.getBatteryStatus().then(setBattery);
        window.electron.perciOS.getPowerActions().then(setActions);
    }, []);

    const runAction = useCallback((fn) => async () => {
        setError(null);
        try {
            await fn();
        } catch (err) {
            setError(err.message);
        }
    }, []);

    return (
        <section className="sys-section">
            <div className="sys-section-head"><h2>Power</h2></div>
            {error && <p className="sys-error">{error}</p>}
            {battery?.present && (
                <p className="sys-status-line">
                    <BatteryFull size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
                    {battery.percentage}% &middot; {battery.state}
                </p>
            )}
            <div className="sys-power-actions">
                {actions?.canSuspend && (
                    <button className="sys-power-btn" onClick={runAction(window.electron.perciOS.suspend)}>
                        <Moon size={15} /> Suspend
                    </button>
                )}
                {actions?.canReboot && (
                    <ConfirmButton icon={RotateCcw} label="Restart" confirmLabel="Confirm restart"
                        onConfirm={runAction(window.electron.perciOS.reboot)} />
                )}
                {actions?.canPowerOff && (
                    <ConfirmButton icon={Power} label="Shut Down" confirmLabel="Confirm shut down"
                        onConfirm={runAction(window.electron.perciOS.powerOff)} />
                )}
                {actions && !actions.canSuspend && !actions.canReboot && !actions.canPowerOff && (
                    <p className="sys-planned">No power actions available (logind not reachable).</p>
                )}
            </div>
        </section>
    );
}

function VolumeSection() {
    const [volume, setVolumeState] = useState(null);
    const [error, setError] = useState(null);

    const refresh = useCallback(() => {
        window.electron.perciOS.getVolume().then(setVolumeState);
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleChange = useCallback(async (e) => {
        const percent = Number(e.target.value);
        setVolumeState((prev) => ({ ...prev, percentage: percent }));
        try {
            await window.electron.perciOS.setVolume(percent);
        } catch (err) {
            setError(err.message);
        }
    }, []);

    const handleMuteToggle = useCallback(async () => {
        setError(null);
        try {
            await window.electron.perciOS.toggleMute();
            refresh();
        } catch (err) {
            setError(err.message);
        }
    }, [refresh]);

    return (
        <section className="sys-section">
            <div className="sys-section-head"><h2>Volume</h2></div>
            {error && <p className="sys-error">{error}</p>}
            {volume?.supported ? (
                <div className="sys-slider-row">
                    <button className="sys-icon-btn" onClick={handleMuteToggle} aria-label="Toggle mute">
                        {volume.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input type="range" min="0" max="100" value={volume.percentage} onChange={handleChange} />
                    <span className="sys-slider-value">{volume.muted ? 'Muted' : `${volume.percentage}%`}</span>
                </div>
            ) : (
                <p className="sys-planned">No audio device found.</p>
            )}
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
            <DisplaySection />
            <PowerSection />
            <VolumeSection />
        </div>
    );
}
