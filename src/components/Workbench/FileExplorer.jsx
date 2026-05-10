import React, { useState, useEffect, useCallback } from 'react';
import { Folder, FileCode, ChevronRight, ChevronDown, RefreshCw, File, FileJson, FileType } from 'lucide-react';

export function FileExplorer({ webcontainerInstance, workingDirectory, onFileSelect }) {
    const [files, setFiles] = useState([]);
    const [expandedFolders, setExpandedFolders] = useState(new Set(['.']));
    const [isLoading, setIsLoading] = useState(false);
    const [selectedPath, setSelectedPath] = useState(null);
    const hasLocalProject = Boolean(workingDirectory && window.electron?.listFiles);

    const loadFiles = useCallback(async () => {
        if (!hasLocalProject && !webcontainerInstance) {
            setFiles([]);
            return;
        }
        setIsLoading(true);
        try {
            const tree = hasLocalProject
                ? buildTreeFromPaths(await window.electron.listFiles(workingDirectory), workingDirectory)
                : await readDirRecursive(webcontainerInstance.fs, '.');
            setFiles(tree);
        } catch (error) {
            console.error('Failed to load files:', error);
            setFiles([]);
        } finally {
            setIsLoading(false);
        }
    }, [hasLocalProject, webcontainerInstance, workingDirectory]);

    useEffect(() => {
        loadFiles();
        const interval = setInterval(loadFiles, 2000);
        return () => clearInterval(interval);
    }, [loadFiles]);

    const toggleFolder = (path) => {
        const newExpanded = new Set(expandedFolders);
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
        }
        setExpandedFolders(newExpanded);
    };

    const handleSelect = (node) => {
        setSelectedPath(node.path);
        onFileSelect(node);
    };

    return (
        <div className="h-full flex flex-col bg-[#252526] border-r border-[#2b2b2b] w-60 text-sm select-none">
            <div className="h-12 border-b border-[#2b2b2b] flex items-center justify-between px-4 shrink-0">
                <span className="font-medium text-[#bbbbbb] text-xs uppercase tracking-wider">Explorer</span>
                <button onClick={loadFiles} className="p-1 hover:bg-[#37373d] rounded-md transition-colors text-[#cccccc]">
                    <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
                {files.map(node => (
                    <FileTreeNode
                        key={node.path}
                        node={node}
                        depth={0}
                        expandedFolders={expandedFolders}
                        onToggleFolder={toggleFolder}
                        onFileSelect={handleSelect}
                        selectedPath={selectedPath}
                    />
                ))}
                {files.length === 0 && !isLoading && (
                    <div className="text-center text-xs text-[#666666] mt-4 px-4">
                        {hasLocalProject ? 'No project files found' : 'Choose a folder to connect files'}
                    </div>
                )}
            </div>
        </div>
    );
}

function FileTreeNode({ node, depth, expandedFolders, onToggleFolder, onFileSelect, selectedPath }) {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedPath === node.path;
    const paddingLeft = `${depth * 12 + 12}px`;
    const rowClass = `flex h-7 items-center gap-1.5 cursor-pointer transition-colors ${isSelected ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'}`;
    const chevronClass = "flex h-4 w-4 shrink-0 items-center justify-center text-[#cccccc]";
    const iconClass = "flex h-4 w-4 shrink-0 items-center justify-center";

    // Icon selection
    const getIcon = () => {
        if (node.type === 'folder') return <Folder size={15} strokeWidth={1.8} className="block text-[#dcb67a]" />;
        if (node.name.endsWith('.jsx') || node.name.endsWith('.js')) return <FileCode size={15} strokeWidth={1.8} className="block text-[#4ec9b0]" />;
        if (node.name.endsWith('.json')) return <FileJson size={15} strokeWidth={1.8} className="block text-[#ce9178]" />;
        if (node.name.endsWith('.css')) return <FileType size={15} strokeWidth={1.8} className="block text-[#569cd6]" />;
        return <File size={15} strokeWidth={1.8} className="block text-[#cccccc]" />;
    };

    if (node.type === 'folder') {
        return (
            <div>
                <div
                    className={rowClass}
                    style={{ paddingLeft }}
                    onClick={() => onToggleFolder(node.path)}
                >
                    <span className={chevronClass}>
                        {isExpanded
                            ? <ChevronDown size={14} strokeWidth={1.9} className="block" />
                            : <ChevronRight size={14} strokeWidth={1.9} className="block" />
                        }
                    </span>
                    <span className={iconClass}>
                        {getIcon()}
                    </span>
                    <span className="min-w-0 truncate leading-none">{node.name}</span>
                </div>
                {isExpanded && node.children.map(child => (
                    <FileTreeNode
                        key={child.path}
                        node={child}
                        depth={depth + 1}
                        expandedFolders={expandedFolders}
                        onToggleFolder={onToggleFolder}
                        onFileSelect={onFileSelect}
                        selectedPath={selectedPath}
                    />
                ))}
            </div>
        );
    }

    return (
        <div
            className={rowClass}
            style={{ paddingLeft }}
            onClick={() => onFileSelect(node)}
        >
            <span className={chevronClass} aria-hidden="true" />
            <span className={iconClass}>
                {getIcon()}
            </span>
            <span className="min-w-0 truncate leading-none">{node.name}</span>
        </div>
    );
}

async function readDirRecursive(fs, path) {
    try {
        const entries = await fs.readdir(path, { withFileTypes: true });
        const result = [];

        // Ignore list for cleaner explorer
        const ignoreList = [
            'node_modules', '.git', '.vite', 'dist', 'dist_electron', 
            '.DS_Store', 'package-lock.json', 'yarn.lock', '.next', '.output'
        ];

        entries.sort((a, b) => {
            if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
            return a.isDirectory() ? -1 : 1;
        });

        for (const entry of entries) {
            if (ignoreList.includes(entry.name)) continue;

            const fullPath = path === '.' ? entry.name : `${path}/${entry.name}`;
            if (entry.isDirectory()) {
                result.push({
                    name: entry.name,
                    path: fullPath,
                    type: 'folder',
                    children: await readDirRecursive(fs, fullPath)
                });
            } else {
                result.push({
                    name: entry.name,
                    path: fullPath,
                    type: 'file'
                });
            }
        }
        return result;
    } catch (e) {
        console.error(`Error reading directory ${path}:`, e);
        return [];
    }
}

function buildTreeFromPaths(filePaths, workingDirectory) {
    const root = [];
    const folderMap = new Map();

    const ensureFolder = (parts) => {
        let currentChildren = root;
        let currentPath = '';

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!folderMap.has(currentPath)) {
                const folder = {
                    name: part,
                    path: currentPath,
                    type: 'folder',
                    children: [],
                    source: 'local',
                    absolutePath: `${workingDirectory}/${currentPath}`
                };
                folderMap.set(currentPath, folder);
                currentChildren.push(folder);
            }
            currentChildren = folderMap.get(currentPath).children;
        }

        return currentChildren;
    };

    for (const filePath of filePaths) {
        const parts = filePath.split('/').filter(Boolean);
        if (parts.length === 0) continue;

        const fileName = parts.pop();
        const parentChildren = ensureFolder(parts);
        parentChildren.push({
            name: fileName,
            path: filePath,
            type: 'file',
            source: 'local',
            absolutePath: `${workingDirectory}/${filePath}`
        });
    }

    const sortNodes = (nodes) => {
        nodes.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });
        nodes.forEach(node => {
            if (node.children) sortNodes(node.children);
        });
    };

    sortNodes(root);
    return root;
}
