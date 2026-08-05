export function createVoiceRunGuard() {
    let currentRunId = 0;
    return {
        begin() {
            currentRunId += 1;
            return currentRunId;
        },
        invalidate() {
            currentRunId += 1;
        },
        isCurrent(runId) {
            return runId === currentRunId;
        },
    };
}

export function stopVoiceResources(recorder, stream) {
    if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
    }
    stream?.getTracks().forEach(track => track.stop());
}
