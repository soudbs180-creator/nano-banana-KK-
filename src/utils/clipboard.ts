export async function writeTextToClipboard(text: string): Promise<void> {
  const value = String(text ?? '');

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard API unavailable');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('execCommand copy failed');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
