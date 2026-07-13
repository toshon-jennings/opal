import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Columns2, Rows3, X } from 'lucide-react';
import TerminalPanel from './Terminal';

function createLeaf(id) {
  return { type: 'leaf', id };
}

function countLeaves(node) {
  return node.type === 'leaf' ? 1 : countLeaves(node.first) + countLeaves(node.second);
}

function firstLeafId(node) {
  return node.type === 'leaf' ? node.id : firstLeafId(node.first);
}

function replaceLeaf(node, id, replacement) {
  if (node.type === 'leaf') return node.id === id ? replacement : node;
  return {
    ...node,
    first: replaceLeaf(node.first, id, replacement),
    second: replaceLeaf(node.second, id, replacement),
  };
}

function removeLeaf(node, id) {
  if (node.type === 'leaf') return node.id === id ? null : node;
  const first = removeLeaf(node.first, id);
  const second = removeLeaf(node.second, id);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

// A native pane tree: every leaf owns one xterm instance and one PTY session.
// This deliberately does not send terminal-multiplexer escape sequences.
const TerminalSplitLayout = forwardRef(function TerminalSplitLayout({ sessionId, onStatusChange, onOutput }, ref) {
  const panelRefs = useRef({});
  const statusesRef = useRef({});
  const onStatusChangeRef = useRef(onStatusChange);
  const sequenceRef = useRef(1);
  const [layout, setLayout] = useState(() => createLeaf(sessionId));
  const [activePaneId, setActivePaneId] = useState(sessionId);

  onStatusChangeRef.current = onStatusChange;

  const selectPane = useCallback((id) => {
    setActivePaneId(id);
    requestAnimationFrame(() => panelRefs.current[id]?.focus?.());
  }, []);

  useEffect(() => {
    statusesRef.current = {};
    sequenceRef.current = 1;
    setLayout(createLeaf(sessionId));
    setActivePaneId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    onStatusChangeRef.current?.(statusesRef.current[activePaneId] || 'connecting');
  }, [activePaneId]);

  const split = useCallback((direction) => {
    const nextId = `${sessionId}-pane-${sequenceRef.current++}`;
    setLayout(tree => replaceLeaf(tree, activePaneId, {
      type: 'split',
      direction,
      first: createLeaf(activePaneId),
      second: createLeaf(nextId),
    }));
    selectPane(nextId);
  }, [activePaneId, selectPane, sessionId]);

  const closePane = useCallback(() => {
    if (countLeaves(layout) === 1) return;
    const nextLayout = removeLeaf(layout, activePaneId);
    if (!nextLayout) return;
    const nextActiveId = firstLeafId(nextLayout);
    delete panelRefs.current[activePaneId];
    delete statusesRef.current[activePaneId];
    setLayout(nextLayout);
    selectPane(nextActiveId);
  }, [activePaneId, layout, selectPane]);

  const handleStatusChange = useCallback((id, status) => {
    statusesRef.current[id] = status;
    if (id === activePaneId) onStatusChangeRef.current?.(status);
  }, [activePaneId]);

  useImperativeHandle(ref, () => ({
    splitRight: () => split('horizontal'),
    splitDown: () => split('vertical'),
    closePane,
    reset: () => panelRefs.current[activePaneId]?.reset?.(),
    reconnect: () => panelRefs.current[activePaneId]?.reconnect?.(),
    focus: () => panelRefs.current[activePaneId]?.focus?.(),
    sendInput: (data) => panelRefs.current[activePaneId]?.sendInput?.(data),
  }), [activePaneId, closePane, split]);

  const renderNode = (node) => {
    if (node.type === 'leaf') {
      return (
        <div
          key={node.id}
          className={`min-h-0 min-w-0 flex-1 overflow-hidden ${node.id === activePaneId ? 'ring-1 ring-inset ring-amber-500/35' : ''}`}
          onPointerDown={() => selectPane(node.id)}
        >
          <TerminalPanel
            ref={element => { panelRefs.current[node.id] = element; }}
            sessionId={node.id}
            embedded
            onStatusChange={status => handleStatusChange(node.id, status)}
            onOutput={onOutput}
          />
        </div>
      );
    }

    return (
      <div key={`${node.direction}-${firstLeafId(node)}`} className={`flex min-h-0 min-w-0 flex-1 ${node.direction === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
        {renderNode(node.first)}
        <div className={node.direction === 'horizontal' ? 'w-px shrink-0 bg-[var(--border)]' : 'h-px shrink-0 bg-[var(--border)]'} />
        {renderNode(node.second)}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0C0C0D]">
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1">
        <button onClick={() => split('horizontal')} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-amber-500/10 hover:text-amber-500" title="Split right">
          <Columns2 size={13} />
        </button>
        <button onClick={() => split('vertical')} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-amber-500/10 hover:text-amber-500" title="Split down">
          <Rows3 size={13} />
        </button>
        {countLeaves(layout) > 1 && (
          <button onClick={closePane} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-red-500/10 hover:text-red-400" title="Close active pane">
            <X size={13} />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1">{renderNode(layout)}</div>
    </div>
  );
});

export default TerminalSplitLayout;
