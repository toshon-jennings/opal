import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Shield,
    Terminal as TerminalIcon,
    RefreshCw,
    Download,
    ExternalLink,
    Lock,
    HelpCircle,
    Info,
    CheckCircle,
    XCircle,
    Play,
    Settings,
    BookOpen,
    Cpu,
    Smartphone,
    Layers,
    Server,
    AlertTriangle,
} from 'lucide-react';
import simplexLogo from '../assets/simplex-logo.png';
import TerminalPanel from './Terminal';
import './SimplexMode.css';

export default function SimplexMode() {
    const terminalRef = useRef(null);
    const [activeTab, setActiveTab] = useState('console'); // console | guide
    const [cliStatus, setCliStatus] = useState('checking'); // checking | installed | app_installed | missing | unknown
    const [isChecking, setIsChecking] = useState(false);
    const [terminalConnected, setTerminalConnected] = useState(false);

    const checkCliStatus = useCallback(async () => {
        if (!window.electron?.runLocalCommand) {
            setCliStatus('unknown');
            return;
        }
        setIsChecking(true);
        try {
            const cwd = '/Users/toshonjennings/opal';
            
            // 1. Check if simplex-chat CLI is on the system path. `which` alone
            // misses our own install target: runLocalCommand spawns from the
            // Electron main process's inherited PATH (no login-shell profile,
            // so ~/.local/bin is absent), while the install button's PTY
            // terminal does source a profile — so a real install can succeed
            // there and still show as missing here. Also check the known
            // install path directly, same pattern as the desktop-app check below.
            const cliCheck = await window.electron.runLocalCommand('which', ['simplex-chat'], cwd);
            const localBinCheck = await window.electron.runLocalCommand('ls', ['-d', '/Users/toshonjennings/.local/bin/simplex-chat'], cwd);
            const cliInstalled = (cliCheck && cliCheck.exitCode === 0) || (localBinCheck && localBinCheck.exitCode === 0);

            // 2. Check if the SimpleX desktop app exists in /Applications
            const appCheck = await window.electron.runLocalCommand('ls', ['-d', '/Applications/SimpleX.app'], cwd);
            const appInstalled = appCheck && appCheck.exitCode === 0;

            if (cliInstalled) {
                setCliStatus('installed');
            } else if (appInstalled) {
                setCliStatus('app_installed');
            } else {
                setCliStatus('missing');
            }
        } catch (err) {
            console.error('[simplex] CLI/App check failed:', err);
            setCliStatus('missing');
        } finally {
            setIsChecking(false);
        }
    }, []);

    useEffect(() => {
        checkCliStatus();
    }, [checkCliStatus]);

    const handleLaunch = useCallback(() => {
        if (terminalRef.current) {
            terminalRef.current.sendInput('simplex-chat\n');
            terminalRef.current.focus();
        }
    }, []);

    const handleLaunchApp = useCallback(async () => {
        if (!window.electron?.runLocalCommand) return;
        try {
            const cwd = '/Users/toshonjennings/opal';
            await window.electron.runLocalCommand('open', ['-a', 'SimpleX'], cwd);
        } catch (err) {
            console.error('[simplex] Failed to open desktop app:', err);
        }
    }, []);

    const handleInstall = useCallback(() => {
        if (terminalRef.current) {
            const installCmd = 'ARCH=$(uname -m); mkdir -p ~/.local/bin; if [ "$ARCH" = "arm64" ]; then echo "Downloading Apple Silicon binary..."; curl -L -o ~/.local/bin/simplex-chat https://github.com/simplex-chat/simplex-chat/releases/download/v6.5.5/simplex-chat-macos-aarch64; ln -s /opt/homebrew/opt/openssl@3 /opt/homebrew/opt/openssl@3.0 2>/dev/null || true; else echo "Downloading Intel x86_64 binary..."; curl -L -o ~/.local/bin/simplex-chat https://github.com/simplex-chat/simplex-chat/releases/download/v6.5.5/simplex-chat-macos-x86-64; ln -s /usr/local/opt/openssl@3 /usr/local/opt/openssl@3.0 2>/dev/null || true; fi; chmod +x ~/.local/bin/simplex-chat; codesign --force --sign - ~/.local/bin/simplex-chat; simplex-chat --version\n';
            terminalRef.current.sendInput(installCmd);
            terminalRef.current.focus();
        }
    }, []);

    const handleStatusChange = useCallback((status) => {
        setTerminalConnected(status === 'connected');
    }, []);

    const isElectron = Boolean(window.electron);

    return (
        <div className="simplex-mode">
            {/* Top Navigation Header */}
            <header className="simplex-window-header">
                <div className="simplex-window-title">
                    <img src={simplexLogo} alt="" className="simplex-window-logo" />
                    <span>SimpleX Chat</span>
                </div>
                <div className="simplex-window-tabs">
                    <button
                        type="button"
                        className={`simplex-window-tab-btn ${activeTab === 'console' ? 'active' : ''}`}
                        onClick={() => setActiveTab('console')}
                    >
                        <TerminalIcon size={13} />
                        Console
                    </button>
                    <button
                        type="button"
                        className={`simplex-window-tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
                        onClick={() => setActiveTab('guide')}
                    >
                        <BookOpen size={13} />
                        User Guide
                    </button>
                </div>
            </header>

            {activeTab === 'console' ? (
                <div className="simplex-container">
                    {/* Left Panel: Information & Controls */}
                    <div className="simplex-info-panel">
                        <div className="simplex-scrollable-content">
                            {/* Section 1: Core Features */}
                            <section className="simplex-card simplex-about-card">
                                <h2 className="simplex-card-title">
                                    <Shield size={16} className="text-blue-500" />
                                    Why SimpleX?
                                </h2>
                                <ul className="simplex-feature-list">
                                    <li>
                                        <span className="simplex-feature-bullet"></span>
                                        <div>
                                            <strong>No User Identifiers:</strong> SimpleX has no phone numbers, email addresses, usernames, or random ID numbers.
                                        </div>
                                    </li>
                                    <li>
                                        <span className="simplex-feature-bullet"></span>
                                        <div>
                                            <strong>Unlinkable Profiles:</strong> Every contact connection uses independent, double-ratchet encrypted queues, rendering communication graphs invisible.
                                        </div>
                                    </li>
                                    <li>
                                        <span className="simplex-feature-bullet"></span>
                                        <div>
                                            <strong>Open & Decentralized:</strong> Self-host your own SMP servers or use default public servers to relay message traffic.
                                        </div>
                                    </li>
                                </ul>
                            </section>

                            {/* Section 2: Connection Status */}
                            <section className="simplex-card simplex-control-card">
                                <h2 className="simplex-card-title">
                                    <Cpu size={16} className="text-amber-500" />
                                    Connection Status
                                </h2>

                                <div className="simplex-status-indicator">
                                    <span className="simplex-status-label">Status:</span>
                                    {cliStatus === 'checking' && (
                                        <span className="simplex-badge simplex-badge-checking">
                                            <RefreshCw size={12} className="animate-spin" /> Checking...
                                        </span>
                                    )}
                                    {cliStatus === 'installed' && (
                                        <span className="simplex-badge simplex-badge-installed">
                                            <CheckCircle size={12} /> CLI Installed
                                        </span>
                                    )}
                                    {cliStatus === 'app_installed' && (
                                        <span className="simplex-badge simplex-badge-installed">
                                            <CheckCircle size={12} /> App Installed
                                        </span>
                                    )}
                                    {cliStatus === 'missing' && (
                                        <span className="simplex-badge simplex-badge-missing">
                                            <XCircle size={12} /> Not Found
                                        </span>
                                    )}
                                    {cliStatus === 'unknown' && (
                                        <span className="simplex-badge simplex-badge-unknown">
                                            <HelpCircle size={12} /> Unknown
                                        </span>
                                    )}

                                    <button
                                        type="button"
                                        onClick={checkCliStatus}
                                        disabled={isChecking}
                                        className="simplex-refresh-btn"
                                        title="Recheck CLI installation"
                                    >
                                        <RefreshCw size={12} className={isChecking ? 'animate-spin' : ''} />
                                    </button>
                                </div>

                                {!isElectron ? (
                                    <div className="simplex-alert simplex-alert-warning">
                                        <Info size={14} className="shrink-0" />
                                        <span>SimpleX integration requires the Perci Desktop App.</span>
                                    </div>
                                ) : cliStatus === 'installed' ? (
                                    <div className="simplex-actions">
                                        <p className="simplex-action-hint">
                                            SimpleX Chat CLI is ready. Click below to launch the client inside the terminal.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleLaunch}
                                            disabled={!terminalConnected}
                                            className="simplex-btn simplex-btn-primary"
                                        >
                                            <Play size={14} fill="currentColor" />
                                            Launch SimpleX Chat CLI
                                        </button>
                                    </div>
                                ) : cliStatus === 'app_installed' ? (
                                    <div className="simplex-actions">
                                        <p className="simplex-action-hint">
                                            SimpleX Desktop App is installed. Click below to open it.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleLaunchApp}
                                            className="simplex-btn simplex-btn-primary"
                                        >
                                            <Play size={14} fill="currentColor" />
                                            Open SimpleX Desktop App
                                        </button>
                                        <div className="simplex-divider-text">Or launch CLI inside Perci:</div>
                                        <button
                                            type="button"
                                            onClick={handleInstall}
                                            disabled={!terminalConnected}
                                            className="simplex-btn simplex-btn-outline"
                                            title="Run official CLI installation script in the terminal"
                                        >
                                            <Download size={14} />
                                            Install CLI Client
                                        </button>
                                    </div>
                                ) : cliStatus === 'missing' ? (
                                    <div className="simplex-actions">
                                        <div className="simplex-alert simplex-alert-info">
                                            <Info size={14} className="shrink-0" />
                                            <span>
                                                SimpleX CLI is not installed. You can install it using the official install script.
                                            </span>
                                        </div>
                                        <div className="simplex-btn-group">
                                            <button
                                                type="button"
                                                onClick={handleInstall}
                                                disabled={!terminalConnected}
                                                className="simplex-btn simplex-btn-secondary"
                                                title="Run official CLI installation script in the terminal"
                                            >
                                                <Download size={14} />
                                                Install CLI Client
                                            </button>
                                            <a
                                                href="https://simplex.chat/downloads/"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => {
                                                    if (window.electron?.openExternal) {
                                                        e.preventDefault();
                                                        window.electron.openExternal('https://simplex.chat/downloads/');
                                                    }
                                                }}
                                                className="simplex-btn simplex-btn-outline"
                                            >
                                                <ExternalLink size={14} />
                                                Official Downloads
                                            </a>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="simplex-actions">
                                        <p className="simplex-action-hint">
                                            Could not auto-detect the CLI executable. You can try installing it or launching manually.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleLaunch}
                                            disabled={!terminalConnected}
                                            className="simplex-btn simplex-btn-secondary"
                                        >
                                            <Play size={14} fill="currentColor" />
                                            Attempt Launch
                                        </button>
                                    </div>
                                )}

                                <div className="simplex-alert simplex-alert-multi-client" style={{ marginTop: '14px', marginBottom: '0' }}>
                                    <AlertTriangle size={14} className="shrink-0" />
                                    <span>
                                        <strong>Multi-Client Warning:</strong> The CLI (<code>~/.simplex</code>) and Desktop app (<code>~/.local/share/simplex</code>) use different directories. If you share databases between them, <strong>never run both apps simultaneously</strong>, as they will desynchronize double-ratchet keys.
                                    </span>
                                </div>
                            </section>

                            {/* Section 3: Links */}
                            <section className="simplex-card simplex-links-card">
                                <h2 className="simplex-card-title">
                                    <Settings size={16} className="text-blue-500" />
                                    References & Resources
                                </h2>
                                <div className="simplex-link-grid">
                                    <a
                                        href="https://simplex.chat"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => {
                                            if (window.electron?.openExternal) {
                                                e.preventDefault();
                                                window.electron.openExternal('https://simplex.chat');
                                            }
                                        }}
                                        className="simplex-link-item"
                                    >
                                        <Lock size={12} />
                                        <span>Official Website</span>
                                        <ExternalLink size={10} className="ml-auto" />
                                    </a>
                                    <a
                                        href="https://github.com/simplex-chat/simplex-chat"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => {
                                            if (window.electron?.openExternal) {
                                                e.preventDefault();
                                                window.electron.openExternal('https://github.com/simplex-chat/simplex-chat');
                                            }
                                        }}
                                        className="simplex-link-item"
                                    >
                                        <TerminalIcon size={12} />
                                        <span>GitHub Repository</span>
                                        <ExternalLink size={10} className="ml-auto" />
                                    </a>
                                </div>
                            </section>
                        </div>
                    </div>

                    {/* Right Panel: Embedded Interactive Terminal */}
                    <div className="simplex-terminal-panel">
                        <TerminalPanel
                            ref={terminalRef}
                            sessionId="simplex"
                            embedded
                            onStatusChange={handleStatusChange}
                        />
                    </div>
                </div>
            ) : (
                /* User Guide Full Tab */
                <div className="simplex-guide-container">
                    <div className="simplex-guide-content">
                        <h1 className="simplex-guide-main-title">SimpleX Chat Field Guide</h1>
                        <p className="simplex-guide-kicker">
                            Understanding metadata-privacy, console clients, and self-hosted message routing.
                        </p>

                        <section className="simplex-guide-section">
                            <h2 className="simplex-guide-heading">
                                <Shield size={18} className="text-blue-500 shrink-0" />
                                1. How SimpleX Achieves Privacy
                            </h2>
                            <p>
                                Standard secure messengers (like Signal or WhatsApp) require central user directories or random IDs. This makes it possible to reconstruct your **social graph**—who you talk to, when, and how often.
                            </p>
                            <p>
                                SimpleX achieves absolute privacy by eliminating the concept of user accounts. Instead of sending messages to users, SimpleX sends messages to unidirectional **queues** hosted on servers:
                            </p>
                            <ul className="simplex-guide-list">
                                <li><strong>No Identities:</strong> You don't have a global address. Contacts cannot see who else you talk to.</li>
                                <li><strong>Separate Queues:</strong> Every connection has two separate queues (inbound and outbound).</li>
                                <li><strong>Onion Routed:</strong> Messages are routed through multiple servers to hide the relationship between sender and receiver.</li>
                            </ul>
                        </section>

                        <section className="simplex-guide-section">
                            <h2 className="simplex-guide-heading">
                                <TerminalIcon size={18} className="text-amber-500 shrink-0" />
                                2. SimpleX CLI Terminal Guide
                            </h2>
                            <p>
                                The interactive terminal client is a lightweight, efficient TUI. When you start the console, you enter an interactive chat shell.
                            </p>
                            
                            <h3>Common CLI Commands</h3>
                            <div className="simplex-command-table-wrapper">
                                <table className="simplex-command-table">
                                    <thead>
                                        <tr>
                                            <th>Command</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><code>/h</code> or <code>/help</code></td>
                                            <td>View all available commands in the current context.</td>
                                        </tr>
                                        <tr>
                                            <td><code>/c &lt;invite-link&gt;</code></td>
                                            <td>Establish a connection with another user via their invite link.</td>
                                        </tr>
                                        <tr>
                                            <td><code>/profile</code></td>
                                            <td>View and edit your local chat profile/display name.</td>
                                        </tr>
                                        <tr>
                                            <td><code>/name &lt;label&gt;</code></td>
                                            <td>Change a contact's display label on your device.</td>
                                        </tr>
                                        <tr>
                                            <td><code>/incognito</code></td>
                                            <td>Generate a single-use contact link under a temporary profile name.</td>
                                        </tr>
                                        <tr>
                                            <td><code>/q</code> or <code>/exit</code></td>
                                            <td>Gracefully exit the terminal client.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="simplex-guide-section">
                            <h2 className="simplex-guide-heading">
                                <Smartphone size={18} className="text-blue-500 shrink-0" />
                                3. Linking CLI with Mobile Apps
                            </h2>
                            <p>
                                You can link the local desktop client to your phone's SimpleX app to check messages on both devices:
                            </p>
                            <ol className="simplex-guide-steps">
                                <li>In the CLI client, run the command <code>/link</code> (or go to settings inside the app).</li>
                                <li>This will generate a secure linking URI or display a terminal QR code.</li>
                                <li>Open SimpleX Chat on your phone, go to <strong>Settings &gt; Link Desktop App</strong>.</li>
                                <li>Scan the QR code or enter the link URI to secure and sync your chat keys.</li>
                            </ol>
                        </section>

                        <section className="simplex-guide-section">
                            <h2 className="simplex-guide-heading">
                                <Server size={18} className="text-purple-500 shrink-0" />
                                4. Self-Hosting SMP Relay Servers
                            </h2>
                            <p>
                                By default, SimpleX uses public relay servers. If you want maximum autonomy, you can host your own SMP (SimpleX Messaging Protocol) server using Docker:
                            </p>
                            
                            <div className="simplex-code-header">docker-compose.yml snippet</div>
                            <pre className="simplex-code-block">
{`version: '3.8'
services:
  smp-server:
    image: simplexchat/smp-server:latest
    container_name: simplex-smp-server
    restart: always
    ports:
      - "5223:5223"
    volumes:
      - ./smp-data:/etc/opt/simplex
    environment:
      - ADDR=smp.yourdomain.com
      - PASS=your_secure_server_password`}
                            </pre>
                            <p className="simplex-guide-note">
                                <strong>Note:</strong> Once your container is running, check logs (<code>docker logs simplex-smp-server</code>) to get the server address string. Add it inside your app under <strong>Network Settings &gt; Custom Servers</strong>.
                            </p>
                        </section>

                        <section className="simplex-guide-section">
                            <h2 className="simplex-guide-heading">
                                <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                                5. Database Sharing & Safety Warning
                            </h2>
                            <p>
                                Because SimpleX Chat CLI and the Desktop app store their databases in different directories by default, they do not share profiles out-of-the-box:
                            </p>
                            <ul className="simplex-guide-list">
                                <li><strong>CLI database directory:</strong> <code>~/.simplex/</code></li>
                                <li><strong>Desktop app directory:</strong> <code>~/.local/share/simplex/</code></li>
                            </ul>
                            <div className="simplex-alert simplex-alert-multi-client" style={{ marginTop: '14px', marginBottom: '0' }}>
                                <AlertTriangle size={14} className="shrink-0" />
                                <span>
                                    <strong>Multi-Client Warning:</strong> If you decide to copy or symlink these database files to share your profile across both clients, you <strong>must never run the CLI and the Desktop app at the same time</strong>. SimpleX relies on active unidirectional queues with double-ratchet keys; running both clients simultaneously will intercept messages out of order, desynchronize the encryption state, and permanently break your chat connections.
                                </span>
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </div>
    );
}
