import React from 'react';
import {
    Sparkles, Server, Radar, Layers, Globe, GitMerge, TerminalSquare, Container, Database,
} from 'lucide-react';
import {
    ChatIcon, CoworkIcon, CodeIcon, NotesIcon, AgentsIcon, CodexMicroIcon, ResearchIcon,
    OfficeIcon, MissionIcon, BuildIcon, ProjectsIcon, SkillsIcon, SurfaceMapIcon, PerciNowIcon, PerciDeskIcon, PackagesIcon, IptvIcon, ShipyardIcon, DocketIcon,
} from '../components/ModeIcons';
import { MODES, OPENCLAW_WINDOW_ID, HERMES_WINDOW_ID, GDASH_WINDOW_ID, EIDOS_WINDOW_ID, LOCALHOST_WINDOW_ID, KLIPIT_WINDOW_ID, SKILLS_WINDOW_ID, CLEANMAC_WINDOW_ID, PACKAGES_WINDOW_ID, AGENTMAIL_WINDOW_ID, AUTOFORGE_WINDOW_ID, OPEN_NOTEBOOK_WINDOW_ID, IPTV_WINDOW_ID, SIMPLEX_WINDOW_ID, PXPIPE_WINDOW_ID, KEYSAFE_WINDOW_ID, APFEL_WINDOW_ID, ALIAS_MANAGER_WINDOW_ID, DOCKER_WINDOW_ID, DB_INSPECTOR_WINDOW_ID, GITHUB_OVERVIEW_WINDOW_ID } from '../context/ModeContext';
import lhLogo from '../assets/lh-logo.png';
import autoforgeLogo from '../assets/autoforge-logo.png';
import hermesLogo from '../assets/nousresearch.png';
import gdashLogo from '../assets/gdash2-cropped.png';
import gdashBg from '../assets/gdash-bg.jpg';
import lighthouseBg from '../assets/lighthouse-bg.jpg';
import openclawBg from '../assets/openclaw-bg.jpg';
import barsBg from '../assets/bars-bg.jpg';
import billboardBg from '../assets/billboard-bg.jpg';
import studioosBg from '../assets/studioos-bg.jpg';
import eidosLogo from '../assets/eidos-logo.png';
import eidosBg from '../assets/logo-opal-shadow.png';
import localhostBg from '../assets/localhost.jpeg';
import barsLogo from '../assets/bars-logo.svg';
import markitdownLogo from '../assets/markitdown-logo.jpeg';
import markitdownBg from '../assets/markitdown-bg.jpeg';
import billboardLogo from '../assets/billboard-logo.svg';
import openclawLogo from '../assets/openclaw-logo.svg';
import studioosLogo from '../assets/studioos-logo-dark.png';
import klipitLogo from '../assets/klipit-logo.png';
import klipitBg from '../assets/klipit-bg.jpeg';
import agentmailLogo from '../assets/agentmail-logo.png';
import agentmailBg from '../assets/agentmail-bg.jpeg';
import cleanmacBg from '../assets/cleanmac-bg.jpeg';
import cleanmacLogo from '../assets/cleanmac-logo.jpeg';
import autoforgeBg from '../assets/autoforge-bg.jpeg';
import openNotebookBg from '../assets/open-notebook-bg.jpeg';
import iptvLogo from '../assets/iptv-logo.png';
import iptvBg from '../assets/iptv-bg.jpeg';
import simplexLogo from '../assets/simplex-logo.png';
import simplexBg from '../assets/simplex-bg.jpg';
import keysafeLogo from '../assets/keysafe-logo.jpeg';
import keysafeBg from '../assets/keysafe-bg.jpeg';
import apfelBg from '../assets/apfel-bg.jpeg';
import pxpipeBg from '../assets/pxpipe-bg.jpeg';
import dockerBg from '../assets/docker-bg.jpg';
import githubOverviewLogo from '../assets/github-overview-logo.png';
import githubOverviewBg from '../assets/github-overview-bg.jpeg';
import codexMicroLogo from '../assets/codex-micro-logo.png';
import codexMicroBg from '../assets/codex-micro-bg.jpeg';

