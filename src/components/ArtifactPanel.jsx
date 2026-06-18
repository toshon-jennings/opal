import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Code, Eye, Maximize2, X, Copy, Check, Download, FileText, Pencil, Sun, Moon } from 'lucide-react';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { SyntaxHighlighter } from '../lib/syntaxHighlighter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
    PREVIEW_SECURITY_LIMITS,
    buildPreviewErrorDocument,
    buildStaticPreviewDocument,
    getPreviewSandbox
} from '../lib/previewSecurity';

export function ArtifactPanel({ isOpen, onClose, artifact, onUpdateContent, width }) {
    const [view, setView] = useState('preview'); // 'preview', 'code', or 'edit'
    const [copied, setCopied] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [previewTheme, setPreviewTheme] = useState('light'); // 'light' or 'dark'
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        if (view === 'edit') setEditContent(artifact?.content || '');
    }, [view, artifact?.id]);

    const sandboxedPreviewDoc = useMemo(() => {
        if (!artifact || !['html', 'svg'].includes(artifact.type)) return '';
        try {
            return buildStaticPreviewDocument(artifact.content, {
                title: artifact.title,
                type: artifact.type
            });
        } catch (error) {
            return buildPreviewErrorDocument(error.message);
        }
    }, [artifact]);

    if (!isOpen || !artifact) return null;

    const copyCode = () => {
        navigator.clipboard.writeText(artifact.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const canPreview = ['html', 'svg', 'react', 'research_paper'].includes(artifact.type);

    const downloadPdf = async () => {
        if (!artifact) return;

        const element = document.getElementById('artifact-pdf-content');
        if (!element) return;

        try {
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            // Use jsPDF's HTML method for vector rendering (text selection, smaller size)
            // It relies on html2canvas for sizing/parsing so we pass it
            await pdf.html(element, {
                callback: function (doc) {
                    doc.save(`${artifact.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.pdf`);
                },
                x: 40,
                y: 40,
                width: pdfWidth - 80, // Margins
                windowWidth: 800, // Render as if 800px wide
                html2canvas: {
                    scale: 0.57, // Adjust scale to fit A4 width (595pt vs 800px + margins)
                    logging: false,
                    useCORS: true
                },
                autoPaging: 'text'
            });
        } catch (error) {
            console.error('PDF generation failed:', error);
            // Fallback to raster if vector fails
            try {
                const canvas = await html2canvas(element, { scale: 2, useCORS: true });
                if (canvas.width * canvas.height > PREVIEW_SECURITY_LIMITS.maxExportPixels) {
                    throw new Error('PDF raster fallback is too large to export safely.');
                }
                const imgData = canvas.toDataURL('image/jpeg', 0.8); // JPEG compression
                const pdf = new jsPDF('p', 'mm', 'a4');
                const w = pdf.internal.pageSize.getWidth();
                const h = (canvas.height * w) / canvas.width;
                pdf.addImage(imgData, 'JPEG', 0, 0, w, h);
                pdf.save(`${artifact.title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
            } catch (e) {
                console.error('Fallback failed:', e);
            }
        }
    };

    const panelContent = (
        <div
            style={{ '--artifact-w': `${width || 560}px` }}
            className={`layout-transition border-l border-[var(--border)] bg-[var(--bg-primary)] flex flex-col h-full transition-all duration-300 ${
            isMaximized
                // Maximized: portaled to <body> (see return below), so z-[60] is in
                // the app-root stacking context and sits above the header (z-50).
                ? 'fixed inset-0 w-full z-[60]'
                : 'w-full md:w-[var(--artifact-w)] fixed md:relative right-0 top-0 bottom-0 z-40'
        }`}>
            {/* Header */}
            <div className="p-3 md:pt-14 md:pb-4 md:px-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-secondary)]">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-[var(--accent)] rounded-md flex items-center justify-center">
                        <Code size={16} className="text-white" />
                    </div>
                    <div>
                        <span className="font-medium text-sm text-[var(--text-primary)] truncate max-w-[120px] md:max-w-[200px] block">{artifact.title}</span>
                        <div className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-semibold">{artifact.language}</div>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {artifact.type === 'research_paper' && (
                        <button
                            onClick={downloadPdf}
                            className="micro-interaction px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                            <Download size={14} className="inline mr-1" />
                            PDF
                        </button>
                    )}
                    {canPreview && (
                        <>
                            <button
                                onClick={() => setView('preview')}
                                className={`micro-interaction px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'preview'
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                    }`}
                            >
                                <Eye size={14} className="inline mr-1" />
                                Preview
                            </button>
                            <button
                                onClick={() => setView('code')}
                                className={`micro-interaction px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'code'
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                    }`}
                            >
                                <Code size={14} className="inline mr-1" />
                                Source
                            </button>
                        </>
                    )}
                    
                    <div className="h-6 w-px bg-[var(--border)] mx-1 hidden sm:block" />

                    {view === 'preview' && (
                        <button
                            onClick={() => setPreviewTheme(t => t === 'light' ? 'dark' : 'light')}
                            className="micro-interaction p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                            title={`Switch to ${previewTheme === 'light' ? 'dark' : 'light'} preview`}
                        >
                            {previewTheme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                        </button>
                    )}

                    <button
                        onClick={() => setIsMaximized(!isMaximized)}
                        className={`micro-interaction p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors ${isMaximized ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                        title={isMaximized ? "Restore size" : "Maximize"}
                    >
                        <Maximize2 size={16} />
                    </button>

                    <button
                        onClick={copyCode}
                        className="micro-interaction p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors"
                        title="Copy code"
                    >
                        {copied ? (
                            <Check size={16} className="text-green-500" />
                        ) : (
                            <Copy size={16} className="text-[var(--text-tertiary)]" />
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        className="micro-interaction p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors"
                    >
                        <X size={16} className="text-[var(--text-tertiary)]" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {view === 'preview' && canPreview ? (
                    <div className={`w-full h-full overflow-auto relative transition-colors duration-300 ${previewTheme === 'light' ? 'bg-white' : 'bg-[#0a0a0a]'}`}>
                        {artifact.type === 'research_paper' && (
                            <div
                                id="artifact-pdf-content"
                                className={`max-w-[800px] mx-auto p-12 min-h-full prose prose-sm md:prose-base transition-colors duration-300 ${previewTheme === 'light' ? 'prose-slate bg-white text-black' : 'prose-invert bg-[#0a0a0a] text-white'}`}
                                style={{ fontFamily: 'Times New Roman, serif' }}
                            >
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        h1: ({ node, ...props }) => <h1 style={{ fontSize: '28px', borderBottom: '2px solid currentColor', paddingBottom: '10px', marginTop: '0', marginBottom: '24px', fontWeight: 'bold' }} {...props} />,
                                        h2: ({ node, ...props }) => <h2 style={{ fontSize: '20px', borderBottom: '1px solid currentColor', paddingBottom: '6px', marginTop: '24px', marginBottom: '16px', fontWeight: 'bold', opacity: 0.9 }} {...props} />,
                                        h3: ({ node, ...props }) => <h3 style={{ fontSize: '16px', marginTop: '18px', marginBottom: '12px', fontWeight: 'bold', opacity: 0.85 }} {...props} />,
                                        p: ({ node, ...props }) => <p style={{ lineHeight: '1.6', marginBottom: '16px', textAlign: 'justify' }} {...props} />,
                                        li: ({ node, ...props }) => <li style={{ marginBottom: '4px' }} {...props} />,
                                        a: ({ node, ...props }) => <a style={{ color: '#2563eb', textDecoration: 'underline' }} {...props} />,
                                        img: ({ node, ...props }) => <img style={{ maxHeight: '20px', marginLeft: '4px', verticalAlign: 'middle' }} {...props} />
                                    }}
                                >
                                    {artifact.content}
                                </ReactMarkdown>
                            </div>
                        )}
                        {artifact.type === 'html' && (
                            <iframe
                                className="w-full h-full border-0"
                                srcDoc={sandboxedPreviewDoc}
                                sandbox={getPreviewSandbox({ scripts: true })}
                                referrerPolicy="no-referrer"
                                title="HTML Preview"
                            />
                        )}
                        {artifact.type === 'svg' && (
                            <div className={`w-full h-full ${previewTheme === 'light' ? 'bg-gray-100' : 'bg-[#111]'}`}>
                                <iframe
                                    className="h-full w-full border-0"
                                    srcDoc={sandboxedPreviewDoc}
                                    sandbox={getPreviewSandbox()}
                                    referrerPolicy="no-referrer"
                                    title="SVG Preview"
                                />
                            </div>
                        )}
                        {artifact.type === 'react' && (
                            <div className={`w-full h-full flex items-center justify-center p-8 ${previewTheme === 'light' ? 'bg-gray-50' : 'bg-[#0d0d0d]'}`}>
                                <div className="text-center text-[var(--text-secondary)]">
                                    <Code size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>React component preview requires a build step.</p>
                                    <p className="text-sm mt-2">Switch to Code view to see the component.</p>
                                </div>
                            </div>
                        )}
                    </div>
                ) : view === 'edit' ? (
                    <div className="h-full flex flex-col">
                        <textarea
                            className="flex-1 w-full p-4 font-mono text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)] resize-none outline-none leading-relaxed"
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            spellCheck={false}
                        />
                        <div className="flex justify-end gap-2 p-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
                            <button
                                onClick={() => setView(canPreview ? 'preview' : 'code')}
                                className="px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => { onUpdateContent?.(editContent); setView(canPreview ? 'preview' : 'code'); }}
                                className="px-4 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="h-full overflow-auto bg-[var(--bg-secondary)]">
                        <SyntaxHighlighter
                            language={artifact.language}
                            style={vscDarkPlus}
                            customStyle={{
                                margin: 0,
                                height: '100%',
                                fontSize: '0.875rem',
                                background: 'var(--bg-secondary)',
                                padding: '1.5rem'
                            }}
                            showLineNumbers
                            wrapLongLines={true}
                        >
                            {artifact.content}
                        </SyntaxHighlighter>
                    </div>
                )}
            </div>
        </div>
    );

    // When maximized, portal to <body> so the overlay escapes the chat window's
    // stacking context. Each .perci-window is absolutely positioned with its own
    // z-index, so an in-window z-[60] stays trapped beneath the app header (z-50)
    // and the restore/close controls become unreachable. Portaling lifts it to the
    // app root where z-[60] correctly sits above the header.
    return isMaximized ? createPortal(panelContent, document.body) : panelContent;
}
