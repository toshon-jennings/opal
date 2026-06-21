import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { SyntaxHighlighter } from '../lib/syntaxHighlighter';
import { User, Copy, Check, Code, ExternalLink, FileText, Image as ImageIcon, Table, Sun, Cloud, CloudRain, CloudSnow, Wind, TrendingUp, TrendingDown } from 'lucide-react';
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
function ArtifactReferenceCard({ title, type, excerpt, onOpen, onCopy }) {
    const [copied, setCopied] = React.useState(false);
    const { label, Icon } = describeArtifact(type);
    const handleCopy = (e) => {
        e.stopPropagation();
        onCopy?.();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="group my-3 flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-left">
            <button
                type="button"
                onClick={onOpen}
                aria-label={`Open ${title}`}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
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
            {onCopy && (
                <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 p-2 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                    title="Copy artifact content"
                >
                    {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                </button>
            )}
        </div>
    );
}

// Helper to extract weather data from search metadata/query/sources
function extractWeatherData(message) {
    const query = (message.metadata?.searchQuery || message.content || '').toLowerCase();
    const intent = message.metadata?.searchIntent;
    
    // Check if it's weather intent/query
    const isWeather = intent === 'weather' || 
        (/\b(weather|forecast|temperature|temp|rain|snow|wind|humidity)\b/.test(query));
        
    if (!isWeather) return null;
    
    // Default location extraction
    let location = 'Current Location';
    const locationMatch = query.match(/(?:weather (?:in|for|at)|temperature (?:in|for|at)|temp (?:in|for|at))\s+([a-z\s,]+)/i);
    if (locationMatch && locationMatch[1]) {
        location = locationMatch[1].trim().replace(/\b\w/g, c => c.toUpperCase());
    } else {
        // Try parsing sources for location
        const sources = message.metadata?.searchSources || [];
        for (const src of sources) {
            const content = src.content || '';
            const match = content.match(/weather in ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
            if (match && match[1]) {
                location = match[1];
                break;
            }
        }
    }
    
    // Default values
    let temp = 72;
    let unit = '°F';
    let condition = 'Sunny';
    let humidity = 45;
    let wind = 8;
    let high = 78;
    let low = 62;
    
    // Try to extract from sources content
    const sources = message.metadata?.searchSources || [];
    const fullText = sources.map(s => s.content || '').join(' ');
    
    // Extract temperature: e.g. 75°F, 24°C, 75 degrees
    const tempMatch = fullText.match(/(\d{1,3})\s*(?:°|deg|degrees)\s*([FCfc])/);
    if (tempMatch) {
        temp = parseInt(tempMatch[1], 10);
        unit = '°' + tempMatch[2].toUpperCase();
    } else {
        const tempOnlyMatch = fullText.match(/(\d{1,3})\s*(?:°|degrees)/);
        if (tempOnlyMatch) {
            temp = parseInt(tempOnlyMatch[1], 10);
        }
    }
    
    // Extract high/low
    const highLowMatch = fullText.match(/(?:high|max)[^\d]*(\d{1,3})[^\d]*(?:low|min)[^\d]*(\d{1,3})/i) || 
                         fullText.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
    if (highLowMatch) {
        high = Math.max(parseInt(highLowMatch[1], 10), parseInt(highLowMatch[2], 10));
        low = Math.min(parseInt(highLowMatch[1], 10), parseInt(highLowMatch[2], 10));
    }
    
    // Extract condition
    if (/\b(rain|rainy|shower|drizzle)\b/i.test(fullText + ' ' + query)) {
        condition = 'Rainy';
    } else if (/\b(cloud|cloudy|overcast)\b/i.test(fullText + ' ' + query)) {
        condition = 'Cloudy';
    } else if (/\b(snow|snowy|blizzard|flurries)\b/i.test(fullText + ' ' + query)) {
        condition = 'Snowy';
    } else if (/\b(storm|thunderstorm|lightning)\b/i.test(fullText + ' ' + query)) {
        condition = 'Stormy';
    } else if (/\b(sunny|clear|fair)\b/i.test(fullText + ' ' + query)) {
        condition = 'Sunny';
    }
    
    // Extract humidity
    const humidityMatch = fullText.match(/humidity[^\d]*(\d{1,3})\s*%/i);
    if (humidityMatch) {
        humidity = parseInt(humidityMatch[1], 10);
    }
    
    // Extract wind
    const windMatch = fullText.match(/wind[^\d]*(\d{1,2})\s*(?:mph|km\/h|kts)/i);
    if (windMatch) {
        wind = parseInt(windMatch[1], 10);
    }
    
    return { location, temp, unit, condition, humidity, wind, high, low };
}

// Helper to extract stock data from search metadata/query/sources
function extractStockData(message) {
    const query = (message.metadata?.searchQuery || message.content || '').toLowerCase();
    const intent = message.metadata?.searchIntent;
    
    // Check if it's finance intent/query
    const isStock = intent === 'finance' || 
        (/\b(stock|share price|ticker|market cap|nasdaq|nyse|dow jones|s&p 500)\b/.test(query)) ||
        /\b[A-Z]{1,5}\b/.test(message.metadata?.searchQuery || '');
        
    if (!isStock) return null;
    
    // Default symbol/name extraction
    let symbol = 'STOCK';
    let name = 'Market Indicator';
    
    // Look for common tickers or names in query
    const tickers = {
        aapl: { symbol: 'AAPL', name: 'Apple Inc.' },
        msft: { symbol: 'MSFT', name: 'Microsoft Corporation' },
        goog: { symbol: 'GOOGL', name: 'Alphabet Inc.' },
        amzn: { symbol: 'AMZN', name: 'Amazon.com, Inc.' },
        tsla: { symbol: 'TSLA', name: 'Tesla, Inc.' },
        nvda: { symbol: 'NVDA', name: 'NVIDIA Corporation' },
        meta: { symbol: 'META', name: 'Meta Platforms, Inc.' },
        nflx: { symbol: 'NFLX', name: 'Netflix, Inc.' },
        btc: { symbol: 'BTC', name: 'Bitcoin' }
    };
    
    let found = false;
    for (const key of Object.keys(tickers)) {
        if (new RegExp(`\\b${key}\\b`, 'i').test(query)) {
            symbol = tickers[key].symbol;
            name = tickers[key].name;
            found = true;
            break;
        }
    }
    
    if (!found) {
        const uppercaseWords = (message.metadata?.searchQuery || '').match(/\b[A-Z]{1,5}\b/g);
        if (uppercaseWords && uppercaseWords.length > 0) {
            symbol = uppercaseWords[0];
            name = symbol + ' Corporation';
        } else {
            // Check for words like "nvidia", "apple", etc.
            const names = {
                nvidia: { symbol: 'NVDA', name: 'NVIDIA Corporation' },
                apple: { symbol: 'AAPL', name: 'Apple Inc.' },
                microsoft: { symbol: 'MSFT', name: 'Microsoft Corporation' },
                google: { symbol: 'GOOGL', name: 'Alphabet Inc.' },
                amazon: { symbol: 'AMZN', name: 'Amazon.com, Inc.' },
                tesla: { symbol: 'TSLA', name: 'Tesla, Inc.' },
                meta: { symbol: 'META', name: 'Meta Platforms, Inc.' }
            };
            for (const key of Object.keys(names)) {
                if (new RegExp(`\\b${key}\\b`, 'i').test(query)) {
                    symbol = names[key].symbol;
                    name = names[key].name;
                    found = true;
                    break;
                }
            }
        }
    }
    
    // Default values
    let price = 150.00;
    let change = 1.25;
    let percentChange = 0.84;
    let isPositive = true;
    
    // Try to extract from sources
    const sources = message.metadata?.searchSources || [];
    const fullText = sources.map(s => s.content || '').join(' ');
    
    // Extract price (e.g. $182.41, USD 182.41)
    const priceMatch = fullText.match(/\$(\d+(?:\.\d{2})?)/);
    if (priceMatch) {
        price = parseFloat(priceMatch[1]);
    }
    
    // Extract change / percentage change
    // e.g. +1.25 (+0.84%), -2.40 (-1.30%)
    const changeMatch = fullText.match(/([+-])\s*(\d+(?:\.\d+)?)\s*\(?\s*([+-]?\d+(?:\.\d+)?%)\s*\)?/) ||
                        fullText.match(/([+-])\s*(\d+(?:\.\d+)?%)/);
    if (changeMatch) {
        isPositive = changeMatch[1] === '+';
        if (changeMatch[3]) {
            change = parseFloat(changeMatch[2]);
            percentChange = parseFloat(changeMatch[3].replace('%', ''));
        } else {
            percentChange = parseFloat(changeMatch[2].replace('%', ''));
            change = price * (percentChange / 100);
        }
    } else {
        // Fallback simple positive/negative sign search
        if (fullText.includes('-') && !fullText.includes('+')) {
            isPositive = false;
        }
    }
    
    // Mock high/low around price if none found
    const high = price * (1 + 0.015);
    const low = price * (1 - 0.015);
    const volume = '2.4M';
    
    return { symbol, name, price, change, percentChange, isPositive, high, low, volume };
}

function WeatherWidget({ data }) {
    const { location, temp, unit, condition, humidity, wind, high, low } = data;
    
    let WeatherIcon = Sun;
    if (condition === 'Rainy') WeatherIcon = CloudRain;
    else if (condition === 'Cloudy') WeatherIcon = Cloud;
    else if (condition === 'Snowy') WeatherIcon = CloudSnow;
    else if (condition === 'Stormy') WeatherIcon = CloudRain;
    
    return (
        <div className="my-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-tertiary)] flex items-center justify-between shadow-sm max-w-md">
            <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
                    <WeatherIcon size={32} />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">{location}</h4>
                    <p className="text-xs text-[var(--text-tertiary)]">{condition}</p>
                    <div className="mt-1 flex gap-2 text-[10px] text-[var(--text-secondary)]">
                        <span>H: {high.toFixed(0)}° L: {low.toFixed(0)}°</span>
                        <span>•</span>
                        <span>Humidity: {humidity}%</span>
                    </div>
                </div>
            </div>
            <div className="text-right">
                <span className="text-2xl font-extrabold text-[var(--text-primary)]">
                    {temp}{unit}
                </span>
                <div className="text-[9px] text-[var(--text-tertiary)] mt-1 flex items-center justify-end gap-1">
                    <Wind size={10} />
                    <span>Wind: {wind} mph</span>
                </div>
            </div>
        </div>
    );
}

function StockWidget({ data }) {
    const { symbol, name, price, change, percentChange, isPositive, high, low, volume } = data;
    
    return (
        <div className="my-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-tertiary)] flex items-center justify-between shadow-sm max-w-md">
            <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isPositive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                    {isPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] border border-[var(--border)]">{symbol}</span>
                        <span className="text-xs font-semibold text-[var(--text-tertiary)] truncate max-w-[150px]">{name}</span>
                    </div>
                    <div className="mt-1 flex gap-2 text-[10px] text-[var(--text-secondary)]">
                        <span>High: ${high.toFixed(2)}</span>
                        <span>•</span>
                        <span>Low: ${low.toFixed(2)}</span>
                    </div>
                </div>
            </div>
            <div className="text-right">
                <span className="text-lg font-extrabold text-[var(--text-primary)]">
                    ${price.toFixed(2)}
                </span>
                <div className={`text-xs font-semibold mt-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    <span>{isPositive ? '+' : '-'}${Math.abs(change).toFixed(2)} ({isPositive ? '+' : '-'}{Math.abs(percentChange).toFixed(2)}%)</span>
                </div>
            </div>
        </div>
    );
}

export function ChatMessage({ message }) {
    const isUser = message.role === 'user';
    const isError = !isUser && typeof message.content === 'string' && message.content.startsWith('Error:');
    const weatherData = !isUser ? extractWeatherData(message) : null;
    const stockData = !isUser ? extractStockData(message) : null;
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

                {/* Show citations if this message has search sources */}
                {!isUser && message.metadata?.searchSources && message.metadata.searchSources.length > 0 && (
                    <CitationDisplay
                        sources={message.metadata.searchSources}
                        searchQuery={message.metadata.searchQuery}
                    />
                )}

                {/* Show weather widget if weather query */}
                {weatherData && <WeatherWidget data={weatherData} />}

                {/* Show stock widget if stock query */}
                {stockData && <StockWidget data={stockData} />}

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
                                    onCopy={() => {
                                        if (artifact?.content) {
                                            navigator.clipboard.writeText(artifact.content);
                                        }
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

            </div>
        </div>
    );
}