// pxpipe sphere icon component — gradient filled circle
function SphereIcon(props) {
    return (
        <svg
            {...props}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={props.className}
            style={{ color: props.color || 'currentColor' }}
        >
            <defs>
                <linearGradient id="pxpipe-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <radialGradient id="pxpipe-sphere" cx="40%" cy="40%" r="60%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                </radialGradient>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#pxpipe-gradient)" />
            <circle cx="12" cy="12" r="10" fill="url(#pxpipe-sphere)" />
        </svg>
    );
}

// Apfel custom vector branding icon
function ApfelTileIcon({ size = 20, className, style, ...props }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={style}
            {...props}
        >
            <defs>
                <linearGradient id="apple-rainbow-tile" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4DA64D"/>
                    <stop offset="20%" stopColor="#E8B32A"/>
                    <stop offset="40%" stopColor="#E07A2E"/>
                    <stop offset="60%" stopColor="#D04545"/>
                    <stop offset="80%" stopColor="#8E4E9A"/>
                    <stop offset="100%" stopColor="#2E94C9"/>
                </linearGradient>
            </defs>
            <circle cx="12" cy="14" r="8" fill="url(#apple-rainbow-tile)"/>
            <path d="M12 6.5c0-2.8 1.8-4 3.2-4.2" stroke="#4DA64D" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        </svg>
    );
}

// Native Perci surfaces — first-class workspace modes.
// Sorted alphabetically by title so the dashboard tile grid and Sir Perci
// launcher stay in sync and are easy to scan.
export const NATIVE_TILES = [
    { id: ALIAS_MANAGER_WINDOW_ID, icon: TerminalSquare, title: 'Alias Manager', desc: 'System alias configuration', hue: '#14b8a6' },
    { id: MODES.AGENTS, icon: AgentsIcon, title: 'Agents', desc: 'Queue jobs for the CLI crew', hue: '#4ade80' },
    { id: MODES.AUTORESEARCH, icon: ResearchIcon, title: 'Autoresearch', desc: 'Prompt-optimization loops', hue: '#f472b6' },
    { id: MODES.BUILD, icon: BuildIcon, title: 'Build', desc: 'Generate and ship projects', hue: '#fb923c' },
    { id: MODES.CHAT, icon: ChatIcon, title: 'Chat', desc: 'Converse with any model', hue: '#f97316' },
    { id: MODES.CODE, icon: CodeIcon, title: 'Code', desc: 'Edit and run your repos', hue: '#a78bfa' },
    { id: MODES.COWORK, icon: CoworkIcon, title: 'Cowork', desc: 'Session-based deep work', hue: '#22d3ee' },
    { id: DB_INSPECTOR_WINDOW_ID, icon: Database, title: 'DB Inspector', desc: 'Browse local SQLite schemas & rows', hue: '#22c55e' },
    { id: MODES.PERCI_DESK, icon: PerciDeskIcon, title: 'Desk', desc: 'Perci-wide action desk', hue: '#0f766e' },
    { id: MODES.DOCKET, icon: DocketIcon, title: 'Docket', desc: 'Intake queue & device fleet ledger', hue: '#fb923c' },
    { id: MODES.ENSEMBLE, icon: GitMerge, title: 'Ensemble', desc: 'Panel + judge synthesis', hue: '#818cf8' },
    { id: MODES.PROJECTS, icon: ProjectsIcon, title: 'Git Shells', desc: 'Manage terminals by project', hue: '#f97316' },
    { id: LOCALHOST_WINDOW_ID, icon: Globe, title: 'Localhost', desc: 'Preview any local dev server', hue: '#f97316', artwork: true, bgImage: localhostBg },
    { id: MODES.MISSION, icon: MissionIcon, title: 'Mission Control', desc: 'Supervise runs and checks', hue: '#60a5fa' },
    { id: MODES.NOTES, icon: NotesIcon, title: 'Notes', desc: 'Markdown wiki with backlinks', hue: '#10b981' },
    { id: MODES.OFFICE, icon: OfficeIcon, title: 'Office', desc: 'Visit the crew at Perci HQ', hue: '#fbbf24' },
    { id: PACKAGES_WINDOW_ID, icon: PackagesIcon, title: 'Packages', desc: 'Registry dashboard for package updates', hue: '#8b5cf6' },
    { id: MODES.SURFACE_MAP, icon: SurfaceMapIcon, title: 'Perci Map', desc: 'Surface relationship map', hue: '#14b8a6' },
    { id: MODES.PERCI_NOW, icon: PerciNowIcon, title: 'Perci Now', desc: 'Live workspace state', hue: '#0891b2' },
    { id: MODES.POWER_WORKSPACE, icon: Sparkles, title: 'Power Workspace', desc: 'Ideas, runs & next action', hue: '#f97316' },
    { id: MODES.SHIPYARD, icon: ShipyardIcon, title: 'Shipyard', desc: 'AI project manager & kanban board', hue: '#f97316' },
    { id: SKILLS_WINDOW_ID, icon: SkillsIcon, title: 'Skills', desc: 'Manage skills & agent CLIs', hue: '#f97316' },
];

