import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    BookOpen, FileText, Search, Plus, Trash2, Edit3, Eye, Columns,
    FolderOpen, Link2, ExternalLink, X, Check, RefreshCw, Compass, ArrowRightLeft, Sparkles, Pencil, Lock, Unlock, KeyRound, Share2, Tags, Download
} from 'lucide-react';
import { useMode } from '../context/ModeContext';
import { EditableTitle } from './EditableTitle';
import { encryptNote, decryptNote, isEncrypted } from '../utils/note-crypto';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';
import { normalizeNoteTags, parseNoteTags, setNoteTags, stripNoteFrontmatter, tagKey } from '../lib/notesTags';
import { parseNoteOKF, ensureOKFDefaults, buildNoteOKF, updateOKFTags } from '../lib/notesOKF';
import { NotesOKFPanel } from './NotesOKFPanel';
import {
    POWER_WORKSPACE_SURFACE_HANDOFF_EVENT,
    consumeWorkspaceSurfaceHandoff,
    isNoteRefLinkedToWorkspace,
    noteRefId,
    readPowerWorkspaceSnapshot,
    setWorkspaceLink,
} from '../lib/powerWorkspace';
import NotesGraph3D from './NotesGraph3D';

const NOTES_FOLDER_KEY = 'perci_notes_folder';

function noteIdFromFileName(fileName) {
    return String(fileName || '').replace(/\.enc\.md$/, '').replace(/\.md$/, '');
}

function SidebarNoteItem({ fileName, noteId, isActive, isLocked, onSelect, onRename, onDelete, onToggleEncrypt }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(noteId);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Sync editValue when noteId changes externally (e.g. after rename)
    useEffect(() => {
        if (!isEditing) {
            setEditValue(noteId);
        }
    }, [noteId, isEditing]);

    const handleSave = () => {
        if (editValue.trim() && editValue.trim() !== noteId) {
            onRename(editValue.trim());
        } else {
            setEditValue(noteId);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setEditValue(noteId);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div className="px-2 py-1" onClick={e => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSave}
                    className="w-full px-2 py-1 text-xs rounded border border-[var(--accent)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none font-mono"
                />
            </div>
        );
    }

    return (
        <button
            onClick={onSelect}
            className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-xs transition-all group ${
                isActive
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-l-2 border-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
        >
            <span className="truncate flex items-center gap-1.5 min-w-0">
                {isLocked
                    ? <Lock size={13} className={isActive ? 'text-amber-400' : 'text-amber-500/60'} />
                    : <FileText size={13} className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'} />
                }
                <span className="truncate">{noteId}</span>
            </span>
            {isActive && (
                <span className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleEncrypt();
                        }}
                        className="hover:text-amber-400 p-0.5 rounded transition-all"
                        title={isLocked ? 'Decrypt Note' : 'Encrypt Note'}
                    >
                        {isLocked ? <Unlock size={11} /> : <Lock size={11} />}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditValue(noteId);
                            setIsEditing(true);
                        }}
                        className="hover:text-[var(--accent)] p-0.5 rounded transition-all"
                        title="Rename Note"
                    >
                        <Pencil size={11} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="hover:text-rose-400 p-0.5 rounded transition-all"
                        title="Delete Note"
                    >
                        <Trash2 size={12} />
                    </button>
                </span>
            )}
        </button>
    );
}

