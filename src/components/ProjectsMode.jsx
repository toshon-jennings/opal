import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Folder, FolderPlus, Terminal as TerminalIcon, Plus, X, 
  RefreshCw, RotateCcw, Edit2, Trash2,
  ChevronRight, Copy, Check
} from 'lucide-react';
import { useMode, MODES } from '../context/ModeContext';
import { hasElectronStore, loadElectronPersistence, saveElectronPersistence } from '../lib/persistentStore';
import TerminalPanel from './Terminal';
import gitshellsBg from '../assets/gitshells-bg.jpg';
import './ProjectsMode.css';

const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
const cleanAnsi = (str) => str.replace(ANSI_REGEX, '');
const GITSHELLS_PROJECTS_KEY = 'gitshells_projects';
const SUPATERM_ACTIVE_PROJECT_KEY = 'supaterm_active_project_id';
const SUPATERM_ACTIVE_TERMINAL_KEY = 'supaterm_active_terminal_id';
const GITSHELLS_SIDEBAR_WIDTH_KEY = 'gitshells_sidebar_width';
const DEFAULT_SIDEBAR_WIDTH = 250;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;
const DIRECTORY_PICKER_TIMEOUT_MS = 6000;

function parseStoredProjects(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse Git Shells projects:', err);
    return [];
  }
}

function hasVisibleFocus() {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden' && document.hasFocus();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clampSidebarWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function getDefaultProjectName(folderPath) {
  const cleanPath = String(folderPath || '').trim().replace(/[/\\]$/, '');
  const parts = cleanPath.split(/[/\\]/);
  return parts[parts.length - 1] || 'New Project';
}

function getCustomShellTitle(terminal) {
  const label = String(terminal?.label || '').trim();
  return /^shell \d+$/i.test(label) ? '' : label;
}

function getShellLabel(terminal, index) {
  const title = getCustomShellTitle(terminal);
  return title ? `${index + 1} > ${title}` : `Shell ${index + 1}`;
}

