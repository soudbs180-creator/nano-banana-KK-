import { getStore } from "@netlify/blobs";

interface ApiKeyEntry {
    key: string;
    status: 'valid' | 'invalid' | 'pending' | 'unknown';
}

interface KeysData {
    keys: ApiKeyEntry[];
    updatedAt: number;
}

// Cookie name for client identification
const CLIENT_ID_COOKIE = 'kk-client-id';

/**
 * Parse clientId from cookies
 */
function getClientIdFromCookies(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const cookie of cookies) {
        const [name, value] = cookie.split('=');
        if (name === CLIENT_ID_COOKIE && value) {
            return value;
        }
    }
    return null;
}

/**
 * Generate a random client ID
 */
function generateClientId(): string {
    return 'cid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
}

export default async (request: Request) => {
    // CORS headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cookie",
        "Access-Control-Allow-Credentials": "true",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Get or create client ID
    const cookieHeader = request.headers.get('cookie');
    let clientId = getClientIdFromCookies(cookieHeader);
    let isNewClient = false;

    if (!clientId) {
        clientId = generateClientId();
        isNewClient = true;
    }

    // Initialize Netlify Blobs store
    const store = getStore("api-keys");

    try {
        // GET: Return key status (without exposing actual keys)
        if (request.method === "GET") {
            const data = await store.get(clientId, { type: 'json' }) as KeysData | null;

            // Build response headers
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                ...corsHeaders,
            };

            // Set cookie if new client
            if (isNewClient) {
                // Cookie expires in 1 year
                headers["Set-Cookie"] = `${CLIENT_ID_COOKIE}=${clientId}; Path=/; Max-Age=31536000; SameSite=Lax`;
            }

            if (!data || !data.keys) {
                return new Response(JSON.stringify({
                    hasKeys: false,
                    slots: [
                        { slot: 1, status: 'empty' },
                        { slot: 2, status: 'empty' },
                        { slot: 3, status: 'empty' },
                        { slot: 4, status: 'empty' },
                    ],
                    clientId: clientId, // For debugging, can remove in production
                }), { status: 200, headers });
            }

            // Return status only, NOT the actual keys
            const slots = data.keys.map((entry, index) => ({
                slot: index + 1,
                status: entry.key ? entry.status : 'empty',
                hasKey: !!entry.key,
            }));

            return new Response(JSON.stringify({
                hasKeys: data.keys.some(k => k.key),
                slots,
            }), { status: 200, headers });
        }

        // POST: Save keys and validate them
        if (request.method === "POST") {
            const body = await request.json() as { keys: string[] };

            if (!body.keys || !Array.isArray(body.keys) || body.keys.length !== 4) {
                return new Response(JSON.stringify({ error: "Must provide exactly 4 keys (can be empty strings)" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }

            // Validate each key and build entries
            const keyEntries: ApiKeyEntry[] = await Promise.all(
                body.keys.map(async (key): Promise<ApiKeyEntry> => {
                    const trimmedKey = key.trim();
                    if (!trimmedKey) {
                        return { key: '', status: 'unknown' };
                    }

                    // Validate the key by making a test request
                    try {
                        const testResponse = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`,
                            { method: 'GET' }
                        );

                        if (testResponse.ok) {
                            return { key: trimmedKey, status: 'valid' };
                        } else if (testResponse.status === 400 || testResponse.status === 401 || testResponse.status === 403) {
                            return { key: trimmedKey, status: 'invalid' };
                        } else {
                            // Other errors (rate limit, etc.) - assume key might be valid
                            return { key: trimmedKey, status: 'unknown' };
                        }
                    } catch (e) {
                        console.error('Key validation error:', e);
                        // Network error - can't determine validity
                        return { key: trimmedKey, status: 'unknown' };
                    }
                })
            );

            // Store in Netlify Blobs
            const keysData: KeysData = {
                keys: keyEntries,
                updatedAt: Date.now(),
            };

            await store.setJSON(clientId, keysData);

            // Build response headers
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                ...corsHeaders,
            };

            if (isNewClient) {
                headers["Set-Cookie"] = `${CLIENT_ID_COOKIE}=${clientId}; Path=/; Max-Age=31536000; SameSite=Lax`;
            }

            // Return validation results
            const slots = keyEntries.map((entry, index) => ({
                slot: index + 1,
                status: entry.key ? entry.status : 'empty',
                hasKey: !!entry.key,
            }));

            return new Response(JSON.stringify({
                success: true,
                message: "Keys saved and validated",
                hasKeys: keyEntries.some(k => k.key),
                slots,
            }), { status: 200, headers });
        }

        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });

    } catch (error: any) {
        console.error("Keys API error:", error);
        return new Response(JSON.stringify({ error: error.message || "Internal error" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }
};

export const config = {
    path: "/api/keys",
};
