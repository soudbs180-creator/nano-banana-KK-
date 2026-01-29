/**
 * Compute SHA-256 hash of a string (mostly for Base64 image data)
 * This allows us to use content-addressable storage for images,
 * ensuring duplicates share the same storage entry.
 */
export async function calculateImageHash(data: string): Promise<string> {
    // We assume data is a string (base64 or url).
    // If it's a very long base64 string, this might be heavy on main thread,
    // but Native Crypto API is generally fast.
    const msgBuffer = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}
