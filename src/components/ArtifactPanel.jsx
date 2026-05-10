import React, { useState, useRef, useEffect } from 'react';
import { Code, Eye, Maximize2, X, Copy, Check, Download, FileText } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export function ArtifactPanel({ isOpen, onClose, artifact }) {
    const [view, setView] = useState('preview'); // 'preview' or 'code'
    const [copied, setCopied] = useState(false);
    const iframeRef = useRef(null);

    useEffect(() => {
        if (artifact && artifact.type === 'html' && view === 'preview' && iframeRef.current) {
            const doc = iframeRef.current.contentDocument;
            doc.open();
            doc.write(artifact.content);
            doc.close();
        }
    }, [artifact, view]);

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

    return (
        <div className="w-full md:w-[560px] border-l border-[var(--border)] bg-[var(--bg-primary)] flex flex-col h-full fixed md:relative right-0 top-0 bottom-0 z-20">
            {/* Header */}
            <div className="p-3 md:pt-14 md:pb-4 md:px-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-secondary)]">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-[var(--accent)] rounded-md flex items-center justify-center">
                        <Code size={16} className="text-white" />
                    </div>
                    <div>
                        <span className="font-medium text-sm text-[var(--text-primary)]">{artifact.title}</span>
                        <div className="text-xs text-[var(--text-tertiary)]">{artifact.language}</div>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {artifact.type === 'research_paper' && (
                        <button
                            onClick={downloadPdf}
                            className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                            <Download size={14} className="inline mr-1" />
                            PDF
                        </button>
                    )}
                    {canPreview && (
                        <>
                            <button
                                onClick={() => setView('preview')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'preview'
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                    }`}
                            >
                                <Eye size={14} className="inline mr-1" />
                                Preview
                            </button>
                            <button
                                onClick={() => setView('code')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'code'
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                    }`}
                            >
                                <Code size={14} className="inline mr-1" />
                                Source
                            </button>
                        </>
                    )}
                    <button
                        onClick={copyCode}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors"
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
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors"
                    >
                        <X size={16} className="text-[var(--text-tertiary)]" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {view === 'preview' && canPreview ? (
                    <div className="w-full h-full bg-white overflow-auto relative">
                        {artifact.type === 'research_paper' && (
                            <div
                                id="artifact-pdf-content"
                                className="max-w-[800px] mx-auto p-12 bg-white min-h-full prose prose-sm md:prose-base prose-slate"
                                style={{ fontFamily: 'Times New Roman, serif', color: '#000' }}
                            >
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeRaw]}
                                    components={{
                                        h1: ({ node, ...props }) => <h1 style={{ fontSize: '28px', borderBottom: '2px solid #000', paddingBottom: '10px', marginTop: '0', marginBottom: '24px', fontWeight: 'bold', color: '#000' }} {...props} />,
                                        h2: ({ node, ...props }) => <h2 style={{ fontSize: '20px', borderBottom: '1px solid #ddd', paddingBottom: '6px', marginTop: '24px', marginBottom: '16px', fontWeight: 'bold', color: '#000' }} {...props} />,
                                        h3: ({ node, ...props }) => <h3 style={{ fontSize: '16px', marginTop: '18px', marginBottom: '12px', fontWeight: 'bold', color: '#000' }} {...props} />,
                                        p: ({ node, ...props }) => <p style={{ lineHeight: '1.6', marginBottom: '16px', textAlign: 'justify', color: '#000' }} {...props} />,
                                        li: ({ node, ...props }) => <li style={{ marginBottom: '4px', color: '#000' }} {...props} />,
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
                                ref={iframeRef}
                                className="w-full h-full border-0"
                                sandbox="allow-scripts allow-same-origin"
                                title="HTML Preview"
                            />
                        )}
                        {artifact.type === 'svg' && (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 p-8">
                                <div dangerouslySetInnerHTML={{ __html: artifact.content }} />
                            </div>
                        )}
                        {artifact.type === 'react' && (
                            <div className="w-full h-full flex items-center justify-center p-8 bg-gray-50">
                                <div className="text-center text-gray-600">
                                    <Code size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>React component preview requires a build step.</p>
                                    <p className="text-sm mt-2">Switch to Code view to see the component.</p>
                                </div>
                            </div>
                        )}
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
                                background: 'var(--bg-secondary)'
                            }}
                            showLineNumbers
                        >
                            {artifact.content}
                        </SyntaxHighlighter>
                    </div>
                )}
            </div>
        </div>
    );
}
