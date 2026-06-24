// Single source of truth for every launchable Perci app/mode. Consumed by
// the Dashboard tile grid (DashboardMode.jsx) and the Sir Perci dock
// launcher (SirPerciLauncher.jsx) so both stay in sync automatically.
import {
    Sparkles, Server, Radar, Layers, Globe, GitMerge,
} from 'lucide-react';
import {
    ChatIcon, CoworkIcon, CodeIcon, NotesIcon, AgentsIcon, ResearchIcon,
    OfficeIcon, MissionIcon, BuildIcon, ProjectsIcon, SkillsIcon, SurfaceMapIcon,
} from '../components/ModeIcons';
import { MODES, OPENCLAW_WINDOW_ID, HERMES_WINDOW_ID, GDASH_WINDOW_ID, EIDOS_WINDOW_ID, LOCALHOST_WINDOW_ID, KLIPIT_WINDOW_ID, SKILLS_WINDOW_ID } from '../context/ModeContext';
import lhLogo from '../assets/lh-logo.png';
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

// Native Perci surfaces — first-class workspace modes.
export const NATIVE_TILES = [
    { id: MODES.POWER_WORKSPACE, icon: Sparkles, title: 'Workspace', desc: 'Ideas, runs & next action', hue: '#fb923c' },
    { id: MODES.SURFACE_MAP, icon: SurfaceMapIcon, title: 'Perci Map', desc: 'Surface relationship map', hue: '#14b8a6' },
    { id: MODES.CHAT, icon: ChatIcon, title: 'Chat', desc: 'Converse with any model', hue: '#f97316' },
    { id: MODES.ENSEMBLE, icon: GitMerge, title: 'Ensemble', desc: 'Panel + judge synthesis', hue: '#818cf8' },
    { id: MODES.COWORK, icon: CoworkIcon, title: 'Cowork', desc: 'Session-based deep work', hue: '#22d3ee' },
    { id: MODES.CODE, icon: CodeIcon, title: 'Code', desc: 'Edit and run your repos', hue: '#a78bfa' },
    { id: MODES.PROJECTS, icon: ProjectsIcon, title: 'Git Shells', desc: 'Manage terminals by project', hue: '#fb923c' },
    { id: MODES.NOTES, icon: NotesIcon, title: 'Notes', desc: 'Markdown wiki with backlinks', hue: '#10b981' },
    { id: MODES.AGENTS, icon: AgentsIcon, title: 'Agents', desc: 'Queue jobs for the CLI crew', hue: '#4ade80' },
    { id: MODES.AUTORESEARCH, icon: ResearchIcon, title: 'Research', desc: 'Prompt-optimization loops', hue: '#f472b6' },
    { id: MODES.OFFICE, icon: OfficeIcon, title: 'Office', desc: 'Visit the crew at Perci HQ', hue: '#fbbf24' },
    { id: MODES.MISSION, icon: MissionIcon, title: 'Mission', desc: 'Supervise runs and checks', hue: '#60a5fa' },
    { id: MODES.BUILD, icon: BuildIcon, title: 'Build', desc: 'Generate and ship projects', hue: '#fb7185' },
    { id: SKILLS_WINDOW_ID, icon: SkillsIcon, title: 'Skills', desc: 'Manage skills & agent CLIs', hue: '#8b5cf6' },
    { id: LOCALHOST_WINDOW_ID, icon: Globe, title: 'Localhost', desc: 'Preview any local dev server', hue: '#34d399', artwork: true, bgImage: localhostBg },
];

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
    { id: MODES.STUDIOOS, icon: Layers, logo: studioosLogo, title: 'StudioOS', desc: 'View/manage your StudioOS workspace', hue: '#3b82f6', artwork: true, bgImage: studioosBg },
];
