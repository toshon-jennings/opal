import { useEffect } from 'react';

export function useAutoSizeTextarea(textareaRef, value, maxHeight = 200) {
    useEffect(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`;
    }, [maxHeight, textareaRef, value]);
}
