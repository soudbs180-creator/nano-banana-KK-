/**
 * Generates a deterministic color (bg and border) for a given tag name.
 * Returns Tailwind classes or style objects.
 */
export const generateTagColor = (tagName: string) => {
    let hash = 0;
    for (let i = 0; i < tagName.length; i++) {
        hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Pre-defined color palettes (Background, Text/Border) suited for dark mode
    const palettes = [
        { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30' },
        { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/30' },
        { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/30' },
        { bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/30' },
        { bg: 'bg-lime-500/20', text: 'text-lime-300', border: 'border-lime-500/30' },
        { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/30' },
        { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/30' },
        { bg: 'bg-teal-500/20', text: 'text-teal-300', border: 'border-teal-500/30' },
        { bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-500/30' },
        { bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-500/30' },
        { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/30' },
        { bg: 'bg-indigo-500/20', text: 'text-indigo-300', border: 'border-indigo-500/30' },
        { bg: 'bg-violet-500/20', text: 'text-violet-300', border: 'border-violet-500/30' },
        { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/30' },
        { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-300', border: 'border-fuchsia-500/30' },
        { bg: 'bg-pink-500/20', text: 'text-pink-300', border: 'border-pink-500/30' },
        { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/30' },
    ];

    const index = Math.abs(hash) % palettes.length;
    return palettes[index];
};
