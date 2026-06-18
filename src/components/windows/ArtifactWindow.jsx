import React, { useEffect } from 'react';
import { useMode } from '../../context/ModeContext';
import { useChat } from '../../context/ChatContext';
import { ArtifactPanel } from '../ArtifactPanel';

// Window wrapper for ArtifactPanel. Reads the pending artifact ID from
// ModeContext (set by openArtifactWindow) and resolves it against the
// ChatContext artifact store.
export default function ArtifactWindow() {
    const { pendingArtifactId, setPendingArtifactId } = useMode();
    const { getArtifact, updateArtifactContent } = useChat();

    const artifact = pendingArtifactId ? getArtifact(pendingArtifactId) : null;

    // Clear the pending ID after consumption so it doesn't stick if the
    // window is closed and reopened without a new openArtifactWindow call.
    useEffect(() => {
        if (pendingArtifactId) {
            // Don't clear immediately — keep it so the artifact stays visible
            // while the window is open. Clear only when the artifact is deleted.
        }
    }, [pendingArtifactId]);

    return (
        <ArtifactPanel
            isOpen={!!artifact}
            onClose={() => setPendingArtifactId(null)}
            artifact={artifact}
            onUpdateContent={(content) => {
                if (pendingArtifactId) updateArtifactContent(pendingArtifactId, content);
            }}
        />
    );
}
