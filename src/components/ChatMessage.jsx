import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { SyntaxHighlighter } from '../lib/syntaxHighlighter';
import { User, Copy, Check, Code, ExternalLink, FileText, Image as ImageIcon, Table } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useMode } from '../context/ModeContext';
import { CitationDisplay } from './CitationDisplay';
import { ThinkingDisplay } from './ThinkingDisplay';
import PerciMascot from './PerciMascot';

// Maps an artifact's type to a human label and icon for the in-chat reference card.
const ARTIFACT_DESCRIPTORS = {
    research_paper: { label: 'Research paper', Icon: FileText },
    html: { label: 'Web page', Icon: Code },
    svg: { label: 'Vector graphic', Icon: Code },
    react: { label: 'React component', Icon: Code },
    markdown: { label: 'Document', Icon: FileText },
};

function describeArtifact(type) {
    return ARTIFACT_DESCRIPTORS[type] || { label: 'Artifact', Icon: FileText };
}

// Pull attributes out of a `:::artifact{...}` directive. Only used as a fallback
// when the artifact itself can't be resolved from the store (e.g. it lives in a
// different chat). The matching that finds the directive is anchored on `id`, so
// a title containing quotes never breaks rendering.
function parseArtifactDirective(raw) {
    const grab = (key) => (raw.match(new RegExp(`${key}="([^"]*)"`)) || [])[1] || '';
    return { id: grab('id'), title: grab('title'), type: grab('type') };
}

// A short, plain-text preview of an artifact's content (markdown stripped).
function artifactExcerpt(content) {
    if (!content) return '';
    return content
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[`*_>#|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 110);
}

// Polished, clickable reference to an artifact, rendered inline in a chat message
// wherever an `:::artifact{...}` directive appears.
function ArtifactReferenceCard({ title, type, excerpt, onOpen }) {
    const { label, Icon } = describeArtifact(type);
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${title}`}
            className="group my-3 flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-left transition-all hover:border-[var(--accent)] hover:shadow-[0_8px_28px_var(--accent-glow)]"
        >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--accent-rgb),0.12)] text-[var(--accent)]">
                <Icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</span>
                    <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                        {label}
                    </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                    {excerpt || 'Open to view and download'}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent)]">
                <span className="hidden sm:inline">Open</span>
                <ExternalLink size={15} />
            </div>
        </button>
    );
}

