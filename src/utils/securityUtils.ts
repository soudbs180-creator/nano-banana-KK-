export const maskApiKey = (key: string | undefined | null): string => {
    if (!key) return '';
    const value = key.trim();
    if (value.length <= 8) return value;
    const head = value.slice(0, 4);
    const tail = value.slice(-4);
    return `${head}...${tail}`;
};
