/* eslint-disable react/prop-types */
export const notesMarkdownListComponents = {
    ol: ({ children, start }) => (
        <ol
            start={start}
            className="list-decimal pl-5 mb-4 space-y-1.5 text-sm text-[var(--text-secondary)]"
        >
            {children}
        </ol>
    ),
};
