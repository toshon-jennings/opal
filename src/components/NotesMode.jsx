import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    BookOpen, FileText, Search, Plus, Trash2, Edit3, Eye, Columns,
    FolderOpen, Link2, ExternalLink, X, Check, RefreshCw, Compass, ArrowRightLeft, Sparkles, Pencil, Lock, Unlock, KeyRound
} from 'lucide-react';
import { useMode } from '../context/ModeContext';
import { EditableTitle } from './EditableTitle';
import { encryptNote, decryptNote, isEncrypted } from '../utils/note-crypto';

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

    const [notesFolder, setNotesFolder] = useState('');
    const [notesList, setNotesList] = useState([]); // Array of strings (filenames like "Index.md")
    const [filesMap, setFilesMap] = useState({}); // filename -> file content
    const [activeNote, setActiveNote] = useState(null); // filename like "Index.md"
    const [unsavedContent, setUnsavedContent] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('split'); // 'edit' | 'preview' | 'split'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [newNoteName, setNewNoteName] = useState('');
    const [showNewNoteInput, setShowNewNoteInput] = useState(false);
    const [encryptedPasswords, setEncryptedPasswords] = useState({}); // filename -> password (only in memory)
    const [passwordModal, setPasswordModal] = useState(null); // { mode: 'encrypt'|'decrypt', fileName, noteId } | null
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState('');

    // Resolve notes folder path
    useEffect(() => {
        if (workingDirectory) {
            setNotesFolder(`${workingDirectory}/notes`);
        } else {
            setNotesFolder('');
        }
    }, [workingDirectory]);

    // Choose directory if not set
    const handleChooseFolder = async () => {
        if (!window.electron?.selectDirectory) return;
        try {
            const folderPath = await window.electron.selectDirectory();
            if (folderPath) {
                setCodeState(prev => ({ ...prev, workingDirectory: folderPath }));
            }
        } catch (err) {
            console.error('Failed to select directory:', err);
        }
    };

    // Load notes and sync filesystem
    const loadNotes = useCallback(async () => {
        if (!workingDirectory || !notesFolder) return;
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
    }, [workingDirectory, notesFolder, activeNote, isDirty]);

    // Load notes on folder change
    useEffect(() => {
        if (workingDirectory && notesFolder) {
            loadNotes();
        }
    }, [workingDirectory, notesFolder]);

    // Initialize notes directory
    const handleInitializeNotes = async () => {
        if (!notesFolder) return;
        try {
            setLoading(true);
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
            // If we already have the password, decrypt immediately
            if (encryptedPasswords[fileName]) {
                try {
                    const decrypted = await decryptNote(content, encryptedPasswords[fileName]);
                    setActiveNote(fileName);
                    setUnsavedContent(decrypted);
                    setIsDirty(false);
                } catch {
                    setPasswordModal({ mode: 'decrypt', fileName, noteId: fileName.replace(/\.md$/, '').replace(/\.enc\.md$/, '') });
                    setPasswordInput('');
                    setPasswordError('');
                }
            } else {
                // Need password
                setPasswordModal({ mode: 'decrypt', fileName, noteId: fileName.replace(/\.md$/, '').replace(/\.enc\.md$/, '') });
                setPasswordInput('');
                setPasswordError('');
            }
            return;
        }

        setActiveNote(fileName);
        setUnsavedContent(content);
        setIsDirty(false);
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
        if (pwd) {
            // Encrypt before writing; use .enc.md extension
            const encFileName = `${displayName}.enc.md`;
            const encrypted = await encryptNote(content, pwd);
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
            await window.electron.writeFile(`${notesFolder}/${fileName}`, content);
            setFilesMap(prev => ({ ...prev, [fileName]: content }));
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
            setPasswordModal({ mode: 'encrypt', fileName, noteId });
            setPasswordInput('');
            setPasswordError('');
        }
    };

    // Confirm password modal action
    const handlePasswordConfirm = async () => {
        if (!passwordModal || !passwordInput.trim()) return;
        const { mode, fileName, noteId } = passwordModal;
        const pwd = passwordInput.trim();

        try {
            if (mode === 'encrypt') {
                // Encrypt the current unsaved content
                const content = unsavedContent || filesMap[fileName] || '';
                const encrypted = await encryptNote(content, pwd);
                const encFileName = `${noteId}.enc.md`;
                await window.electron.writeFile(`${notesFolder}/${encFileName}`, encrypted);
                // Delete old .md file
                try { await window.electron.deleteFile(`${notesFolder}/${fileName}`); } catch {}

                // Update state
                setEncryptedPasswords(prev => ({ ...prev, [encFileName]: pwd }));
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
                // Store password in memory for future re-encryption on save
                setEncryptedPasswords(prev => ({ ...prev, [fileName]: pwd }));

                // If we want to permanently decrypt (remove encryption), we'd write plaintext.
                // For now, keep encrypted on disk but allow editing decrypted in memory.
                // User can choose to decrypt permanently via a separate action.
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
        const pwd = encryptedPasswords[fileName];
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

    // Lock a note now: remove password from memory, clear decrypted content
    const handleLockNow = (fileName) => {
        setEncryptedPasswords(prev => {
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

    // Editor content changes
    const handleEditorChange = (value) => {
        setUnsavedContent(value || '');
        setIsDirty(true);
    };

    const noteIds = useMemo(() => {
        return notesList.map(f => f.replace(/\.enc\.md$/, '').replace(/\.md$/, ''));
    }, [notesList]);

    // Parse graph
    const graph = useMemo(() => {
        const outgoing = {};
        const backlinks = {};
        const unlinkedMentions = {};

        noteIds.forEach(id => {
            outgoing[id] = new Set();
            backlinks[id] = [];
            unlinkedMentions[id] = [];
        });

        Object.entries(filesMap).forEach(([fileName, content]) => {
            const fromNoteId = fileName.replace(/\.enc\.md$/, '').replace(/\.md$/, '');
            const lines = (content || '').split('\n');

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
            const fromNoteId = fileName.replace(/\.enc\.md$/, '').replace(/\.md$/, '');
            const lines = (content || '').split('\n');

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

        return { outgoing, backlinks, unlinkedMentions };
    }, [filesMap, noteIds]);

    const activeNoteId = activeNote ? activeNote.replace(/\.enc\.md$/, '').replace(/\.md$/, '') : '';
    const activeBacklinks = graph.backlinks[activeNoteId] || [];
    const activeOutgoing = Array.from(graph.outgoing[activeNoteId] || []);
    const activeUnlinked = graph.unlinkedMentions[activeNoteId] || [];

    const handleLinkMention = async (fromNoteId, targetTitle) => {
        const targetFileName = `${fromNoteId}.md`;
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
        if (!searchQuery) return notesList;
        const query = searchQuery.toLowerCase();
        return notesList.filter(fileName => {
            const title = fileName.replace(/\.md$/, '').toLowerCase();
            const content = (filesMap[fileName] || '').toLowerCase();
            return title.includes(query) || content.includes(query);
        });
    }, [notesList, filesMap, searchQuery]);

    if (!workingDirectory) {
        return (
            <div className="flex h-full flex-col items-center justify-center bg-[var(--bg-primary)] p-8 text-center text-[var(--text-secondary)]">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg animate-pulse">
                    <FolderOpen size={28} className="text-[var(--accent)]" />
                </div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">No Workspace Folder Selected</h2>
                <p className="mt-2 max-w-md text-sm text-[var(--text-tertiary)]">
                    Perci Notes works locally within your active workspace folder. Choose a folder to initialize your markdown knowledge base.
                </p>
                <button
                    onClick={handleChooseFolder}
                    className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-cyan)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 transition-all active:scale-95 animate-shimmer"
                >
                    <FolderOpen size={16} />
                    Choose Workspace Folder
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
                
                <div className="p-2.5 border-t border-[var(--border)] text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] truncate" title={notesFolder}>
                    Folder: <code className="font-mono text-[9px]">notes/</code>
                </div>
            </div>

            {/* Main Editor & Preview Container */}
            <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)]">
                {activeNote ? (
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
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20" title="Encrypted on disk">
                                        <Lock size={10} />
                                        {encryptedPasswords[activeNote] ? 'Unlocked' : 'Locked'}
                                    </span>
                                )}
                                {isDirty && (
                                    <span className="flex h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" title="Unsaved changes" />
                                )}
                            </div>

                            <div className="flex items-center gap-3">
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

                                <button
                                    onClick={() => handleDeleteNote(activeNote)}
                                    className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-rose-400 hover:text-rose-300 transition-all"
                                    title="Delete Note"
                                >
                                    <Trash2 size={13} />
                                </button>
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
                                <div className="flex-1 h-full overflow-y-auto p-6 bg-[var(--bg-primary)] max-w-4xl mx-auto prose prose-invert">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={renderMarkdownComponents}
                                    >
                                        {preprocessMarkdown(unsavedContent)}
                                    </ReactMarkdown>
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
                                        onClick={() => handleSelectNote(`${link.fromNoteId}.md`)}
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
                                            onClick={() => handleSelectNote(`${mention.fromNoteId}.md`)}
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
                                        onClick={() => handleSelectNote(`${linkId}.md`)}
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
                            </div>
                        </div>

                        <p className="text-xs text-[var(--text-secondary)] mb-3">
                            {passwordModal.mode === 'encrypt'
                                ? 'Choose a password to encrypt this note. You will need to enter it each time you reopen the app.'
                                : 'Enter the password to decrypt this note.'}
                        </p>

                        <input
                            autoFocus
                            type="password"
                            placeholder="Password..."
                            value={passwordInput}
                            onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter') handlePasswordConfirm(); }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-all"
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
                                disabled={!passwordInput.trim()}
                                className="flex-1 py-2 text-xs rounded-lg bg-[var(--accent)] hover:opacity-90 text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {passwordModal.mode === 'encrypt' ? 'Encrypt' : 'Unlock'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
