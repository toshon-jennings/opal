import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { OPAL_LOGO_DATA_URI } from '../lib/opalLogoDataUri';

const BuildContext = createContext();

const defaultFiles = {
    'src/App.tsx': `import React, { useState, useEffect } from 'react';

const PROMPTS = [
  "A dashboard with analytics charts",
  "A login form with glassmorphism",
  "A Kanban board with drag columns",
  "A music player with visualizer",
  "A landing page for a SaaS product",
];

const FEATURES = [
  { icon: "⚡", label: "Instant preview" },
  { icon: "🎨", label: "Tailwind CSS" },
  { icon: "⚛️", label: "React components" },
  { icon: "🔄", label: "Live refresh" },
];

export default function App() {
  const [promptIdx, setPromptIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPromptIdx(i => (i + 1) % PROMPTS.length);
        setVisible(true);
      }, 400);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0C0C0D 0%, #141417 50%, #0C0C0D 100%)',
      fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Ambient glow orbs */}
      <div style={{
        position: 'absolute', top: '15%', left: '20%',
        width: 340, height: 340,
        background: 'radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 70%)',
        borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none',
        animation: 'pulse 4s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '15%', right: '18%',
        width: 280, height: 280,
        background: 'radial-gradient(circle, rgba(251,146,60,0.10) 0%, transparent 70%)',
        borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none',
        animation: 'pulse 5s ease-in-out infinite reverse',
      }} />
      <div style={{
        position: 'absolute', top: '55%', left: '55%',
        width: 200, height: 200,
        background: 'radial-gradient(circle, rgba(253,186,116,0.07) 0%, transparent 70%)',
        borderRadius: '50%', filter: 'blur(30px)', pointerEvents: 'none',
        animation: 'pulse 6s ease-in-out infinite 1s',
      }} />

      <style>{\`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
        .fade-prompt { transition: opacity 0.35s ease, transform 0.35s ease; }
        .badge:hover { background: rgba(249,115,22,0.12) !important; border-color: rgba(249,115,22,0.25) !important; transform: translateY(-1px); }
        .badge { transition: background 0.2s, border-color 0.2s, transform 0.2s; }
      \`}</style>

      <div style={{
        position: 'relative', zIndex: 1,
        textAlign: 'center', maxWidth: 580, padding: '0 24px',
        animation: 'fadeUp 0.6s ease both',
      }}>
        {/* Icon mark */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 72, height: 72, borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(253,186,116,0.14))',
          border: '1px solid rgba(249,115,22,0.28)',
          boxShadow: '0 0 40px rgba(249,115,22,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
          marginBottom: 28, fontSize: 32,
          animation: 'fadeUp 0.6s ease 0.1s both',
        }}>
          <img src="${OPAL_LOGO_DATA_URI}" alt="Perci" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
        </div>

        {/* Heading */}
        <h1 style={{
          margin: '0 0 16px',
          fontSize: 'clamp(32px, 5vw, 48px)',
          fontWeight: 700,
          lineHeight: 1.15,
          background: 'linear-gradient(135deg, #f5f5f7 0%, #fb923c 40%, #fdba74 70%, #f5f5f7 100%)',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'shimmer 4s linear infinite, fadeUp 0.6s ease 0.15s both',
        }}>
          Build something beautiful
        </h1>

        {/* Rotating prompt */}
        <div style={{
          height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 36, overflow: 'hidden',
          animation: 'fadeUp 0.6s ease 0.2s both',
        }}>
          <p className="fade-prompt" style={{
            margin: 0,
            fontSize: 16,
            color: 'rgba(161,161,170,0.85)',
            fontWeight: 400,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
          }}>
            Try: <span style={{ color: '#fb923c', fontWeight: 500 }}>{PROMPTS[promptIdx]}</span>
          </p>
        </div>

        {/* Feature badges */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
          marginBottom: 44,
          animation: 'fadeUp 0.6s ease 0.3s both',
        }}>
          {FEATURES.map(f => (
            <span key={f.label} className="badge" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(212,212,216,0.9)',
              fontSize: 13, fontWeight: 500,
              cursor: 'default',
            }}>
              {f.icon} {f.label}
            </span>
          ))}
        </div>

        {/* CTA hint */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '12px 22px', borderRadius: 14,
          background: 'rgba(249,115,22,0.08)',
          border: '1px solid rgba(249,115,22,0.22)',
          color: 'rgba(253,186,116,0.9)',
          fontSize: 14, fontWeight: 500,
          animation: 'fadeUp 0.6s ease 0.4s both',
          boxShadow: '0 4px 24px rgba(249,115,22,0.08)',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#f97316',
            boxShadow: '0 0 8px rgba(249,115,22,0.7)',
            display: 'inline-block',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          Describe a UI component or surface to begin
        </div>
      </div>
    </div>
  );
}`,
    'src/index.tsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
    'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;`
};

export function BuildProvider({ children }) {
    const [buildMessages, setBuildMessages] = useState([]);
    const [buildFiles, setBuildFiles] = useState(defaultFiles);
    const [activeFile, setActiveFile] = useState('src/App.tsx');
    const [isGenerating, setIsGenerating] = useState(false);
    const activeRequestRef = useRef(null);

    const abortGeneration = useCallback(() => {
        activeRequestRef.current?.abort();
    }, []);

    const addBuildMessage = useCallback((message) => {
        setBuildMessages(prev => [...prev, {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            ...message
        }]);
    }, []);

    const updateBuildFiles = useCallback((newFiles) => {
        setBuildFiles(prev => ({
            ...prev,
            ...newFiles
        }));
    }, []);

    const clearBuild = useCallback(() => {
        setBuildMessages([]);
        setBuildFiles(defaultFiles);
        setActiveFile('src/App.tsx');
    }, []);

    const value = {
        buildMessages,
        addBuildMessage,
        buildFiles,
        updateBuildFiles,
        activeFile,
        setActiveFile,
        isGenerating,
        setIsGenerating,
        clearBuild,
        activeRequestRef,
        abortGeneration
    };

    return (
        <BuildContext.Provider value={value}>
            {children}
        </BuildContext.Provider>
    );
}

export function useBuild() {
    const context = useContext(BuildContext);
    if (!context) {
        throw new Error('useBuild must be used within a BuildProvider');
    }
    return context;
}
