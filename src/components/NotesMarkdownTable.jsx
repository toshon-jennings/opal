/* eslint-disable react/prop-types */
export const notesMarkdownTableComponents = {
    table: ({ children }) => (
        <div className="my-4 w-full overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-max border-collapse text-left text-sm text-[var(--text-secondary)]">
                {children}
            </table>
        </div>
    ),
    tr: ({ children }) => (
        <tr className="border-b border-[var(--border)] last:border-b-0">
            {children}
        </tr>
    ),
    th: ({ children, style }) => (
        <th
            style={style}
            className="whitespace-nowrap bg-[var(--bg-secondary)] px-3 py-2 font-semibold text-[var(--text-primary)]"
        >
            {children}
        </th>
    ),
    td: ({ children, style }) => (
        <td style={style} className="px-3 py-2 align-top text-[var(--text-secondary)]">
            {children}
        </td>
    ),
};