// Logo presentation hints shared by the Dashboard tile grid and the Sir
// Perci launcher, so both render the same artwork (white backing vs.
// edge-to-edge cover) instead of drifting apart.
export const LOGO_WHITE_BOX_IDS = new Set([GDASH_WINDOW_ID, MODES.STUDIOOS, MODES.LIGHTHOUSE, HERMES_WINDOW_ID, CLEANMAC_WINDOW_ID, GITHUB_OVERVIEW_WINDOW_ID]);
export const LOGO_FILL_COVER_IDS = new Set([EIDOS_WINDOW_ID, KLIPIT_WINDOW_ID, MODES.BARS, MODES.MARKITDOWN, MODES.CONCERNS, AUTOFORGE_WINDOW_ID, AGENTMAIL_WINDOW_ID, OPEN_NOTEBOOK_WINDOW_ID, IPTV_WINDOW_ID, SIMPLEX_WINDOW_ID, KEYSAFE_WINDOW_ID, MODES.CODEX_MICRO]);

// OS-level tools and external runtimes. Bars belongs here when its Perci
// surface is wired, not in the native Perci app group.
export const SYSTEM_TILES = [
    { id: MODES.CODEX_MICRO, icon: CodexMicroIcon, logo: codexMicroLogo, title: 'Perci Pocket', desc: 'Digital task & AI command deck', hue: '#0ea5e9', artwork: true, bgImage: codexMicroBg },
    { id: MODES.LIGHTHOUSE, icon: Radar, logo: lhLogo, title: 'Lighthouse', desc: 'Scan ports and find conflicts', hue: '#ffbf45', artwork: true, bgImage: lighthouseBg },
    { id: OPENCLAW_WINDOW_ID, icon: Server, logo: openclawLogo, title: 'OpenClaw', desc: 'Chat with your always-on agent', hue: '#ef4444', artwork: true, bgImage: openclawBg },
    { id: HERMES_WINDOW_ID, icon: null, logo: hermesLogo, title: 'Hermes', desc: 'CLI agent — chat, console, sessions', hue: '#eab308', artwork: true },
    { id: GDASH_WINDOW_ID, icon: null, logo: gdashLogo, title: 'G-Dash', desc: 'Google Workspace dashboard', hue: '#4285f4', artwork: true, bgImage: gdashBg },
    { id: EIDOS_WINDOW_ID, icon: null, logo: eidosLogo, title: 'Eidos', desc: 'Persistent memory for AI agents', hue: '#6b7280', artwork: true, bgImage: eidosBg },
    { id: KLIPIT_WINDOW_ID, icon: null, logo: klipitLogo, title: 'Klipit Browser', desc: 'Securely klip the web', hue: '#ec4899', artwork: true, bgImage: klipitBg },
    { id: MODES.BARS, icon: null, logo: barsLogo, title: 'BARS', desc: 'Idea notebook', hue: '#f59e0b', artwork: true, bgImage: barsBg },
    { id: MODES.MARKITDOWN, icon: null, logo: markitdownLogo, title: 'MarkItDownUI', desc: 'Convert files and URLs to Markdown', hue: '#0ea5e9', artwork: true, bgImage: markitdownBg },
    { id: MODES.CONCERNS, icon: null, logo: billboardLogo, title: 'Bill Board', desc: 'Services, keys, & subscriptions', hue: '#06b6d4', artwork: true, bgImage: billboardBg },
    { id: MODES.STUDIOOS, icon: Layers, logo: studioosLogo, title: 'SOS-Glance', desc: 'View/manage your StudioOS workspace', hue: '#3b82f6', artwork: true, bgImage: studioosBg },
    { id: CLEANMAC_WINDOW_ID, icon: TerminalSquare, title: 'Cleanmac', desc: 'Clean developer caches on macOS', hue: '#10b981', artwork: true, bgImage: cleanmacBg, iconSize: 34 },
    { id: AUTOFORGE_WINDOW_ID, icon: null, logo: autoforgeLogo, title: 'AutoForge', desc: 'Autonomous coding agent', hue: '#f97316', artwork: true, bgImage: autoforgeBg },
    { id: AGENTMAIL_WINDOW_ID, icon: null, logo: agentmailLogo, title: 'AgentMail', desc: 'Email via AgentMail web console', hue: '#6366f1', artwork: true, bgImage: agentmailBg },
    { id: OPEN_NOTEBOOK_WINDOW_ID, logo: cleanmacLogo, title: 'Open Notebook', desc: 'Embedded localhost notebook window', hue: '#10b981', artwork: true, bgImage: openNotebookBg },
    { id: IPTV_WINDOW_ID, icon: IptvIcon, logo: iptvLogo, title: 'IPTV', desc: 'Watch live TV channels from around the world', hue: '#8b5cf6', artwork: true, bgImage: iptvBg },
    { id: SIMPLEX_WINDOW_ID, icon: null, logo: simplexLogo, title: 'SimpleX', desc: 'Secure, private chat client', hue: '#0197ff', artwork: true, bgImage: simplexBg },
    { id: PXPIPE_WINDOW_ID, icon: SphereIcon, title: 'pxpipe', desc: 'Token-compression proxy dashboard', hue: '#a855f7', artwork: true, bgImage: pxpipeBg },
    { id: KEYSAFE_WINDOW_ID, icon: null, logo: keysafeLogo, title: 'KeySafe', desc: 'Secure local API keys & recovery codes', hue: '#0ea5e9', artwork: true, bgImage: keysafeBg },
    { id: APFEL_WINDOW_ID, icon: ApfelTileIcon, logo: null, title: 'Apfel', desc: 'GUI harness for Apple Intelligence via the apfel CLI', hue: '#60a5fa', artwork: true, bgImage: apfelBg, iconSize: 26 },
    { id: GITHUB_OVERVIEW_WINDOW_ID, icon: null, logo: githubOverviewLogo, title: 'GitHub Overview', desc: 'Commits, CI, alerts, & PRs for your repos', hue: '#6e5494', artwork: true, bgImage: githubOverviewBg },
    { id: DOCKER_WINDOW_ID, icon: Container, title: 'Containers', desc: 'Containers, images, & volumes with backup-gated removal', hue: '#2496ed', artwork: true, bgImage: dockerBg },
];