export default function NotesMode() {
    const { codeState, setCodeState } = useMode();
    const workingDirectory = codeState?.workingDirectory;
    const initialWorkspaceHandoff = useMemo(() => consumeWorkspaceSurfaceHandoff('notes'), []);

    const [notesFolder, setNotesFolder] = useState('');
    const [notesList, setNotesList] = useState([]); // Array of strings (filenames like "Index.md")
    const [filesMap, setFilesMap] = useState({}); // filename -> file content
    const [activeNote, setActiveNote] = useState(null); // filename like "Index.md"
    const [unsavedContent, setUnsavedContent] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('split'); // 'edit' | 'preview' | 'split'
    const [showGraph, setShowGraph] = useState(false); // full-pane 3D knowledge graph
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [newNoteName, setNewNoteName] = useState('');
    const [showNewNoteInput, setShowNewNoteInput] = useState(false);
    const [encryptedPasswords, setEncryptedPasswords] = useState({}); // filename -> password (only in memory)
    const [masterPassword, setMasterPassword] = useState(null); // single sudo password (in memory only)
    const [masterPasswordModal, setMasterPasswordModal] = useState(null); // { mode: 'set'|'change' } | null
    const [masterPasswordInput, setMasterPasswordInput] = useState('');
    const [masterPasswordConfirm, setMasterPasswordConfirm] = useState('');
    const [masterPasswordError, setMasterPasswordError] = useState('');
    const [masterPasswordUsedFor, setMasterPasswordUsedFor] = useState({}); // set of filenames unlocked via master
    const [passwordModal, setPasswordModal] = useState(null); // { mode: 'encrypt'|'decrypt', fileName, noteId, useMaster?: boolean } | null
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [okfFields, setOkfFields] = useState({ type: 'Note', title: '', description: '', resource: '', tags: [], timestamp: '' });
    const [workspaceOnly, setWorkspaceOnly] = useState(false);
    const [workspaceSnapshot, setWorkspaceSnapshot] = useState(() => readPowerWorkspaceSnapshot());
    const [pendingWorkspaceNoteRef, setPendingWorkspaceNoteRef] = useState(initialWorkspaceHandoff?.itemRef || '');

    useEffect(() => {
        const handleWorkspaceHandoff = (event) => {
            if (event.detail?.target !== 'notes') return;
            const handoff = consumeWorkspaceSurfaceHandoff('notes') || event.detail;
            setPendingWorkspaceNoteRef(handoff.itemRef || '');
        };
        window.addEventListener(POWER_WORKSPACE_SURFACE_HANDOFF_EVENT, handleWorkspaceHandoff);
        return () => window.removeEventListener(POWER_WORKSPACE_SURFACE_HANDOFF_EVENT, handleWorkspaceHandoff);
    }, []);

    // Resolve notes folder path on mount and update register path
    useEffect(() => {
        let isMounted = true;
        async function initNotesFolder() {
            // 1. Try persisted storage
            let savedFolder = readStringStorage(NOTES_FOLDER_KEY);
            let shouldPersistResolvedFolder = Boolean(savedFolder);
            
            // 2. Backward compatibility: if workingDirectory is set but no custom folder,
            // default to ${workingDirectory}/notes to preserve existing notes.
            if (!savedFolder && workingDirectory) {
                savedFolder = `${workingDirectory}/notes`;
                shouldPersistResolvedFolder = true;
            }

            // 3. Fallback to app documents folder
            if (!savedFolder && window.electron?.getDefaultNotesPath) {
                try {
                    savedFolder = await window.electron.getDefaultNotesPath();
                } catch (err) {
                    console.error('Failed to get default notes path:', err);
                }
            }

            if (isMounted && savedFolder) {
                setNotesFolder(savedFolder);
                if (shouldPersistResolvedFolder) {
                    writeStringStorage(NOTES_FOLDER_KEY, savedFolder);
                }
                if (window.electron?.registerWorkspace) {
                    await window.electron.registerWorkspace(savedFolder);
                }
            }
        }
        initNotesFolder();
        return () => { isMounted = false; };
    }, [workingDirectory]);

    // Choose directory if not set
    const handleChooseFolder = async () => {
        if (!window.electron?.selectDirectory) return;
        try {
            const folderPath = await window.electron.selectDirectory();
            if (folderPath) {
                writeStringStorage(NOTES_FOLDER_KEY, folderPath);
                setNotesFolder(folderPath);
                if (window.electron?.registerWorkspace) {
                    await window.electron.registerWorkspace(folderPath);
                }
            }
        } catch (err) {
            console.error('Failed to select directory:', err);
        }
    };

    // Export notes to OKF Standard Bundle
    const handleExportOKF = async () => {
        if (!window.electron?.selectDirectory || !window.electron?.writeFile) {
            alert('Filesystem operations are not supported in this environment.');
            return;
        }

        try {
            const outputFolder = await window.electron.selectDirectory();
            if (!outputFolder) return;

            let count = 0;
            const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
            const fmRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;

            for (const fileName of notesList) {
                // Skip locked encrypted notes
                const locked = isEncrypted(filesMap[fileName]) && !encryptedPasswords[fileName] && !masterPasswordUsedFor[fileName];
                if (locked) continue;

                const rawContent = (fileName === activeNote) ? unsavedContent : (filesMap[fileName] || '');
                
                // Parse frontmatter & body
                let metadata = {};
                let body = rawContent;

                const match = fmRegex.exec(rawContent);
                if (match) {
                    const fmText = match[1];
                    body = rawContent.substring(match[0].length).trim();
                    fmText.split('\n').forEach(line => {
                        if (line.includes(':')) {
                            const [k, ...vParts] = line.split(':');
                            const v = vParts.join(':');
                            metadata[k.trim()] = v.trim();
                        }
                    });
                }

                // Add/Ensure OKF fields
                if (!metadata.type) {
                    metadata.type = 'Note';
                }

                let title = fileName.replace(/\.enc\.md$/, '').replace(/\.md$/, '');
                const h1Match = /^#\s+(.+)$/m.exec(body);
                if (h1Match) {
                    title = h1Match[1].trim();
                }
                if (!metadata.title) {
                    metadata.title = `"${title}"`;
                }

                if (!metadata.description) {
                    const cleanLines = body.split('\n')
                        .map(l => l.trim())
                        .filter(l => l.length > 0 && !l.startsWith('#'));
                    const desc = cleanLines.length > 0 ? cleanLines[0].substring(0, 100) : `Note about ${title}`;
                    metadata.description = `"${desc.replace(/"/g, '\\"')}"`;
                }

                // Convert [[WikiLinks]] to standard markdown links
                const convertedBody = body.replace(wikiLinkRegex, (match, target, label) => {
                    const cleanTarget = target.trim();
                    const cleanLabel = label ? label.trim() : cleanTarget;
                    const encodedTarget = cleanTarget.replace(/ /g, '%20') + '.md';
                    return `[${cleanLabel}](${encodedTarget})`;
                });

                // Format OKF markdown
                const fmLines = ['---'];
                Object.entries(metadata).forEach(([k, v]) => {
                    fmLines.push(`${k}: ${v}`);
                });
                fmLines.push('---');
                const okfContent = fmLines.join('\n') + '\n\n' + convertedBody;

                const outName = fileName.toLowerCase() === 'index.md' ? 'index.md' : fileName;
                await window.electron.writeFile(`${outputFolder}/${outName}`, okfContent);
                count++;
            }

            alert(`Successfully exported ${count} notes to OKF standard at:\n${outputFolder}`);
        } catch (err) {
            console.error('Failed to export OKF bundle:', err);
            alert(`Failed to export OKF bundle: ${err.message}`);
        }
    };

    // Load notes and sync filesystem
    const loadNotes = useCallback(async () => {
        if (!notesFolder) return;
        setLoading(true);
        setError(null);
        try {
            let files = [];
            try {
                files = await window.electron.listFiles(notesFolder);
            } catch (e) {
                setNotesList([]);
                setFilesMap({});
                setLoading(false);
                return;
            }

            const mdFiles = files.filter(f => f.toLowerCase().endsWith('.md'));

            const newFilesMap = {};
            await Promise.all(mdFiles.map(async (fileName) => {
                try {
                    const content = await window.electron.readFile(`${notesFolder}/${fileName}`);
                    newFilesMap[fileName] = content;
                } catch (err) {
                    console.error(`Error reading note file ${fileName}:`, err);
                    newFilesMap[fileName] = '';
                }
            }));

            setFilesMap(newFilesMap);
            setNotesList(mdFiles);

            if (mdFiles.length > 0) {
                if (activeNote && mdFiles.includes(activeNote)) {
                    if (!isDirty) {
                        // If encrypted and we have the password, decrypt on load
                        const content = newFilesMap[activeNote] || '';
                        if (isEncrypted(content) && encryptedPasswords[activeNote]) {
                            try {
                                const decrypted = await decryptNote(content, encryptedPasswords[activeNote]);
                                setUnsavedContent(decrypted);
                            } catch {
                                setUnsavedContent(content);
                            }
                        } else {
                            setUnsavedContent(content);
                        }
                    }
                } else if (mdFiles.includes('Index.md')) {
                    setActiveNote('Index.md');
                    setUnsavedContent(newFilesMap['Index.md'] || '');
                } else {
                    setActiveNote(mdFiles[0]);
                    setUnsavedContent(newFilesMap[mdFiles[0]] || '');
                }
            } else {
                setActiveNote(null);
                setUnsavedContent('');
            }
        } catch (err) {
            console.error('Failed to load notes:', err);
            setError('Could not access notes directory. Click "Initialize" to create it.');
        } finally {
            setLoading(false);
        }
    }, [notesFolder, activeNote, isDirty]);

    // Load notes on folder change
    useEffect(() => {
        if (notesFolder) {
            loadNotes();
        }
    }, [notesFolder]);

    // Initialize notes directory
    const handleInitializeNotes = async () => {
        if (!notesFolder) return;
        try {
            setLoading(true);
            writeStringStorage(NOTES_FOLDER_KEY, notesFolder);
            const initialContent = `# Welcome to Perci Notes\n\nThis is your local Markdown knowledge base. It is saved directly in your workspace folder at \`notes/\`, making it fully compatible with **Obsidian** or **Logseq**.\n\n### Quick Guide\n- **Double Brackets**: Create links between pages using \`[[WikiLinks]]\`. For example, link to [[Index]] or [[Meeting Notes]].\n- **Backlinks**: The side-panel displays which notes link back to the current note.\n- **Unlinked Mentions**: Discover other notes that mention the title of this note but are not explicitly linked, and click "Link" to link them instantly.\n\nHappy thinking! 🚀`;
            await window.electron.writeFile(`${notesFolder}/Index.md`, initialContent);
            await loadNotes();
            setActiveNote('Index.md');
            setUnsavedContent(initialContent);
        } catch (err) {
            console.error('Failed to initialize notes:', err);
            setError('Failed to create notes folder. Ensure Perci has write permissions.');
        } finally {
            setLoading(false);
        }
    };

    // Auto-save logic
    useEffect(() => {
        if (!activeNote || !isDirty || !notesFolder) return;

        const timer = setTimeout(async () => {
            try {
                const pwd = encryptedPasswords[activeNote];
                if (pwd) {
                    await saveNoteToDisk(activeNote, unsavedContent);
                } else {
                    await window.electron.writeFile(`${notesFolder}/${activeNote}`, unsavedContent);
                    setFilesMap(prev => ({ ...prev, [activeNote]: unsavedContent }));
                    setIsDirty(false);
                }
            } catch (err) {
                console.error('Failed to auto-save note:', err);
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [unsavedContent, activeNote, isDirty, notesFolder, encryptedPasswords]);

    // Force save active note
    const saveActiveNoteImmediate = async (fileName, content) => {
        if (!fileName || !notesFolder) return;
        try {
            const pwd = encryptedPasswords[fileName];
            if (pwd) {
                await saveNoteToDisk(fileName, content);
            } else {
                await window.electron.writeFile(`${notesFolder}/${fileName}`, content);
                setFilesMap(prev => ({ ...prev, [fileName]: content }));
                setIsDirty(false);
            }
        } catch (err) {
            console.error('Failed to save note:', err);
        }
    };

    // Selection handler
    const handleSelectNote = async (fileName) => {
        if (fileName === activeNote) return;

        if (activeNote && isDirty) {
            await saveActiveNoteImmediate(activeNote, unsavedContent);
        }

        const content = filesMap[fileName] || '';

        // If the file is encrypted
        if (isEncrypted(content)) {
            // If we already have the per-note password, decrypt immediately
            if (encryptedPasswords[fileName]) {
                try {
                    const decrypted = await decryptNote(content, encryptedPasswords[fileName]);
                    setActiveNote(fileName);
                    setUnsavedContent(decrypted);
                    setIsDirty(false);
                    setMasterPasswordUsedFor(prev => ({ ...prev, [fileName]: false }));
                } catch {
                    setPasswordModal({ mode: 'decrypt', fileName, noteId: fileName.replace(/\.md$/, '').replace(/\.enc\.md$/, '') });
                    setPasswordInput('');
                    setPasswordError('');
                }
            } else if (masterPassword) {
                // Try master password silently
                try {
                    const decrypted = await decryptNote(content, masterPassword);
                    setActiveNote(fileName);
                    setUnsavedContent(decrypted);
                    setIsDirty(false);
                    setMasterPasswordUsedFor(prev => ({ ...prev, [fileName]: true }));
                } catch {
                    // Master didn't work — prompt for per-note password
                    setPasswordModal({ mode: 'decrypt', fileName, noteId: fileName.replace(/\.md$/, '').replace(/\.enc\.md$/, '') });
                    setPasswordInput('');
                    setPasswordError('');
                }
            } else {
                // No password available — prompt
                setPasswordModal({ mode: 'decrypt', fileName, noteId: fileName.replace(/\.md$/, '').replace(/\.enc\.md$/, '') });
                setPasswordInput('');
                setPasswordError('');
            }
            return;
        }

        setActiveNote(fileName);
        setUnsavedContent(content);
        setIsDirty(false);

        // Parse OKF fields from content
        const parsed = parseNoteOKF(content);
        if (parsed.hasOKF) {
            setOkfFields({
                type: parsed.type || 'Note',
                title: parsed.title || '',
                description: parsed.description || '',
                resource: parsed.resource || '',
                tags: parsed.tags || [],
                timestamp: parsed.timestamp || '',
            });
        } else {
            const defaults = ensureOKFDefaults(parsed, fileName);
            setOkfFields({
                type: defaults.type,
                title: defaults.title,
                description: defaults.description,
                resource: defaults.resource,
                tags: defaults.tags,
                timestamp: defaults.timestamp,
            });
        }
    };

    // Create a new note
    const handleCreateNote = async (e) => {
        e.preventDefault();
        let name = newNoteName.trim();
        if (!name) return;
        
        if (!name.toLowerCase().endsWith('.md')) {
            name += '.md';
        }

        const filePath = `${notesFolder}/${name}`;

        try {
            if (activeNote && isDirty) {
                await saveActiveNoteImmediate(activeNote, unsavedContent);
            }

            const initialText = `# ${name.replace(/\.md$/, '')}\n\n`;
            await window.electron.writeFile(filePath, initialText);

            const newFilesMap = { ...filesMap, [name]: initialText };
            setFilesMap(newFilesMap);
            setNotesList(prev => [...prev.filter(f => f !== name), name].sort());

            setActiveNote(name);
            setUnsavedContent(initialText);
            setIsDirty(false);
            setOkfFields({
                type: 'Note',
                title: name.replace(/\.md$/, ''),
                description: `Note about ${name.replace(/\.md$/, '')}`,
                resource: '',
                tags: [],
                timestamp: new Date().toISOString(),
            });

            setNewNoteName('');
            setShowNewNoteInput(false);
        } catch (err) {
            console.error('Failed to create new note:', err);
            setError('Could not create new note file.');
        }
    };

    // Delete note
    const handleDeleteNote = async (fileName) => {
        if (!fileName || !notesFolder) return;
        if (!confirm(`Are you sure you want to delete "${fileName.replace(/\.md$/, '')}"?`)) return;

        try {
            await window.electron.deleteFile(`${notesFolder}/${fileName}`);
            
            const updatedMap = { ...filesMap };
            delete updatedMap[fileName];
            setFilesMap(updatedMap);

            const updatedList = notesList.filter(f => f !== fileName);
            setNotesList(updatedList);

            if (activeNote === fileName) {
                if (updatedList.length > 0) {
                    const nextNote = updatedList.includes('Index.md') ? 'Index.md' : updatedList[0];
                    setActiveNote(nextNote);
                    setUnsavedContent(updatedMap[nextNote] || '');
                } else {
                    setActiveNote(null);
                    setUnsavedContent('');
                }
                setIsDirty(false);
            }
        } catch (err) {
            console.error('Failed to delete note:', err);
            setError('Failed to delete note file.');
        }
    };

    // Rename note
    const handleRenameNote = async (oldFileName, newTitle) => {
        if (!newTitle || !notesFolder) return;
        const sanitized = newTitle.trim();
        if (!sanitized) return;

        const wasEncrypted = oldFileName.endsWith('.enc.md');
        let newFileName = sanitized;
        if (!newFileName.toLowerCase().endsWith('.md')) {
            newFileName += '.md';
        }
        // Preserve .enc.md extension for encrypted notes
        if (wasEncrypted && !newFileName.endsWith('.enc.md')) {
            newFileName = newFileName.replace(/\.md$/, '.enc.md');
        }

        // No-op if name unchanged
        if (newFileName === oldFileName) return;

        const oldPath = `${notesFolder}/${oldFileName}`;
        const newPath = `${notesFolder}/${newFileName}`;

        try {
            // Save current note content to the new file, then delete old
            let contentToSave = (activeNote === oldFileName) ? unsavedContent : (filesMap[oldFileName] || '');

            // If encrypted, decrypt then re-encrypt under new name
            const oldPwd = encryptedPasswords[oldFileName];
            if (oldPwd && wasEncrypted) {
                const plaintext = isEncrypted(contentToSave)
                    ? await decryptNote(contentToSave, oldPwd)
                    : contentToSave;
                contentToSave = await encryptNote(plaintext, oldPwd);
            }

            await window.electron.writeFile(newPath, contentToSave);
            await window.electron.deleteFile(oldPath);

            // Update state
            const newFilesMap = { ...filesMap };
            newFilesMap[newFileName] = contentToSave;
            delete newFilesMap[oldFileName];
            setFilesMap(newFilesMap);

            // Transfer password to new filename
            if (oldPwd) {
                setEncryptedPasswords(prev => {
                    const next = { ...prev };
                    next[newFileName] = oldPwd;
                    delete next[oldFileName];
                    return next;
                });
            }

            const newList = notesList.map(f => f === oldFileName ? newFileName : f).sort();
            setNotesList(newList);

            if (activeNote === oldFileName) {
                setActiveNote(newFileName);
                // Keep decrypted content in editor for encrypted notes
                setUnsavedContent((activeNote === oldFileName && oldPwd) ? unsavedContent : contentToSave);
                setIsDirty(false);
            }
        } catch (err) {
            console.error('Failed to rename note:', err);
            setError(`Could not rename note to "${newFileName}". A file with that name may already exist.`);
        }
    };

    // Helper: save content to disk, encrypting if the note has a stored password
    const saveNoteToDisk = async (fileName, content) => {
        if (!notesFolder || !fileName) return;
        const pwd = encryptedPasswords[fileName];
        const displayName = fileName.replace(/\.md$/, '');

        // Build OKF document: frontmatter from okfFields + body from content
        const bodyContent = stripNoteFrontmatter(content);
        const okfDoc = buildNoteOKF(okfFields, bodyContent);

        if (pwd) {
            // Encrypt before writing; use .enc.md extension
            const encFileName = `${displayName}.enc.md`;
            const encrypted = await encryptNote(okfDoc, pwd);
            await window.electron.writeFile(`${notesFolder}/${encFileName}`, encrypted);
            setFilesMap(prev => ({ ...prev, [fileName]: encrypted }));
            // If the file was previously .md but now we're encrypting, delete old .md
            if (fileName.endsWith('.md') && !fileName.endsWith('.enc.md')) {
                try { await window.electron.deleteFile(`${notesFolder}/${fileName}`); } catch {}
                // Update lists: rename in place but track it as encrypted
                const newList = notesList.map(f => f === fileName ? encFileName : f);
                if (!notesList.includes(encFileName)) {
                    setNotesList(newList.sort());
                }
                if (activeNote === fileName) {
                    setActiveNote(encFileName);
                    const newMap = { ...filesMap };
                    newMap[encFileName] = encrypted;
                    delete newMap[fileName];
                    setFilesMap(newMap);
                }
            }
        } else {
            await window.electron.writeFile(`${notesFolder}/${fileName}`, okfDoc);
            setFilesMap(prev => ({ ...prev, [fileName]: okfDoc }));
        }
        setIsDirty(false);
    };

    // Toggle encryption for a note
    const handleToggleEncrypt = async (fileName) => {
        const content = filesMap[fileName] || '';
        if (isEncrypted(content)) {
            // Decrypt mode — need password
            const noteId = fileName.replace(/\.md$/, '').replace(/\.enc\.md$/, '');
            setPasswordModal({ mode: 'decrypt', fileName, noteId });
            setPasswordInput('');
            setPasswordError('');
        } else {
            // Encrypt mode — need new password
            const noteId = fileName.replace(/\.md$/, '');
            if (masterPassword) {
                // Default to using master password — user can switch to per-note
                setPasswordModal({ mode: 'encrypt', fileName, noteId, useMaster: true });
            } else {
                setPasswordModal({ mode: 'encrypt', fileName, noteId, useMaster: false });
            }
            setPasswordInput('');
            setPasswordError('');
        }
    };

    // Confirm password modal action
    const handlePasswordConfirm = async () => {
        if (!passwordModal || !passwordInput.trim()) return;
        const { mode, fileName, noteId, useMaster } = passwordModal;
        const pwd = passwordInput.trim();

        // If using master password for encryption and no per-note input, use master
        if (mode === 'encrypt' && useMaster && masterPassword && !pwd) {
            // This shouldn't happen given UI guard, but safety fallback
            setPasswordError('Enter a password or use the master password toggle.');
            return;
        }

        try {
            if (mode === 'encrypt') {
                // Encrypt the current unsaved content
                const content = unsavedContent || filesMap[fileName] || '';
                const encryptionPwd = (useMaster && masterPassword) ? masterPassword : pwd;
                const encrypted = await encryptNote(content, encryptionPwd);
                const encFileName = `${noteId}.enc.md`;
                await window.electron.writeFile(`${notesFolder}/${encFileName}`, encrypted);
                // Delete old .md file
                try { await window.electron.deleteFile(`${notesFolder}/${fileName}`); } catch {}

                // Update state
                if (useMaster && masterPassword) {
                    setMasterPasswordUsedFor(prev => ({ ...prev, [encFileName]: true }));
                } else {
                    setEncryptedPasswords(prev => ({ ...prev, [encFileName]: encryptionPwd }));
                }
                const newMap = { ...filesMap };
                newMap[encFileName] = encrypted;
                delete newMap[fileName];
                setFilesMap(newMap);

                const newList = notesList.map(f => f === fileName ? encFileName : f);
                setNotesList(newList.sort());
                if (activeNote === fileName) {
                    setActiveNote(encFileName);
                    setUnsavedContent(content); // Keep decrypted content in editor
                }
                setIsDirty(false);

            } else if (mode === 'decrypt') {
                // Verify password by decrypting
                const content = filesMap[fileName] || '';
                const decrypted = await decryptNote(content, pwd);

                // Determine if this was the master password
                const isMaster = masterPassword && pwd === masterPassword;
                if (isMaster) {
                    setMasterPasswordUsedFor(prev => ({ ...prev, [fileName]: true }));
                } else {
                    setEncryptedPasswords(prev => ({ ...prev, [fileName]: pwd }));
                    setMasterPasswordUsedFor(prev => {
                        const next = { ...prev };
                        next[fileName] = false;
                        return next;
                    });
                }

                setFilesMap(prev => ({ ...prev, [fileName]: content })); // Keep ciphertext in filesMap
                if (activeNote === fileName) {
                    setUnsavedContent(decrypted);
                    setIsDirty(false);
                }
            }
        } catch (err) {
            console.error('Encryption/decryption failed:', err);
            setPasswordError(mode === 'encrypt' ? 'Encryption failed.' : 'Wrong password or corrupted file.');
            return;
        }

        setPasswordModal(null);
        setPasswordInput('');
    };

    // Permanently decrypt a note (remove encryption, keep as plain .md)
    const handleDecryptPermanently = async (fileName) => {
        const pwd = encryptedPasswords[fileName] || (masterPassword && masterPasswordUsedFor[fileName] ? masterPassword : null);
        if (!pwd) return;
        const content = filesMap[fileName] || '';
        try {
            const decrypted = await decryptNote(content, pwd);
            const newFileName = fileName.replace(/\.enc\.md$/, '.md');
            await window.electron.writeFile(`${notesFolder}/${newFileName}`, decrypted);
            try { await window.electron.deleteFile(`${notesFolder}/${fileName}`); } catch {}

            setEncryptedPasswords(prev => {
                const next = { ...prev };
                delete next[fileName];
                return next;
            });
            setMasterPasswordUsedFor(prev => {
                const next = { ...prev };
                delete next[fileName];
                return next;
            });
            const newMap = { ...filesMap };
            newMap[newFileName] = decrypted;
            delete newMap[fileName];
            setFilesMap(newMap);

            const newList = notesList.map(f => f === fileName ? newFileName : f).sort();
            setNotesList(newList);
            if (activeNote === fileName) {
                setActiveNote(newFileName);
                setUnsavedContent(decrypted);
            }
            setIsDirty(false);
        } catch (err) {
            console.error('Failed to permanently decrypt:', err);
            setError('Could not decrypt note. Wrong password?');
        }
    };

    // Master password modal confirm
    const handleMasterPasswordConfirm = async () => {
        if (!masterPasswordModal || !masterPasswordInput.trim()) return;
        const pwd = masterPasswordInput.trim();
        if (masterPasswordModal.mode === 'set') {
            if (pwd !== masterPasswordConfirm) {
                setMasterPasswordError('Passwords do not match.');
                return;
            }
            setMasterPassword(pwd);
        } else if (masterPasswordModal.mode === 'change') {
            // Verify current master first
            if (pwd !== masterPassword) {
                setMasterPasswordError('Current master password is incorrect.');
                return;
            }
            if (!masterPasswordConfirm) {
                setMasterPasswordError('Enter a new master password.');
                return;
            }
            setMasterPassword(masterPasswordConfirm);
        }
        setMasterPasswordModal(null);
        setMasterPasswordInput('');
        setMasterPasswordConfirm('');
        setMasterPasswordError('');
    };

    // Lock a note now: remove password from memory, clear decrypted content
    const handleLockNow = (fileName) => {
        setEncryptedPasswords(prev => {
            const next = { ...prev };
            delete next[fileName];
            return next;
        });
        setMasterPasswordUsedFor(prev => {
            const next = { ...prev };
            delete next[fileName];
            return next;
        });
        if (activeNote === fileName) {
            // Replace editor content with ciphertext so it's not readable
            setUnsavedContent(filesMap[fileName] || '');
            setIsDirty(false);
        }
    };

    // Master password: clear all unlocks (lock all master-unlocked notes)
    const handleClearMaster = () => {
        setMasterPassword(null);
        setMasterPasswordUsedFor({});
        setMasterPasswordModal(null);
        setMasterPasswordInput('');
        setMasterPasswordConfirm('');
    };

    // Editor content changes
    const handleEditorChange = (value) => {
        setUnsavedContent(value || '');
        setIsDirty(true);

        // Sync OKF fields if user edits frontmatter directly in editor
        const parsed = parseNoteOKF(value || '');
        if (parsed.hasOKF) {
            setOkfFields(prev => ({
                ...prev,
                type: parsed.type || prev.type,
                title: parsed.title || prev.title,
                description: parsed.description || prev.description,
                resource: parsed.resource || prev.resource,
                tags: parsed.tags.length > 0 ? parsed.tags : prev.tags,
                timestamp: parsed.timestamp || prev.timestamp,
            }));
        }
    };

    useEffect(() => {
        setTagInput('');
    }, [activeNote]);

    const findNoteFileById = useCallback((noteId) => {
        return notesList.find(fileName => noteIdFromFileName(fileName).toLowerCase() === String(noteId || '').toLowerCase());
    }, [notesList]);

    useEffect(() => {
        if (!pendingWorkspaceNoteRef || notesList.length === 0) return;
        const fileName = findNoteFileById(noteRefId(pendingWorkspaceNoteRef));
        if (!fileName) return;
        setShowGraph(false);
        if (fileName !== activeNote) void handleSelectNote(fileName);
        setPendingWorkspaceNoteRef('');
    }, [activeNote, findNoteFileById, notesList, pendingWorkspaceNoteRef]);

    const activeNoteLocked = !!activeNote && isEncrypted(filesMap[activeNote]) && !encryptedPasswords[activeNote] && !masterPasswordUsedFor[activeNote];
    const activeTags = useMemo(() => {
        if (!activeNote || activeNoteLocked) return [];
        return okfFields.tags || [];
    }, [activeNote, activeNoteLocked, okfFields.tags]);

    const updateActiveTags = useCallback((tags) => {
        if (!activeNote || activeNoteLocked) return;
        setOkfFields(prev => ({ ...prev, tags }));
        setIsDirty(true);
    }, [activeNote, activeNoteLocked]);

    const commitTagInput = useCallback(() => {
        const newTags = normalizeNoteTags(tagInput);
        if (newTags.length > 0) {
            updateActiveTags([...activeTags, ...newTags]);
        }
        setTagInput('');
    }, [activeTags, tagInput, updateActiveTags]);

    const handleTagInputKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
            event.preventDefault();
            commitTagInput();
            return;
        }

        if (event.key === 'Backspace' && !tagInput && activeTags.length > 0) {
            updateActiveTags(activeTags.slice(0, -1));
        }
    };

    const removeActiveTag = (tag) => {
        const key = tagKey(tag);
        updateActiveTags(activeTags.filter(item => tagKey(item) !== key));
    };

    const noteIds = useMemo(() => {
        return notesList.map(noteIdFromFileName);
    }, [notesList]);

    // Parse graph
    const graph = useMemo(() => {
        const outgoing = {};
        const backlinks = {};
        const unlinkedMentions = {};
        const tagsByNote = {};
        const notesByTag = {};

        noteIds.forEach(id => {
            outgoing[id] = new Set();
            backlinks[id] = [];
            unlinkedMentions[id] = [];
            tagsByNote[id] = [];
        });

        Object.entries(filesMap).forEach(([fileName, content]) => {
            const fromNoteId = noteIdFromFileName(fileName);
            const readableContent = fileName === activeNote && !activeNoteLocked ? unsavedContent : content;
            if (isEncrypted(readableContent)) return;

            const tags = parseNoteTags(readableContent);
            tagsByNote[fromNoteId] = tags;
            tags.forEach(tag => {
                const key = tagKey(tag);
                if (!notesByTag[key]) notesByTag[key] = { tag, notes: [] };
                if (!notesByTag[key].notes.includes(fromNoteId)) notesByTag[key].notes.push(fromNoteId);
            });

            const lines = (readableContent || '').split('\n');

            lines.forEach(line => {
                const wikiRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
                let match;
                while ((match = wikiRegex.exec(line)) !== null) {
                    const targetName = match[1].trim();
                    const targetNoteId = noteIds.find(id => id.toLowerCase() === targetName.toLowerCase());
                    if (targetNoteId) {
                        outgoing[fromNoteId].add(targetNoteId);
                        if (!backlinks[targetNoteId]) backlinks[targetNoteId] = [];
                        backlinks[targetNoteId].push({ fromNoteId, lineText: line.trim() });
                    }
                }

                const mdRegex = /\[[^\]]+\]\(([^)]+\.md)\)/g;
                while ((match = mdRegex.exec(line)) !== null) {
                    const targetPath = match[1].split('/').pop().replace(/\.md$/, '');
                    const targetNoteId = noteIds.find(id => id.toLowerCase() === targetPath.toLowerCase());
                    if (targetNoteId) {
                        outgoing[fromNoteId].add(targetNoteId);
                        if (!backlinks[targetNoteId]) backlinks[targetNoteId] = [];
                        backlinks[targetNoteId].push({ fromNoteId, lineText: line.trim() });
                    }
                }
            });
        });

        Object.entries(filesMap).forEach(([fileName, content]) => {
            const fromNoteId = noteIdFromFileName(fileName);
            const readableContent = fileName === activeNote && !activeNoteLocked ? unsavedContent : content;
            if (isEncrypted(readableContent)) return;
            const lines = (readableContent || '').split('\n');

            noteIds.forEach(targetNoteId => {
                if (targetNoteId.length < 3 || targetNoteId.toLowerCase() === 'index' || fromNoteId === targetNoteId) return;
                if (outgoing[fromNoteId] && outgoing[fromNoteId].has(targetNoteId)) return;

                const escapedTitle = targetNoteId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const mentionRegex = new RegExp(`\\b${escapedTitle}\\b`, 'gi');

                lines.forEach(line => {
                    if (mentionRegex.test(line)) {
                        if (line.includes(`[[${targetNoteId}`) || line.includes(`(${targetNoteId}.md)`)) return;
                        
                        if (!unlinkedMentions[targetNoteId]) unlinkedMentions[targetNoteId] = [];
                        
                        if (!unlinkedMentions[targetNoteId].some(m => m.fromNoteId === fromNoteId && m.lineText === line.trim())) {
                            unlinkedMentions[targetNoteId].push({ fromNoteId, lineText: line.trim() });
                        }
                    }
                });
            });
        });

        return { outgoing, backlinks, unlinkedMentions, tagsByNote, notesByTag };
    }, [filesMap, noteIds, activeNote, activeNoteLocked, unsavedContent]);

    const activeNoteId = activeNote ? noteIdFromFileName(activeNote) : '';
    const activeNoteLinked = Boolean(activeNote && isNoteRefLinkedToWorkspace(activeNote, workspaceSnapshot.workspace));
    const activeBacklinks = graph.backlinks[activeNoteId] || [];
    const activeOutgoing = Array.from(graph.outgoing[activeNoteId] || []);
    const activeUnlinked = graph.unlinkedMentions[activeNoteId] || [];
    const activeTagRelationships = activeTags
        .map(tag => {
            const entry = graph.notesByTag[tagKey(tag)];
            const notes = (entry?.notes || []).filter(noteId => noteId !== activeNoteId);
            return { tag: entry?.tag || tag, notes };
        })
        .filter(entry => entry.notes.length > 0);

    const handleLinkMention = async (fromNoteId, targetTitle) => {
        const targetFileName = findNoteFileById(fromNoteId);
        const content = filesMap[targetFileName];
        if (!content) return;

        const escapedTitle = targetTitle.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const mentionRegex = new RegExp(`\\b(${escapedTitle})\\b`, 'gi');
        const updatedContent = content.replace(mentionRegex, '[[$1]]');

        try {
            await window.electron.writeFile(`${notesFolder}/${targetFileName}`, updatedContent);
            setFilesMap(prev => ({ ...prev, [targetFileName]: updatedContent }));
            
            if (activeNote === targetFileName) {
                setUnsavedContent(updatedContent);
                setIsDirty(false);
            }
        } catch (err) {
            console.error('Failed to link mention:', err);
            setError('Could not update note file to link mention.');
        }
    };

    const toggleWorkspaceNote = useCallback(() => {
        if (!activeNote) return;
        const workspace = setWorkspaceLink(workspaceSnapshot.workspace, 'linkedNoteRefs', activeNote, !activeNoteLinked);
        setWorkspaceSnapshot({ ...readPowerWorkspaceSnapshot(), workspace });
    }, [activeNote, activeNoteLinked, workspaceSnapshot.workspace]);

    const renderMarkdownComponents = useMemo(() => ({
        h1: ({ children }) => (
            <h1 className="text-2xl font-bold border-b border-[var(--border)] pb-2 mt-6 mb-4 text-[var(--text-primary)] tracking-tight">
                {children}
            </h1>
        ),
        h2: ({ children }) => (
            <h2 className="text-xl font-bold mt-6 mb-3 text-[var(--text-primary)] tracking-tight">
                {children}
            </h2>
        ),
        h3: ({ children }) => (
            <h3 className="text-lg font-bold mt-5 mb-2 text-[var(--accent)] tracking-tight">
                {children}
            </h3>
        ),
        h4: ({ children }) => (
            <h4 className="text-base font-semibold mt-4 mb-2 text-[var(--text-secondary)]">
                {children}
            </h4>
        ),
        p: ({ children }) => (
            <p className="text-sm leading-6 text-[var(--text-secondary)] mb-4 font-normal">
                {children}
            </p>
        ),
        ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-4 space-y-1.5 text-sm text-[var(--text-secondary)]">
                {children}
            </ul>
        ),
        ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-4 space-y-1.5 text-sm text-[var(--text-secondary)]">
                {children}
            </ol>
        ),
        li: ({ children }) => (
            <li className="leading-relaxed mb-0.5">
                {children}
            </li>
        ),
        blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[var(--accent)] pl-4 py-1 my-4 bg-[var(--bg-tertiary)] rounded-r text-[var(--text-secondary)] italic">
                {children}
            </blockquote>
        ),
        code: ({ className, children, ...props }) => {
            const isBlock = className && className.startsWith('language-') || String(children).includes('\n');
            return isBlock ? (
                <pre className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg p-3.5 my-4 overflow-x-auto font-mono text-xs text-[var(--text-primary)]">
                    <code className={className} {...props}>{children}</code>
                </pre>
            ) : (
                <code className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-xs font-mono border border-[var(--border)] text-[var(--accent-cyan)]" {...props}>
                    {children}
                </code>
            );
        },
        a: ({ href, children }) => {
            const label = children?.toString() || href;
            
            if (href) {
                const decodedHref = decodeURIComponent(href);
                if (decodedHref.endsWith('.md')) {
                    const noteName = decodedHref.replace(/\.md$/, '');
                    const targetFile = notesList.find(f => f.toLowerCase() === decodedHref.toLowerCase() || f.toLowerCase() === `${noteName.toLowerCase()}.md`);
                    
                    if (targetFile) {
                        return (
                            <a
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleSelectNote(targetFile);
                                }}
                                className="text-[var(--accent)] hover:underline font-semibold bg-transparent border-0 p-0 cursor-pointer inline-flex items-center gap-0.5"
                            >
                                {label}
                                <Link2 size={11} className="opacity-60" />
                            </a>
                        );
                    } else {
                        // Broken link / Uncreated note - show in red and offer to create
                        return (
                            <a
                                href="#"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    const newName = `${noteName}.md`;
                                    const filePath = `${notesFolder}/${newName}`;
                                    const initText = `# ${noteName}\n\n`;
                                    try {
                                        await window.electron.writeFile(filePath, initText);
                                        setFilesMap(prev => ({ ...prev, [newName]: initText }));
                                        setNotesList(prev => [...prev, newName].sort());
                                        setActiveNote(newName);
                                        setUnsavedContent(initText);
                                        setIsDirty(false);
                                    } catch (err) {
                                        console.error('Failed to create wiki note:', err);
                                    }
                                }}
                                className="text-rose-400 hover:underline border-b border-dashed border-rose-400 bg-transparent border-0 p-0 cursor-pointer inline-flex items-center gap-0.5"
                                title="Note does not exist. Click to create."
                            >
                                {label}?
                            </a>
                        );
                    }
                }
            }
            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent-cyan)] hover:underline inline-flex items-center gap-0.5"
                >
                    {label}
                    <ExternalLink size={11} className="opacity-60" />
                </a>
            );
        }
    }), [notesList, notesFolder, filesMap, activeNote, isDirty, unsavedContent]);

    const preprocessMarkdown = useCallback((text) => {
        if (!text) return '';
        return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, noteName, label) => {
            const cleanName = noteName.trim();
            const displayLabel = label ? label.trim() : cleanName;
            return `[${displayLabel}](${encodeURIComponent(cleanName)}.md)`;
        });
    }, []);

    const filteredNotes = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return notesList.filter(fileName => {
            if (workspaceOnly && !isNoteRefLinkedToWorkspace(fileName, workspaceSnapshot.workspace)) return false;
            if (!query) return true;
            const title = fileName.replace(/\.md$/, '').toLowerCase();
            const content = (filesMap[fileName] || '').toLowerCase();
            return title.includes(query) || content.includes(query);
        });
    }, [notesList, filesMap, searchQuery, workspaceOnly, workspaceSnapshot.workspace]);

    if (!notesFolder) {
        return (
            <div className="flex h-full flex-col items-center justify-center bg-[var(--bg-primary)] p-8 text-center text-[var(--text-secondary)]">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg animate-pulse">
                    <FolderOpen size={28} className="text-[var(--accent)]" />
                </div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">No Notes Folder Selected</h2>
                <p className="mt-2 max-w-md text-sm text-[var(--text-tertiary)]">
                    Perci Notes works locally within a local folder. Choose a folder to initialize your markdown knowledge base.
                </p>
                <button
                    onClick={handleChooseFolder}
                    className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-cyan)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all active:scale-95 animate-shimmer"
                >
                    <FolderOpen size={16} />
                    Choose Notes Folder
                </button>
            </div>
        );
    }

    if (notesList.length === 0 && !loading) {
        return (
            <div className="flex h-full flex-col items-center justify-center bg-[var(--bg-primary)] p-8 text-center text-[var(--text-secondary)]">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg">
                    <BookOpen size={28} className="text-[var(--accent)]" />
                </div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Initialize Your Wiki</h2>
                <p className="mt-2 max-w-md text-sm text-[var(--text-tertiary)]">
                    We will create a <code className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-xs text-[var(--accent)]">{`notes/`}</code> folder at the root of your workspace to save your files. 
                </p>
                <div className="mt-4 text-xs text-[var(--text-tertiary)] border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-3 max-w-sm">
                    <strong>Obsidian/Logseq Compatibility</strong>: Point your favorite desktop markdown app to this folder to view your notes with standard backlinks there.
                </div>
                <button
                    onClick={handleInitializeNotes}
                    className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-cyan)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all active:scale-95"
                >
                    <Sparkles size={16} />
                    Initialize Notes Folder
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-full bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans overflow-hidden">
            {/* Sidebar (File list & Actions) */}
            <div className="w-64 border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col shrink-0">
                <div className="p-3 border-b border-[var(--border)] flex flex-col gap-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-2.5 text-[var(--text-tertiary)]" />
                        <input
                            type="text"
                            placeholder="Search notes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-all"
                        />
                    </div>
                    
                    <div className="flex justify-between items-center gap-2">
                        <button
                            onClick={() => setShowNewNoteInput(!showNewNoteInput)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] font-medium transition-all"
                        >
                            <Plus size={13} />
                            New Note
                        </button>
                        <button
                            onClick={loadNotes}
                            title="Refresh Notes List"
                            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-all"
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    <button
                        onClick={() => setShowGraph(g => !g)}
                        title="Toggle 3D knowledge graph"
                        className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-all ${
                            showGraph
                                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                                : 'border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                        }`}
                    >
                        <Share2 size={13} />
                        {showGraph ? 'Hide Graph' : 'Knowledge Graph'}
                    </button>

                    <button
                        onClick={() => setWorkspaceOnly(value => !value)}
                        title={`Show notes linked to ${workspaceSnapshot.workspace.name}`}
                        className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-all ${
                            workspaceOnly
                                ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                                : 'border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                        }`}
                    >
                        <Link2 size={13} />
                        Workspace Notes
                    </button>
                </div>

                {showNewNoteInput && (
                    <form onSubmit={handleCreateNote} className="p-3 border-b border-[var(--border)] bg-[var(--bg-tertiary)] flex gap-2">
                        <input
                            autoFocus
                            type="text"
                            placeholder="Note title..."
                            value={newNoteName}
                            onChange={(e) => setNewNoteName(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                        <button
                            type="submit"
                            className="p-1 rounded bg-[var(--accent)] hover:opacity-90 text-white"
                        >
                            <Check size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowNewNoteInput(false); setNewNoteName(''); }}
                            className="p-1 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                        >
                            <X size={13} />
                        </button>
                    </form>
                )}

                <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                    {filteredNotes.map((fileName) => {
            const noteId = fileName.replace(/\.md$/, '').replace(/\.enc\.md$/, '');
                        const isActive = activeNote === fileName;
                        const locked = isEncrypted(filesMap[fileName]);
                        return (
                            <SidebarNoteItem
                                key={fileName}
                                fileName={fileName}
                                noteId={noteId}
                                isActive={isActive}
                                isLocked={locked}
                                onSelect={() => handleSelectNote(fileName)}
                                onRename={(newTitle) => handleRenameNote(fileName, newTitle)}
                                onDelete={() => handleDeleteNote(fileName)}
                                onToggleEncrypt={() => handleToggleEncrypt(fileName)}
                            />
                        );
                    })}
                    {filteredNotes.length === 0 && (
                        <div className="p-4 text-center text-xs text-[var(--text-tertiary)] italic">
                            No notes found
                        </div>
                    )}
                </div>
                
                <div className="p-2 border-t border-[var(--border)] text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] flex items-center justify-between gap-1.5" title={notesFolder}>
                    <span className="truncate">Folder: <span className="font-mono text-[9px]">{notesFolder}</span></span>
                    <div className="flex items-center gap-2 shrink-0">
                        <button 
                            onClick={handleExportOKF}
                            className="hover:text-[var(--text-primary)] transition-colors"
                            title="Export OKF Standard Bundle..."
                        >
                            <Download size={11} />
                        </button>
                        <button 
                            onClick={handleChooseFolder}
                            className="hover:text-[var(--text-primary)] transition-colors"
                            title="Change folder"
                        >
                            <FolderOpen size={11} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Editor & Preview Container */}
            <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)]">
                {showGraph ? (
                    <NotesGraph3D
                        noteIds={noteIds}
                        graph={graph}
                        activeNoteId={activeNoteId}
                        onOpenNote={(noteId) => {
                            const fileName = findNoteFileById(noteId);
                            if (fileName) { setShowGraph(false); handleSelectNote(fileName); }
                        }}
                        onClose={() => setShowGraph(false)}
                    />
                ) : activeNote ? (
                    <>
                        <div className="h-11 border-b border-[var(--border)] px-4 flex items-center justify-between bg-[var(--bg-secondary)] shrink-0 select-none">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[var(--text-tertiary)] text-xs font-semibold uppercase tracking-wider">Note:</span>
                                <div className="min-w-0">
                                    <EditableTitle
                                        initialTitle={activeNoteId}
                                        onSave={(newTitle) => handleRenameNote(activeNote, newTitle)}
                                        textClassName="text-sm font-bold text-[var(--text-primary)] font-mono"
                                    />
                                </div>
                                {activeNote && isEncrypted(filesMap[activeNote]) && (
                                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                        (encryptedPasswords[activeNote] || masterPasswordUsedFor[activeNote])
                                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`} title={masterPasswordUsedFor[activeNote] && !encryptedPasswords[activeNote] ? 'Unlocked via master password' : (encryptedPasswords[activeNote] || masterPasswordUsedFor[activeNote]) ? 'Unlocked (memory)' : 'Locked'}>
                                        <Lock size={10} />
                                        {(encryptedPasswords[activeNote] || masterPasswordUsedFor[activeNote])
                                            ? (masterPasswordUsedFor[activeNote] && !encryptedPasswords[activeNote] ? 'Master' : 'Unlocked')
                                            : 'Locked'}
                                    </span>
                                )}
                                {isDirty && (
                                    <span className="flex h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" title="Unsaved changes" />
                                )}
                                {activeNoteLinked && (
                                    <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-300">
                                        Workspace
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={toggleWorkspaceNote}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                        activeNoteLinked
                                            ? 'border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/15'
                                            : 'border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                    }`}
                                    title={activeNoteLinked ? 'Remove note from Power Workspace' : 'Link note to Power Workspace'}
                                >
                                    <Link2 size={12} />
                                    {activeNoteLinked ? 'Unlink' : 'Link'}
                                </button>
                                <div className="flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--bg-primary)] text-xs">
                                    <button
                                        onClick={() => setViewMode('edit')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                                            viewMode === 'edit'
                                                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold shadow-sm'
                                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                        }`}
                                    >
                                        <Edit3 size={12} />
                                        <span>Edit</span>
                                    </button>
                                    <button
                                        onClick={() => setViewMode('split')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                                            viewMode === 'split'
                                                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold shadow-sm'
                                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                        }`}
                                    >
                                        <Columns size={12} />
                                        <span>Split</span>
                                    </button>
                                    <button
                                        onClick={() => setViewMode('preview')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                                            viewMode === 'preview'
                                                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold shadow-sm'
                                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                        }`}
                                    >
                                        <Eye size={12} />
                                        <span>Preview</span>
                                    </button>
                                </div>

                                {activeNote && isEncrypted(filesMap[activeNote]) && encryptedPasswords[activeNote] && (
                                    <button
                                        onClick={() => handleLockNow(activeNote)}
                                        className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-amber-400 hover:text-amber-300 transition-all"
                                        title="Lock Note (clear decrypted content from memory)"
                                    >
                                        <Lock size={13} />
                                    </button>
                                )}

                                {/* Master Password button */}
                                <button
                                    onClick={() => { setMasterPasswordModal({ mode: masterPassword ? 'change' : 'set' }); setMasterPasswordInput(''); setMasterPasswordConfirm(''); setMasterPasswordError(''); }}
                                    className={`p-1.5 rounded-lg border transition-all ${
                                        masterPassword
                                            ? 'border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                                            : 'border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-purple-400'
                                    }`}
                                    title={masterPassword ? 'Change Master Password...' : 'Set Master Password...'}
                                >
                                    <KeyRound size={13} />
                                </button>

                                <button
                                    onClick={() => handleDeleteNote(activeNote)}
                                    className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-rose-400 hover:text-rose-300 transition-all"
                                    title="Delete Note"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>

                        {/* OKF Metadata Panel */}
                        <NotesOKFPanel
                            fields={okfFields}
                            onFieldChange={setOkfFields}
                            onTagsChange={(tags) => setOkfFields(prev => ({ ...prev, tags }))}
                            disabled={activeNoteLocked}
                        />

                        <div className="min-h-10 border-b border-[var(--border)] px-4 py-2 flex items-center gap-2 bg-[var(--bg-primary)] shrink-0">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] shrink-0">
                                <Tags size={13} className="text-[var(--accent)]" />
                                Tags
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                                {activeTags.map(tag => (
                                    <span
                                        key={tagKey(tag)}
                                        className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
                                    >
                                        #{tag}
                                        <button
                                            type="button"
                                            onClick={() => removeActiveTag(tag)}
                                            className="rounded-full text-[var(--text-tertiary)] hover:text-rose-300 transition-colors"
                                            title={`Remove ${tag}`}
                                        >
                                            <X size={10} />
                                        </button>
                                    </span>
                                ))}
                                <input
                                    type="text"
                                    value={tagInput}
                                    disabled={activeNoteLocked}
                                    onChange={(event) => setTagInput(event.target.value)}
                                    onKeyDown={handleTagInputKeyDown}
                                    onBlur={commitTagInput}
                                    placeholder={activeNoteLocked ? 'Unlock note to edit tags' : 'Add tag...'}
                                    className="min-w-[8rem] flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                />
                            </div>
                        </div>

                        <div className="flex-1 flex min-h-0 min-w-0">
                            {(viewMode === 'edit' || viewMode === 'split') && (
                                <div className="flex-1 h-full min-w-0 border-r border-[var(--border)]">
                                    <MonacoEditor
                                        height="100%"
                                        language="markdown"
                                        theme="vs-dark"
                                        value={unsavedContent}
                                        onChange={handleEditorChange}
                                        options={{
                                            minimap: { enabled: false },
                                            wordWrap: 'on',
                                            fontSize: 14,
                                            lineNumbers: 'off',
                                            fontFamily: '"Fira Code", "Courier New", monospace',
                                            padding: { top: 16, bottom: 16 },
                                            scrollbar: {
                                                vertical: 'auto',
                                                horizontal: 'auto'
                                            },
                                            background: 'transparent'
                                        }}
                                    />
                                </div>
                            )}

                            {(viewMode === 'preview' || viewMode === 'split') && (
                                <div className="flex-1 h-full overflow-y-auto bg-[var(--bg-primary)]">
                                    <div className="p-6 max-w-4xl mx-auto prose prose-invert">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={renderMarkdownComponents}
                                    >
                                        {preprocessMarkdown(stripNoteFrontmatter(unsavedContent))}
                                    </ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[var(--text-secondary)]">
                        <div className="mb-4 text-[var(--text-tertiary)]">
                            <BookOpen size={40} className="mx-auto opacity-30 animate-pulse" />
                        </div>
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">No Note Selected</h3>
                        <p className="mt-1 text-sm text-[var(--text-tertiary)] max-w-sm">
                            Select a note from the sidebar or click "+ New Note" to create one.
                        </p>
                    </div>
                )}
            </div>

            {/* Right Panel (Connections: Backlinks & Outgoing Links) */}
            {activeNote && (
                <div className="w-72 border-l border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col shrink-0 min-h-0 overflow-y-auto">
                    <div className="p-3 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--bg-tertiary)]">
                        <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                            <Compass size={14} className="text-[var(--accent)]" />
                            Connections
                        </span>
                    </div>

                    <div className="p-3 border-b border-[var(--border)]">
                        <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 mb-2 uppercase tracking-wide">
                            <Tags size={13} className="text-[var(--accent-cyan)]" />
                            Tags ({activeTags.length})
                        </h3>
                        {activeTags.length > 0 ? (
                            <div className="space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                    {activeTags.map(tag => (
                                        <span
                                            key={tagKey(tag)}
                                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]"
                                        >
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                                {activeTagRelationships.length > 0 && (
                                    <div className="space-y-1.5">
                                        {activeTagRelationships.map(({ tag, notes }) => (
                                            <div key={tagKey(tag)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2">
                                                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                                                    #{tag}
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {notes.map(noteId => (
                                                        <button
                                                            key={noteId}
                                                            onClick={() => {
                                                                const fileName = findNoteFileById(noteId);
                                                                if (fileName) handleSelectNote(fileName);
                                                            }}
                                                            className="max-w-full truncate rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] transition-all"
                                                        >
                                                            {noteId}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[11px] text-[var(--text-tertiary)] italic bg-[var(--bg-primary)] p-2 rounded-lg border border-[var(--border)]">
                                No tags on this note.
                            </div>
                        )}
                    </div>

                    <div className="p-3 border-b border-[var(--border)]">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 uppercase tracking-wide">
                                <ArrowRightLeft size={13} className="text-emerald-400 rotate-90" />
                                Backlinks ({activeBacklinks.length})
                            </h3>
                        </div>
                        {activeBacklinks.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {activeBacklinks.map((link, idx) => (
                                    <div 
                                        key={idx}
                                        onClick={() => {
                                            const fileName = findNoteFileById(link.fromNoteId);
                                            if (fileName) handleSelectNote(fileName);
                                        }}
                                        className="p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent)] cursor-pointer transition-all"
                                    >
                                        <div className="text-xs font-semibold text-[var(--text-secondary)] truncate">
                                            {link.fromNoteId}
                                        </div>
                                        <div className="text-[10px] text-[var(--text-tertiary)] italic line-clamp-2 mt-0.5 font-mono bg-[var(--bg-tertiary)] p-1 rounded">
                                            {link.lineText}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[11px] text-[var(--text-tertiary)] italic bg-[var(--bg-primary)] p-2 rounded-lg border border-[var(--border)]">
                                No direct incoming links.
                            </div>
                        )}
                    </div>

                    <div className="p-3 border-b border-[var(--border)]">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 uppercase tracking-wide">
                                <Sparkles size={13} className="text-amber-400" />
                                Unlinked Mentions ({activeUnlinked.length})
                            </h3>
                        </div>
                        {activeUnlinked.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {activeUnlinked.map((mention, idx) => (
                                    <div 
                                        key={idx}
                                        className="p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] space-y-1.5 transition-all"
                                    >
                                        <div 
                                            onClick={() => {
                                                const fileName = findNoteFileById(mention.fromNoteId);
                                                if (fileName) handleSelectNote(fileName);
                                            }}
                                            className="text-xs font-semibold text-[var(--text-secondary)] truncate hover:text-[var(--text-primary)] cursor-pointer"
                                        >
                                            {mention.fromNoteId}
                                        </div>
                                        <div className="text-[10px] text-[var(--text-tertiary)] italic line-clamp-2 font-mono bg-[var(--bg-tertiary)] p-1 rounded">
                                            {mention.lineText}
                                        </div>
                                        <button
                                            onClick={() => handleLinkMention(mention.fromNoteId, activeNoteId)}
                                            className="w-full flex items-center justify-center gap-1 py-1 rounded bg-[var(--accent)] hover:opacity-90 text-[10px] text-white font-semibold transition-all"
                                        >
                                            <Link2 size={10} />
                                            Convert to Link
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[11px] text-[var(--text-tertiary)] italic bg-[var(--bg-primary)] p-2 rounded-lg border border-[var(--border)]">
                                No unlinked mentions.
                            </div>
                        )}
                    </div>

                    <div className="p-3">
                        <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 mb-2 uppercase tracking-wide">
                            <ArrowRightLeft size={13} className="text-[var(--accent)]" />
                            Outgoing Links ({activeOutgoing.length})
                        </h3>
                        {activeOutgoing.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                                {activeOutgoing.map((linkId) => (
                                    <button
                                        key={linkId}
                                        onClick={() => {
                                            const fileName = findNoteFileById(linkId);
                                            if (fileName) handleSelectNote(fileName);
                                        }}
                                        className="px-2 py-1 text-[11px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] truncate transition-all"
                                    >
                                        {linkId}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[11px] text-[var(--text-tertiary)] italic bg-[var(--bg-primary)] p-2 rounded-lg border border-[var(--border)]">
                                No outgoing links in this note.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Password Modal */}
            {passwordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPasswordModal(null)}>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <KeyRound size={18} className="text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                                    {passwordModal.mode === 'encrypt' ? 'Encrypt Note' : 'Unlock Note'}
                                </h3>
                                <p className="text-[11px] text-[var(--text-tertiary)]">{passwordModal.noteId}</p>
                                {passwordModal.mode === 'encrypt' && masterPassword && (
                                    <span className="text-[10px] text-purple-400 font-medium">Master password available</span>
                                )}
                            </div>
                        </div>

                        <p className="text-xs text-[var(--text-secondary)] mb-3">
                            {passwordModal.mode === 'encrypt'
                                ? 'Choose a password to encrypt this note. You will need to enter it each time you reopen the app.'
                                : 'Enter the password to decrypt this note.'}
                        </p>

                        {/* Master password toggle for encryption */}
                        {passwordModal.mode === 'encrypt' && masterPassword && (
                            <label className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-purple-500/20 bg-purple-500/5 cursor-pointer hover:bg-purple-500/10 transition-all">
                                <input
                                    type="checkbox"
                                    checked={passwordModal.useMaster || false}
                                    onChange={(e) => setPasswordModal(prev => ({ ...prev, useMaster: e.target.checked }))}
                                    className="accent-purple-500"
                                />
                                <span className="text-xs font-medium text-purple-300">Use master password</span>
                            </label>
                        )}

                        <input
                            autoFocus={!(passwordModal.mode === 'encrypt' && passwordModal.useMaster && masterPassword)}
                            type="password"
                            placeholder={passwordModal.mode === 'encrypt' && passwordModal.useMaster && masterPassword ? 'Using master password...' : 'Password...'}
                            value={passwordInput}
                            disabled={passwordModal.mode === 'encrypt' && passwordModal.useMaster && masterPassword}
                            onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter') handlePasswordConfirm(); }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        />

                        {passwordError && (
                            <p className="text-xs text-rose-400 mt-2">{passwordError}</p>
                        )}

                        {passwordModal.mode === 'decrypt' && encryptedPasswords[passwordModal.fileName] && (
                            <button
                                onClick={() => handleDecryptPermanently(passwordModal.fileName)}
                                className="mt-3 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                            >
                                Remove encryption permanently
                            </button>
                        )}

                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => setPasswordModal(null)}
                                className="flex-1 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePasswordConfirm}
                                disabled={!passwordInput.trim() && !(passwordModal.mode === 'encrypt' && passwordModal.useMaster && masterPassword)}
                                className="flex-1 py-2 text-xs rounded-lg bg-[var(--accent)] hover:opacity-90 text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {passwordModal.mode === 'encrypt'
                                    ? (passwordModal.useMaster && masterPassword ? 'Encrypt (Master)' : 'Encrypt')
                                    : 'Unlock'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Master Password Modal */}
            {masterPasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setMasterPasswordModal(null)}>
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                <KeyRound size={18} className="text-purple-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                                    {masterPasswordModal.mode === 'set' ? 'Set Master Password' : 'Change Master Password'}
                                </h3>
                                <p className="text-[11px] text-[var(--text-tertiary)]">Used to encrypt/decrypt all your notes</p>
                            </div>
                        </div>

                        <p className="text-xs text-[var(--text-secondary)] mb-3">
                            {masterPasswordModal.mode === 'set'
                                ? 'Choose a master password. You can still set per-note passwords for extra security on sensitive notes.'
                                : 'Enter your current master password, then enter the new one.'}
                        </p>

                        <input
                            autoFocus
                            type="password"
                            placeholder={masterPasswordModal.mode === 'set' ? 'Master password...' : 'Current master password...'}
                            value={masterPasswordInput}
                            onChange={e => { setMasterPasswordInput(e.target.value); setMasterPasswordError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter' && masterPasswordModal.mode === 'set') handleMasterPasswordConfirm(); }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-purple-400 transition-all mb-2"
                        />

                        <input
                            type="password"
                            placeholder={masterPasswordModal.mode === 'set' ? 'Confirm password...' : 'New master password...'}
                            value={masterPasswordConfirm}
                            onChange={e => { setMasterPasswordConfirm(e.target.value); setMasterPasswordError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter') handleMasterPasswordConfirm(); }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-purple-400 transition-all"
                        />

                        {masterPasswordError && (
                            <p className="text-xs text-rose-400 mt-2">{masterPasswordError}</p>
                        )}

                        {masterPassword && masterPasswordModal.mode === 'change' && (
                            <button
                                onClick={handleClearMaster}
                                className="mt-3 text-[11px] text-rose-400 hover:text-rose-300 transition-colors"
                            >
                                Remove master password entirely
                            </button>
                        )}

                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => setMasterPasswordModal(null)}
                                className="flex-1 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMasterPasswordConfirm}
                                disabled={!masterPasswordInput.trim() || !masterPasswordConfirm.trim()}
                                className="flex-1 py-2 text-xs rounded-lg bg-purple-500 hover:bg-purple-400 text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {masterPasswordModal.mode === 'set' ? 'Set Master' : 'Change'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
