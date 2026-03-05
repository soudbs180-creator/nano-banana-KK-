/**
 * 键盘快捷键 Hook
 */

import { useEffect, useCallback } from 'react';

interface ShortcutOptions {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  callback: () => void;
  preventDefault?: boolean;
}

export function useKeyboardShortcut(options: ShortcutOptions) {
  const { key, ctrlKey, metaKey, shiftKey, altKey, callback, preventDefault = true } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const keyMatch = event.key.toLowerCase() === key.toLowerCase();
    const ctrlMatch = ctrlKey === undefined || event.ctrlKey === ctrlKey;
    const metaMatch = metaKey === undefined || event.metaKey === metaKey;
    const shiftMatch = shiftKey === undefined || event.shiftKey === shiftKey;
    const altMatch = altKey === undefined || event.altKey === altKey;

    if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
      if (preventDefault) {
        event.preventDefault();
      }
      callback();
    }
  }, [key, ctrlKey, metaKey, shiftKey, altKey, callback, preventDefault]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
