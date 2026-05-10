// Simplified FileProcessor for stability
export class FileProcessor {
    /**
     * Main entry point for processing files
     * @param {File} file - The file object from the input
     * @returns {Promise<{content: string, type: string}>}
     */
    static async process(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        const mimeType = file.type;

        if (mimeType.startsWith('image/')) {
            return { content: 'Image file (processed via multimodal input)', type: 'image' };
        }

        // Fallback to basic text reading for all other types for now to prevent crashes
        if (['txt', 'js', 'jsx', 'ts', 'tsx', 'json', 'md', 'html', 'css', 'py', 'cpp', 'c', 'go', 'rs', 'csv'].includes(extension) || mimeType === 'text/plain' || mimeType === 'text/csv') {
            return { content: await this.readText(file), type: 'text' };
        }

        // Binary document extraction is intentionally conservative for now.
        // Keep the attachment in context instead of failing the upload.
        if (['pdf', 'xlsx', 'xls', 'ods', 'doc', 'docx', 'ppt', 'pptx', 'pages', 'numbers', 'key'].includes(extension)) {
            return { 
                content: `[Attached binary file: ${file.name}]\nType: ${mimeType || extension}\nSize: ${file.size} bytes\nAdvanced text extraction is not enabled for this file type yet.`, 
                type: 'text' 
            };
        }

        return {
            content: `[Attached file: ${file.name}]\nType: ${mimeType || extension || 'unknown'}\nSize: ${file.size} bytes\nNo text extraction is available for this file type yet.`,
            type: 'text'
        };
    }

    static async readText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Error reading text file'));
            reader.readAsText(file);
        });
    }
}