function ProjectDraftForm({ draft, onChange, onCancel, onSubmit }) {
  if (!draft) return null;

  return (
    <form onSubmit={onSubmit} className="m-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Register Project</div>
      <label className="block space-y-1">
        <span className="text-[10px] text-[var(--text-tertiary)]">Folder path</span>
        <input
          autoFocus
          value={draft.path}
          onChange={event => onChange({ ...draft, path: event.target.value, name: draft.name || getDefaultProjectName(event.target.value) })}
          placeholder="/Users/name/project"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-amber-500"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[10px] text-[var(--text-tertiary)]">Project name</span>
        <input
          value={draft.name}
          onChange={event => onChange({ ...draft, name: event.target.value })}
          placeholder="Project name"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-amber-500"
        />
      </label>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-amber-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-amber-600 transition-colors"
        >
          Register
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ProjectsMode() {
  const { openWindow } = useMode();
  
  // Projects State
  const [projects, setProjects] = useState(() => {
    return parseStoredProjects(localStorage.getItem(GITSHELLS_PROJECTS_KEY));
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    return clampSidebarWidth(localStorage.getItem(GITSHELLS_SIDEBAR_WIDTH_KEY));
  });

  const projectsRef = useRef(projects);
  const sidebarRef = useRef(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const sidebarDragRef = useRef(null);
  const electronPersistenceReadyRef = useRef(!hasElectronStore());
  const appFocusedRef = useRef(hasVisibleFocus());

  useEffect(() => {
    if (!hasElectronStore()) return;

    let isMounted = true;
    async function hydrateProjects() {
      try {
        const electronData = await loadElectronPersistence();
        if (!isMounted) return;
        if (typeof electronData?.gitshells_projects === 'string') {
          localStorage.setItem(GITSHELLS_PROJECTS_KEY, electronData.gitshells_projects);
          setProjects(parseStoredProjects(electronData.gitshells_projects));
        }
        if (typeof electronData?.gitshells_sidebar_width === 'string') {
          const storedWidth = clampSidebarWidth(electronData.gitshells_sidebar_width);
          localStorage.setItem(GITSHELLS_SIDEBAR_WIDTH_KEY, String(storedWidth));
          sidebarWidthRef.current = storedWidth;
          setSidebarWidth(storedWidth);
        }
      } catch (err) {
        console.error('Failed to hydrate Git Shells projects:', err);
      } finally {
        if (isMounted) {
          electronPersistenceReadyRef.current = true;
        }
      }
    }

    hydrateProjects();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    projectsRef.current = projects;
    const serialized = JSON.stringify(projects);
    localStorage.setItem(GITSHELLS_PROJECTS_KEY, serialized);
    if (electronPersistenceReadyRef.current) {
      saveElectronPersistence({ gitshells_projects: serialized })
        .catch(err => console.error('Failed to persist Git Shells projects:', err));
    }
  }, [projects]);

  // Selected state
  const [activeProjectId, setActiveProjectId] = useState(() => {
    return localStorage.getItem(SUPATERM_ACTIVE_PROJECT_KEY) || localStorage.getItem('perci_active_project_id') || null;
  });
  
  const [activeTerminalId, setActiveTerminalId] = useState(() => {
    return localStorage.getItem(SUPATERM_ACTIVE_TERMINAL_KEY) || localStorage.getItem('perci_active_terminal_id') || null;
  });

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem(SUPATERM_ACTIVE_PROJECT_KEY, activeProjectId);
    } else {
      localStorage.removeItem(SUPATERM_ACTIVE_PROJECT_KEY);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (activeTerminalId) {
      localStorage.setItem(SUPATERM_ACTIVE_TERMINAL_KEY, activeTerminalId);
    } else {
      localStorage.removeItem(SUPATERM_ACTIVE_TERMINAL_KEY);
    }
  }, [activeTerminalId]);

  // Connection and unread states
  const [statuses, setStatuses] = useState({});
  const [unreadTerminals, setUnreadTerminals] = useState({});
  const [copiedPath, setCopiedPath] = useState(false);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [addProjectHint, setAddProjectHint] = useState('');
  const [projectDraft, setProjectDraft] = useState(null);
  const [shellRename, setShellRename] = useState(null);

  const updateSidebarWidth = (width, render = true) => {
    const nextWidth = clampSidebarWidth(width);
    sidebarWidthRef.current = nextWidth;
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${nextWidth}px`;
    }
    if (render) setSidebarWidth(nextWidth);
  };

  const persistSidebarWidth = () => {
    const value = String(sidebarWidthRef.current);
    localStorage.setItem(GITSHELLS_SIDEBAR_WIDTH_KEY, value);
    if (electronPersistenceReadyRef.current) {
      saveElectronPersistence({ gitshells_sidebar_width: value })
        .catch(err => console.error('Failed to persist Git Shells sidebar width:', err));
    }
  };

  const handleSidebarResizeStart = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sidebarDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidthRef.current
    };
  };

  const handleSidebarResizeMove = (event) => {
    const drag = sidebarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateSidebarWidth(drag.startWidth + event.clientX - drag.startX, false);
  };

  const handleSidebarResizeEnd = (event) => {
    const drag = sidebarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    sidebarDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setSidebarWidth(sidebarWidthRef.current);
    persistSidebarWidth();
  };

  const handleSidebarResizeKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    updateSidebarWidth(sidebarWidthRef.current + (event.key === 'ArrowLeft' ? -10 : 10));
    persistSidebarWidth();
  };

  // Refs for tracking data and timers
  const lastOutputData = useRef({});
  const activityTimers = useRef({});
  const initializedDirs = useRef(new Set());
  const panelRefs = useRef({});

  // Request Notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = activityTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const syncFocus = () => {
      appFocusedRef.current = hasVisibleFocus();
    };

    syncFocus();
    window.addEventListener('focus', syncFocus);
    window.addEventListener('blur', syncFocus);
    document.addEventListener('visibilitychange', syncFocus);

    return () => {
      window.removeEventListener('focus', syncFocus);
      window.removeEventListener('blur', syncFocus);
      document.removeEventListener('visibilitychange', syncFocus);
    };
  }, []);

  const triggerNotification = useCallback((project, terminal) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const terminalIndex = project.terminals?.findIndex(item => item.id === terminal.id) ?? -1;
      const terminalLabel = getShellLabel(terminal, Math.max(terminalIndex, 0));
      const notif = new Notification(`Git Shells Ready - ${project.name}`, {
        body: `Terminal "${terminalLabel}" in ${project.name} is waiting.`,
        tag: `${project.id}-${terminal.id}`,
        silent: false
      });
      notif.onclick = () => {
        window.focus();
        openWindow(MODES.PROJECTS);
        setActiveProjectId(project.id);
        setActiveTerminalId(terminal.id);
        // Clear unread on focus
        setUnreadTerminals(prev => ({ ...prev, [`${project.id}-${terminal.id}`]: false }));
      };
    }
  }, [openWindow]);

  const handleTerminalOutput = useCallback((projectId, terminalId, sessionId, data) => {
    // Record output history for prompt detection
    if (!lastOutputData.current[sessionId]) {
      lastOutputData.current[sessionId] = '';
    }
    lastOutputData.current[sessionId] = (lastOutputData.current[sessionId] + data).slice(-200);

    // If the terminal is active and the app is visibly focused, don't notify.
    const isActiveVisibleTerminal = activeProjectId === projectId && activeTerminalId === terminalId && appFocusedRef.current;
    if (isActiveVisibleTerminal) return;

    // Reset silence timer
    if (activityTimers.current[sessionId]) {
      clearTimeout(activityTimers.current[sessionId]);
    }

    // Set idle timeout: if terminal goes silent for 1.5s, check if it ended with a shell prompt
    activityTimers.current[sessionId] = setTimeout(() => {
      const cleanText = cleanAnsi(lastOutputData.current[sessionId]).trim();
      const endsWithPrompt = /(?:[$%#>❯➜])$/.test(cleanText);

      if (endsWithPrompt) {
        // Trigger notification
        const project = projectsRef.current.find(p => p.id === projectId);
        const terminal = project?.terminals?.find(t => t.id === terminalId);
        if (project && terminal) {
          triggerNotification(project, terminal);
          setUnreadTerminals(prev => ({ ...prev, [`${projectId}-${terminalId}`]: true }));
        }
      }
    }, 1500);
  }, [activeProjectId, activeTerminalId, triggerNotification]);

  const handleStatusChange = useCallback((projectId, terminalId, sessionId, status) => {
    setStatuses(prev => ({ ...prev, [sessionId]: status }));

    // Auto-cd to directory on first success connection
    if (status === 'connected' && !initializedDirs.current.has(sessionId)) {
      initializedDirs.current.add(sessionId);
      const project = projectsRef.current.find(p => p.id === projectId);
      if (project?.path) {
        setTimeout(() => {
          // Send cd command to workspace root silently
          const cmd = ` cd ${JSON.stringify(project.path)}\r`;
          panelRefs.current[terminalId]?.sendInput?.(cmd);
          // Also clear the screen so it looks extremely clean
          panelRefs.current[terminalId]?.sendInput?.('clear\r');
        }, 300);
      }
    }
  }, []);

  const openProjectDraft = (folderPath = '') => {
    const pathValue = String(folderPath || '').trim();
    setProjectDraft({
      path: pathValue,
      name: pathValue ? getDefaultProjectName(pathValue) : ''
    });
  };

  const handleAddProject = async () => {
    if (isAddingProject) return;

    setIsAddingProject(true);
    setAddProjectHint('');

    let folderPath = '';
    const selectDirectory = typeof window !== 'undefined' ? window.electron?.selectDirectory : null;

    if (selectDirectory) {
      const pickerPromise = selectDirectory();
      try {
        const result = await Promise.race([
          pickerPromise.then(path => ({ status: 'resolved', path })),
          delay(DIRECTORY_PICKER_TIMEOUT_MS).then(() => ({ status: 'timeout' }))
        ]);

        if (result.status === 'timeout') {
          if (hasVisibleFocus()) {
            setAddProjectHint('Directory picker did not appear. Enter the path manually.');
            openProjectDraft('');
          } else {
            folderPath = await pickerPromise;
          }
        } else {
          folderPath = result.path;
        }
      } catch (err) {
        console.error('Native directory picker failed; falling back to manual path prompt:', err);
        setAddProjectHint('Native picker failed. Enter the path manually.');
        openProjectDraft('');
      }
    } else {
      openProjectDraft('');
    }
    
    if (!folderPath || !String(folderPath).trim()) {
      setIsAddingProject(false);
      return;
    }
    folderPath = String(folderPath).trim();

    openProjectDraft(folderPath);
    setIsAddingProject(false);
    setAddProjectHint('');
  };

  const handleRegisterDraft = (event) => {
    event.preventDefault();
    const folderPath = String(projectDraft?.path || '').trim();
    const name = String(projectDraft?.name || '').trim() || getDefaultProjectName(folderPath);
    if (!folderPath || !name) {
      setAddProjectHint('Enter a folder path and project name.');
      return;
    }

    const projId = `proj-${Date.now()}`;
    const termId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    const newProj = {
      id: projId,
      name,
      path: folderPath,
      terminals: [
        { id: termId, label: 'Shell 1' }
      ]
    };

    setProjects(prev => [...prev, newProj]);
    setActiveProjectId(projId);
    setActiveTerminalId(termId);
    setProjectDraft(null);
    setAddProjectHint('');
  };

  const handleDeleteProject = (projectId, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to remove this project? This won't touch files on disk, only remove it from Perci.")) return;

    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
      setActiveTerminalId(null);
    }
  };

  const handleAddTerminal = (projectId) => {
    const termId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const count = (p.terminals || []).length + 1;
      const newTerm = { id: termId, label: `Shell ${count}` };
      
      // Select it on next render tick
      setTimeout(() => {
        setActiveTerminalId(termId);
      }, 0);

      return {
        ...p,
        terminals: [...(p.terminals || []), newTerm]
      };
    }));
  };

  const handleCloseTerminal = (projectId, terminalId, e) => {
    e?.stopPropagation();
    
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      
      let nextTerms = (p.terminals || []).filter(t => t.id !== terminalId);
      if (nextTerms.length === 0) {
        const fallbackId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        nextTerms = [{ id: fallbackId, label: 'Shell 1' }];
      }

      if (activeTerminalId === terminalId) {
        const closedIdx = (p.terminals || []).findIndex(t => t.id === terminalId);
        const nextActiveId = nextTerms[Math.max(0, closedIdx - 1)]?.id || nextTerms[0].id;
        setTimeout(() => setActiveTerminalId(nextActiveId), 0);
      }

      return {
        ...p,
        terminals: nextTerms
      };
    }));

    // Cleanup refs
    delete lastOutputData.current[terminalId];
    if (activityTimers.current[terminalId]) {
      clearTimeout(activityTimers.current[terminalId]);
      delete activityTimers.current[terminalId];
    }
    initializedDirs.current.delete(terminalId);
  };

  const handleStartTerminalRename = (projectId, terminalId) => {
    const project = projects.find(p => p.id === projectId);
    const terminal = project?.terminals?.find(t => t.id === terminalId);
    if (!terminal) return;

    setShellRename({
      projectId,
      terminalId,
      value: getCustomShellTitle(terminal)
    });
  };

  const handleSaveTerminalRename = (event) => {
    event.preventDefault();
    if (!shellRename) return;

    const { projectId, terminalId, value } = shellRename;

    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        terminals: (p.terminals || []).map(t => t.id === terminalId ? { ...t, label: value.trim() } : t)
      };
    }));
    setShellRename(null);
  };

  const handleSelectTerminal = (projectId, terminalId) => {
    setActiveProjectId(projectId);
    setActiveTerminalId(terminalId);
    // Clear unread
    setUnreadTerminals(prev => ({ ...prev, [`${projectId}-${terminalId}`]: false }));
    // Refocus term
    setTimeout(() => {
      panelRefs.current[terminalId]?.focus();
    }, 50);
  };

  const copyPathToClipboard = (path) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const forceCDToRoot = (terminalId, path) => {
    const cmd = ` cd ${JSON.stringify(path)}\r`;
    panelRefs.current[terminalId]?.sendInput?.(cmd);
    panelRefs.current[terminalId]?.focus();
  };

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeTerminal = activeProject?.terminals?.find(t => t.id === activeTerminalId);

  const STATUS_BG = {
    connected: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
    connecting: 'bg-amber-500 animate-pulse',
    disconnected: 'bg-red-500',
    error: 'bg-red-500'
  };

  return (
    <div className="projects-root">
      {/* SIDEBAR */}
      <aside ref={sidebarRef} className="projects-sidebar" style={{ width: sidebarWidth }}>
        <div className="projects-sidebar-header">
          <div className="flex items-center gap-2">
            <TerminalIcon size={16} className="text-[var(--accent)]" />
            <span className="font-semibold text-sm text-[var(--text-primary)]">Git Shells</span>
          </div>
          <button 
            onClick={handleAddProject} 
            disabled={isAddingProject}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all font-medium"
          >
            <FolderPlus size={13} className={isAddingProject ? 'animate-pulse' : ''} />
            <span>{isAddingProject ? 'Adding...' : 'Add'}</span>
          </button>
        </div>

        <ProjectDraftForm
          draft={projectDraft}
          onChange={setProjectDraft}
          onCancel={() => {
            setProjectDraft(null);
            setAddProjectHint('');
            setIsAddingProject(false);
          }}
          onSubmit={handleRegisterDraft}
        />

        {addProjectHint && !projectDraft && (
          <p className="mx-3 mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-500">
            {addProjectHint}
          </p>
        )}

        <div className="projects-sidebar-scroll flex-1 overflow-y-auto px-2 py-3">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-4 text-center mt-8">
              <Folder size={28} className="text-[var(--text-tertiary)] opacity-60 mb-2" />
              <p className="text-xs text-[var(--text-tertiary)]">No projects added yet.</p>
              <button 
                onClick={handleAddProject} 
                disabled={isAddingProject}
                className="mt-3 px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors"
              >
                {isAddingProject ? 'Opening...' : 'Add Project'}
              </button>
              {addProjectHint && (
                <p className="mt-2 text-[10px] text-amber-500">{addProjectHint}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {projects.map(proj => {
                const isProjActive = activeProjectId === proj.id;
                
                return (
                  <div key={proj.id} className="projects-sidebar-group">
                    {/* Project Folder Row */}
                    <div 
                      onClick={() => handleSelectTerminal(proj.id, (proj.terminals || [])[0]?.id)}
                      className={`group/proj flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                        isProjActive 
                          ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500' 
                          : 'border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder size={14} className={isProjActive ? "text-amber-500" : "text-[var(--text-tertiary)]"} />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate leading-normal">{proj.name}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] truncate leading-none mt-0.5" title={proj.path || ''}>
                            {(proj.path || '').split(/[/\\]/).pop() || ''}
                          </div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={(e) => handleDeleteProject(proj.id, e)}
                        className="opacity-0 group-hover/proj:opacity-100 p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-red-400 transition-all shrink-0"
                        title="Remove project"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* Terminals list under Project */}
                    <div className="flex flex-col gap-0.5 ml-4 mt-1 border-l border-[var(--border)] pl-2">
                      {(proj.terminals || []).map((term, terminalIndex) => {
                        const isTermActive = activeTerminalId === term.id;
                        const hasUnread = unreadTerminals[`${proj.id}-${term.id}`];
                        const termStatus = statuses[term.id] || 'disconnected';
                        const isRenaming = shellRename?.projectId === proj.id && shellRename?.terminalId === term.id;
                        
                        return (
                          <div 
                            key={term.id}
                            onClick={() => handleSelectTerminal(proj.id, term.id)}
                            className={`group/term flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-[11px] font-mono transition-all ${
                              isTermActive 
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300 font-semibold' 
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_BG[termStatus] || STATUS_BG.disconnected}`} />
                              {isRenaming ? (
                                <form
                                  onSubmit={handleSaveTerminalRename}
                                  onClick={event => event.stopPropagation()}
                                  className="flex items-center gap-1 min-w-0 flex-1"
                                >
                                  <span className="shrink-0">{terminalIndex + 1} &gt;</span>
                                  <input
                                    autoFocus
                                    value={shellRename.value}
                                    onChange={event => setShellRename(current => ({ ...current, value: event.target.value }))}
                                    onKeyDown={event => {
                                      if (event.key === 'Escape') {
                                        event.preventDefault();
                                        setShellRename(null);
                                      }
                                    }}
                                    className="min-w-0 flex-1 rounded border border-amber-500/30 bg-[var(--bg-primary)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-amber-500"
                                    aria-label={`Rename shell ${terminalIndex + 1}`}
                                  />
                                  <button
                                    type="submit"
                                    className="p-0.5 rounded text-amber-500 hover:bg-amber-500/10 shrink-0"
                                    title="Save shell name"
                                  >
                                    <Check size={10} />
                                  </button>
                                </form>
                              ) : (
                                <span className="truncate">{getShellLabel(term, terminalIndex)}</span>
                              )}
                            </div>
                            
                            {!isRenaming && <div className="flex items-center gap-1.5">
                              {hasUnread && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Ready (waiting)" />
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleStartTerminalRename(proj.id, term.id); }}
                                className="opacity-0 group-hover/term:opacity-100 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all shrink-0"
                                title="Rename shell"
                              >
                                <Edit2 size={10} />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleCloseTerminal(proj.id, term.id, e); }}
                                className="opacity-0 group-hover/term:opacity-100 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all shrink-0"
                              >
                                <X size={10} />
                              </button>
                            </div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div
          className="projects-sidebar-resizer"
          role="separator"
          aria-label="Resize project sidebar"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={handleSidebarResizeStart}
          onPointerMove={handleSidebarResizeMove}
          onPointerUp={handleSidebarResizeEnd}
          onPointerCancel={handleSidebarResizeEnd}
          onKeyDown={handleSidebarResizeKeyDown}
        />
      </aside>

      {/* MAIN CONTAINER */}
      <main className="projects-main">
        {activeProject && activeTerminal ? (
          <div className="flex flex-col h-full min-h-0">
            {/* Main view header */}
            <div className="projects-main-header">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    {activeProject.name}
                    <span className="text-[10px] font-normal font-mono text-[var(--text-tertiary)] px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)]">
                      SHELL {(activeProject.terminals || []).findIndex(term => term.id === activeTerminal.id) + 1}
                    </span>
                  </h2>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-[var(--text-secondary)] select-all font-mono">
                    <span className="truncate max-w-[280px] lg:max-w-md text-[var(--text-tertiary)]">{activeProject.path || ''}</span>
                    <button 
                      onClick={() => copyPathToClipboard(activeProject.path || '')}
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all shrink-0 select-none"
                      title="Copy path"
                    >
                      {copiedPath ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>

                {/* Shell session actions */}
                <div className="flex items-center gap-2">
                  {/* Tab list */}
                  <div className="flex items-center gap-0.5 border-r border-[var(--border)] pr-2 mr-2">
                    {(activeProject.terminals || []).map((term, terminalIndex) => {
                      const isActive = activeTerminalId === term.id;
                      const hasUnread = unreadTerminals[`${activeProject.id}-${term.id}`];
                      return (
                        <button
                          key={term.id}
                          onClick={() => handleSelectTerminal(activeProject.id, term.id)}
                          className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                            isActive
                              ? 'bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-300 font-semibold'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            {hasUnread && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                            SHELL {terminalIndex + 1}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      onClick={() => handleAddTerminal(activeProject.id)}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
                      title="New Shell Session"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <button 
                    onClick={() => forceCDToRoot(activeTerminalId, activeProject.path || '')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:border-amber-500/30 hover:bg-amber-500/5 text-xs text-[var(--text-secondary)] hover:text-amber-500 transition-all font-medium"
                    title="CD to workspace root folder"
                  >
                    <Folder size={12} />
                    <span>Go to Root</span>
                  </button>

                  <button 
                    onClick={() => handleStartTerminalRename(activeProject.id, activeTerminalId)}
                    className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                    title="Rename terminal"
                  >
                    <Edit2 size={13} />
                  </button>

                  <button 
                    onClick={() => panelRefs.current[activeTerminalId]?.reconnect()}
                    className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                    title="Reconnect"
                  >
                    <RefreshCw size={13} />
                  </button>

                  <button 
                    onClick={() => panelRefs.current[activeTerminalId]?.reset()}
                    className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                    title="Reset panel"
                  >
                    <RotateCcw size={13} />
                  </button>

                  <button 
                    onClick={(e) => handleCloseTerminal(activeProject.id, activeTerminalId, e)}
                    className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all"
                    title="Close session"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* Terminals container (All stay mounted, only active visible) */}
            <div className="flex-grow flex flex-col min-h-0 bg-[#0C0C0D] relative">
              {projects.map(proj => 
                (proj.terminals || []).map(term => {
                  const isCurrent = activeProjectId === proj.id && activeTerminalId === term.id;
                  
                  return (
                    <div 
                      key={term.id} 
                      className={isCurrent ? "flex flex-col h-full w-full min-h-0 relative" : "hidden"}
                    >
                      <TerminalPanel
                        ref={el => { panelRefs.current[term.id] = el; }}
                        sessionId={term.id}
                        embedded
                        onStatusChange={s => handleStatusChange(proj.id, term.id, term.id, s)}
                        onOutput={d => handleTerminalOutput(proj.id, term.id, term.id, d)}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[var(--bg-primary)] relative overflow-hidden">
            <div 
              className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-[0.04] dark:opacity-[0.07] mix-blend-luminosity filter blur-[0.5px]"
              style={{ backgroundImage: `url(${gitshellsBg})` }}
            />
            <div className="max-w-md flex flex-col items-center relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-5 shadow-inner">
                <TerminalIcon size={26} />
              </div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Git Shells</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed max-w-sm">
                Organize your terminal shells by project. Run long-running dev servers, builds, and scripts in the background, and get native notifications when they finish.
              </p>
              
              <div className="mt-8 flex gap-3 flex-wrap justify-center">
                <button
                  onClick={handleAddProject}
                  disabled={isAddingProject}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-semibold hover:bg-amber-600 active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(245,158,11,0.25)] flex items-center gap-1.5"
                >
                  <FolderPlus size={14} className={isAddingProject ? 'animate-pulse' : ''} />
                  <span>{isAddingProject ? 'Opening...' : 'Register a Project'}</span>
                </button>
              </div>
              {addProjectHint && (
                <p className="mt-3 text-[11px] text-amber-500">{addProjectHint}</p>
              )}

              {projects.length > 0 && (
                <div className="mt-10 w-full border-t border-[var(--border)] pt-6 text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-3">Quick Open</span>
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                    {projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleSelectTerminal(p.id, (p.terminals || [])[0]?.id)}
                        className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-left transition-all"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Folder size={14} className="text-amber-500 shrink-0" />
                          <span className="text-xs font-medium text-[var(--text-primary)] truncate">{p.name}</span>
                        </span>
                        <ChevronRight size={13} className="text-[var(--text-tertiary)]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
