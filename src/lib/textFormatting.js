// Matches full URLs (with scheme) and bare domain references like github.com/path or sub.domain.tld
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+|ftp:\/\/[^\s<>"')\]]+|(?<!\w)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|org|net|io|dev|co|app|ai|gov|edu|uk|de|fr|ca|au)\b(?:\/[^\s<>"')\]]*)?/g;

export function normalizeAssistantSpacing(text) {
    if (typeof text !== 'string' || text.length === 0) return text;

    return text
        // Preserve code blocks verbatim.
        .split(/(```[\s\S]*?```)/g)
        .map(part => {
            if (part.startsWith('```')) return part;

            // 1. Stash all URLs and domain references as placeholders so the spacing
            //    regex cannot insert spaces inside them.
            const stash = [];
            const withPlaceholders = part.replace(URL_PATTERN, (match) => {
                stash.push(match);
                return `\x00URL${stash.length - 1}\x00`;
            });

            // 2. Apply spacing heuristic: add a space after sentence-ending punctuation
            //    that is immediately followed by a letter or digit (missing space).
            const spaced = withPlaceholders
                .replace(/([.!?]["')}\]]*)(?=[A-Za-z0-9])/g, '$1 ')
                .replace(/[ \t]{2,}/g, ' ');

            // 3. Restore the stashed URLs/domains.
            return spaced.replace(/\x00URL(\d+)\x00/g, (_, i) => stash[Number(i)]);
        })
        .join('');
}