export function ChatMessage({ message }) {
    const isUser = message.role === 'user';
    const isError = !isUser && typeof message.content === 'string' && message.content.startsWith('Error:');
    // Brief celebration only for a freshly-arrived answer (not old history on load).
    const [celebrate, setCelebrate] = React.useState(
        () => !isUser && !isError && message.timestamp && Date.now() - message.timestamp < 4000
    );
    React.useEffect(() => {
        if (!celebrate) return;
        const t = setTimeout(() => setCelebrate(false), 1600);
        return () => clearTimeout(t);
    }, [celebrate]);
    const mascotState = isError ? 'error' : celebrate ? 'happy' : 'idle';
    const [copiedCode, setCopiedCode] = React.useState(null);
    const [copiedMessage, setCopiedMessage] = React.useState(false);
    const { setCurrentArtifactId, setIsArtifactOpen, getArtifact } = useChat();
    const { openArtifactWindow } = useMode();

    const copyCode = (code, index) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(index);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const copyMessage = () => {
        navigator.clipboard.writeText(message.content || '');
        setCopiedMessage(true);
        setTimeout(() => setCopiedMessage(false), 2000);
    };

    const markdownComponents = {
        code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const codeIndex = `${message.id}-${codeString.substring(0, 20)}`;

            return !inline && match ? (
                <div className="relative group my-3">
                    <div className="flex items-center justify-between bg-[var(--bg-tertiary)] px-3 py-2 rounded-t-md border-b border-[var(--border)]">
                        <span className="text-xs font-mono text-[var(--text-secondary)]">
                            {match[1]}
                        </span>
                        <button
                            onClick={() => copyCode(codeString, codeIndex)}
                            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-[var(--bg-hover)] rounded transition-colors text-[var(--text-secondary)]">
                            {copiedCode === codeIndex ? (
                                <>
                                    <Check size={14} className="text-green-500" />
                                    <span className="text-green-500">Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={14} />
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                    </div>
                    <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                            margin: 0,
                            borderRadius: '0 0 0.375rem 0.375rem',
                            fontSize: '0.875rem',
                            background: 'var(--bg-tertiary)'
                        }}
                        {...props}
                    >
                        {codeString}
                    </SyntaxHighlighter>
                </div>
            ) : (
                <code className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-sm font-mono border border-[var(--border-light)]" {...props}>
                    {children}
                </code>
            );
        },
        p({ children }) {
            return <p className="mb-3 last:mb-0 leading-7">{children}</p>;
        },
        ul({ children }) {
            return <ul className="list-disc pl-6 mb-3 space-y-1.5">{children}</ul>;
        },
        ol({ children }) {
            return <ol className="list-decimal pl-6 mb-3 space-y-1.5">{children}</ol>;
        },
        li({ children }) {
            return <li className="leading-7">{children}</li>;
        },
        h1({ children }) {
            return <h1 className="text-2xl font-semibold mb-3 mt-4">{children}</h1>;
        },
        h2({ children }) {
            return <h2 className="text-xl font-semibold mb-2.5 mt-4">{children}</h2>;
        },
        h3({ children }) {
            return <h3 className="text-lg font-semibold mb-2 mt-3">{children}</h3>;
        },
        blockquote({ children }) {
            return (
                <blockquote className="border-l-3 border-[var(--accent)] pl-4 my-3 text-[var(--text-secondary)]">
                    {children}
                </blockquote>
            );
        },
        a({ children, href }) {
            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline"
                >
                    {children}
                </a>
            );
        },
        table({ children }) {
            return (
                <div className="overflow-x-auto my-4">
                    <table className="min-w-full border border-[var(--border)] rounded-lg">
                        {children}
                    </table>
                </div>
            );
        },
        th({ children }) {
            return (
                <th className="border border-[var(--border)] px-4 py-2 bg-[var(--bg-tertiary)] text-left font-semibold">
                    {children}
                </th>
            );
        },
        td({ children }) {
            return (
                <td className="border border-[var(--border)] px-4 py-2">
                    {children}
                </td>
            );
        }
    };

    return (
        <div className={`chat-message flex gap-3 md:gap-4 py-6 px-4 transition-colors ${isUser ? '' : 'bg-[var(--bg-secondary)]'
            }`}>
            <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 ${isUser
                ? 'bg-[var(--accent)] text-white'
                : ''
                }`}>
                {isUser ? <User size={18} /> : <PerciMascot state={mascotState} size={32} title={isError ? 'Perci hit an error' : 'Perci'} />}
            </div>

            <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="font-semibold text-sm text-[var(--accent)]">
                        {isUser ? 'You' : 'Perci'}
                    </div>
                    <button
                        type="button"
                        onClick={copyMessage}
                        className="message-copy-button inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        title="Copy message"
                    >
                        {copiedMessage ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                        <span className={copiedMessage ? 'text-green-500' : ''}>{copiedMessage ? 'Copied' : 'Copy'}</span>
                    </button>
                </div>

                {/* Display uploaded images */}
                {message.images && message.images.length > 0 && (
                    <div className="mb-3 flex gap-2 flex-wrap">
                        {message.images.map((img, idx) => (
                            <img
                                key={idx}
                                src={img.dataUrl}
                                alt={img.name || `Image ${idx + 1}`}
                                className="max-w-[200px] max-h-[200px] rounded-lg border border-[var(--border)] object-cover"
                            />
                        ))}
                    </div>
                )}

                {message.metadata?.attachments && message.metadata.attachments.length > 0 && (
                    <div className="mb-3 flex gap-2 flex-wrap">
                        {message.metadata.attachments.map((attachment, idx) => {
                            const Icon = attachment.type === 'image'
                                ? ImageIcon
                                : attachment.type === 'table'
                                    ? Table
                                    : FileText;
                            return (
                                <div
                                    key={`${attachment.name}-${idx}`}
                                    className="inline-flex items-center gap-2 max-w-[260px] px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)]"
                                    title={attachment.name}
                                >
                                    <Icon size={14} className="shrink-0 text-[var(--accent)]" />
                                    <div className="min-w-0">
                                        <div className="truncate text-[var(--text-primary)]">{attachment.name}</div>
                                        {attachment.sizeLabel && (
                                            <div className="text-[10px] text-[var(--text-tertiary)]">{attachment.sizeLabel}</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Show ThinkingDisplay for completed messages with thinking - ONLY if thinking exists */}
                {!isUser && message.metadata?.thinking && message.metadata.thinking.trim() !== '' && (
                    <ThinkingDisplay
                        thinking={message.metadata.thinking}
                        tokens={message.metadata.thinkingTokens}
                        duration={message.metadata.duration}
                        isStreaming={false}
                    />
                )}

                <div className="message-select-region prose prose-sm max-w-none text-[var(--text-primary)] leading-relaxed">
                    {(() => {
                        // Find `:::artifact{...}` directives. Anchored on `id` (always a
                        // numeric timestamp, never quoted), so a title containing quotes
                        // can't break the match and leak raw directive text into the chat.
                        const artifactRegex = /:::artifact\{id="([^"]+)"[^}]*\}/g;
                        const elements = [];
                        let lastIndex = 0;
                        let match;

                        // Use exec to find all matches and their indices
                        while ((match = artifactRegex.exec(message.content)) !== null) {
                            // Add text before the match
                            const beforeText = message.content.substring(lastIndex, match.index);
                            if (beforeText) {
                                elements.push(
                                    <ReactMarkdown
                                        key={`text-${lastIndex}`}
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw]}
                                        components={markdownComponents}
                                    >
                                        {beforeText}
                                    </ReactMarkdown>
                                );
                            }

                            // Resolve the real artifact for rich metadata; fall back to the
                            // directive's own attributes if it isn't in the store.
                            const [fullMatch, id] = match;
                            const fallback = parseArtifactDirective(fullMatch);
                            const artifact = getArtifact?.(id);
                            elements.push(
                                <ArtifactReferenceCard
                                    key={`artifact-${id}`}
                                    title={artifact?.title || fallback.title || 'Artifact'}
                                    type={artifact?.type || fallback.type}
                                    excerpt={artifactExcerpt(artifact?.content)}
                                    onOpen={() => {
                                        setCurrentArtifactId(id);
                                        setIsArtifactOpen(true);
                                        if (openArtifactWindow) openArtifactWindow(id);
                                    }}
                                />
                            );

                            lastIndex = match.index + fullMatch.length;
                        }

                        // Add remaining text after all matches
                        const remainingText = message.content.substring(lastIndex);
                        if (remainingText || elements.length === 0) {
                            elements.push(
                                <ReactMarkdown
                                    key={`text-${lastIndex}`}
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeRaw]}
                                    components={markdownComponents}
                                >
                                    {remainingText || ""}
                                </ReactMarkdown>
                            );
                        }

                        return elements;
                    })()}
                </div>

                {/* Show citations if this message has search sources */}
                {!isUser && message.metadata?.searchSources && message.metadata.searchSources.length > 0 && (
                    <CitationDisplay
                        sources={message.metadata.searchSources}
                        searchQuery={message.metadata.searchQuery}
                    />
                )}
            </div>
        </div>
    );
}
