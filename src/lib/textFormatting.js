export function normalizeAssistantSpacing(text) {
    if (typeof text !== 'string' || text.length === 0) return text;

    return text
        .split(/(```[\s\S]*?```)/g)
        .map(part => {
            if (part.startsWith('```')) return part;
            return part
                .replace(/([.!?]["')\]}]*)(?=[A-Za-z0-9])/g, '$1 ')
                .replace(/[ \t]{2,}/g, ' ');
        })
        .join('');
}
