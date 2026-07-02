// Single source of truth for every launchable Perci app/mode. Consumed by
// the Dashboard tile grid (DashboardMode.jsx) and the Sir Perci dock
// launcher (SirPerciLauncher.jsx) so both stay in sync automatically.
import {
    Sparkles, Server, Radar, Layers, Globe, GitMerge, TerminalSquare,
} from 'lucide-react';
import {
    ChatIcon, CoworkIcon, CodeIcon, NotesIcon, AgentsIcon, ResearchIcon,
    OfficeIcon, MissionIcon, BuildIcon, ProjectsIcon, SkillsIcon, SurfaceMapIcon, PerciNowIcon, PerciDeskIcon, PackagesIcon, IptvIcon,
} from '../components/ModeIcons';
import { MODES, OPENCLAW_WINDOW_ID, HERMES_WINDOW_ID, GDASH_WINDOW_ID, EIDOS_WINDOW_ID, LOCALHOST_WINDOW_ID, KLIPIT_WINDOW_ID, SKILLS_WINDOW_ID, CLEANMAC_WINDOW_ID, PACKAGES_WINDOW_ID, AGENTMAIL_WINDOW_ID, AUTOFORGE_WINDOW_ID, OPEN_NOTEBOOK_WINDOW_ID, IPTV_WINDOW_ID } from '../context/ModeContext';
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

// Native Perci surfaces — first-class workspace modes.
// Sorted alphabetically by title so the dashboard tile grid and Sir Perci
// launcher stay in sync and are easy to scan.
export const NATIVE_TILES = [
    { id: MODES.AGENTS, icon: AgentsIcon, title: 'Agents', desc: 'Queue jobs for the CLI crew', hue: '#4ade80' },
    { id: MODES.AUTORESEARCH, icon: ResearchIcon, title: 'Autoresearch', desc: 'Prompt-optimization loops', hue: '#f472b6' },
    { id: MODES.BUILD, icon: BuildIcon, title: 'Build', desc: 'Generate and ship projects', hue: '#fb7185' },
    { id: MODES.CHAT, icon: ChatIcon, title: 'Chat', desc: 'Converse with any model', hue: '#f97316' },
    { id: MODES.CODE, icon: CodeIcon, title: 'Code', desc: 'Edit and run your repos', hue: '#a78bfa' },
    { id: MODES.COWORK, icon: CoworkIcon, title: 'Cowork', desc: 'Session-based deep work', hue: '#22d3ee' },
    { id: MODES.PERCI_DESK, icon: PerciDeskIcon, title: 'Desk', desc: 'Perci-wide action desk', hue: '#0f766e' },
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
    { id: SKILLS_WINDOW_ID, icon: SkillsIcon, title: 'Skills', desc: 'Manage skills & agent CLIs', hue: '#f97316' },
];

// Logo presentation hints shared by the Dashboard tile grid and the Sir
// Perci launcher, so both render the same artwork (white backing vs.
// edge-to-edge cover) instead of drifting apart.
export const LOGO_WHITE_BOX_IDS = new Set([GDASH_WINDOW_ID, MODES.STUDIOOS, MODES.LIGHTHOUSE, HERMES_WINDOW_ID, CLEANMAC_WINDOW_ID]);
export const LOGO_FILL_COVER_IDS = new Set([EIDOS_WINDOW_ID, KLIPIT_WINDOW_ID, MODES.BARS, MODES.MARKITDOWN, MODES.CONCERNS, AUTOFORGE_WINDOW_ID, AGENTMAIL_WINDOW_ID, OPEN_NOTEBOOK_WINDOW_ID, IPTV_WINDOW_ID]);

// OS-level tools and external runtimes. Bars belongs here when its Perci
// surface is wired, not in the native Perci app group.
export const SYSTEM_TILES = [
    { id: MODES.LIGHTHOUSE, icon: Radar, logo: lhLogo, title: 'Lighthouse', desc: 'Scan ports and find conflicts', hue: '#ffbf45', artwork: true, bgImage: lighthouseBg },
    { id: OPENCLAW_WINDOW_ID, icon: Server, logo: openclawLogo, title: 'OpenClaw', desc: 'Gateway dashboard', hue: '#ef4444', artwork: true, bgImage: openclawBg },
    { id: HERMES_WINDOW_ID, icon: null, logo: hermesLogo, title: 'Hermes', desc: 'CLI agent — chat, console, sessions', hue: '#eab308', artwork: true },
    { id: GDASH_WINDOW_ID, icon: null, logo: gdashLogo, title: 'G-Dash', desc: 'Google Workspace dashboard', hue: '#4285f4', artwork: true, bgImage: gdashBg },
    { id: EIDOS_WINDOW_ID, icon: null, logo: eidosLogo, title: 'Eidos', desc: 'Persistent memory for AI agents', hue: '#6b7280', artwork: true, bgImage: eidosBg },
    { id: KLIPIT_WINDOW_ID, icon: null, logo: klipitLogo, title: 'Klipit', desc: 'Securely klip the web', hue: '#ec4899', artwork: true, bgImage: klipitBg },
    { id: MODES.BARS, icon: null, logo: barsLogo, title: 'BARS', desc: 'Idea notebook', hue: '#f59e0b', artwork: true, bgImage: barsBg },
    { id: MODES.MARKITDOWN, icon: null, logo: markitdownLogo, title: 'MarkItDownUI', desc: 'Convert files and URLs to Markdown', hue: '#0ea5e9', artwork: true, bgImage: markitdownBg },
    { id: MODES.CONCERNS, icon: null, logo: billboardLogo, title: 'Bill Board', desc: 'Services, keys & subscriptions', hue: '#06b6d4', artwork: true, bgImage: billboardBg },
    { id: MODES.STUDIOOS, icon: Layers, logo: studioosLogo, title: 'StudioOS Review', desc: 'View/manage your StudioOS workspace', hue: '#3b82f6', artwork: true, bgImage: studioosBg },
    { id: CLEANMAC_WINDOW_ID, icon: TerminalSquare, title: 'Cleanmac', desc: 'Clean developer caches on macOS', hue: '#10b981', artwork: true, bgImage: cleanmacBg, iconSize: 34 },
    { id: AUTOFORGE_WINDOW_ID, icon: null, logo: autoforgeLogo, title: 'AutoForge', desc: 'Autonomous coding agent', hue: '#f97316', artwork: true, bgImage: autoforgeBg },
    { id: AGENTMAIL_WINDOW_ID, icon: null, logo: agentmailLogo, title: 'AgentMail', desc: 'Email via AgentMail web console', hue: '#6366f1', artwork: true, bgImage: agentmailBg },
    { id: OPEN_NOTEBOOK_WINDOW_ID, logo: cleanmacLogo, title: 'Open Notebook', desc: 'Embedded localhost notebook window', hue: '#10b981', artwork: true, bgImage: openNotebookBg },
    { id: IPTV_WINDOW_ID, icon: IptvIcon, logo: iptvLogo, title: 'IPTV', desc: 'Watch live TV channels from around the world', hue: '#8b5cf6', artwork: true, bgImage: iptvBg },
];
