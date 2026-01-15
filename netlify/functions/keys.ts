/**
 * API Keys validation endpoint
 * This endpoint validates API keys by testing them against the Gemini API.
 * Keys are NOT stored on the server - they are stored in the client's localStorage.
 */

interface ValidateRequest {
    keys: string[];
}

interface KeyResult {
    slot: number;
    status: 'valid' | 'invalid' | 'empty' | 'unknown';
    hasKey: boolean;
}

export default async (request: Request) => {
    // CORS headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    // GET: Just return a status indicating keys should be stored locally
    if (request.method === "GET") {
        return new Response(JSON.stringify({
            hasKeys: false,
            slots: [
                { slot: 1, status: 'empty', hasKey: false },
                { slot: 2, status: 'empty', hasKey: false },
                { slot: 3, status: 'empty', hasKey: false },
                { slot: 4, status: 'empty', hasKey: false },
            ],
            message: "Keys are stored locally in your browser"
        }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    // POST: Validate keys without storing them
    if (request.method === "POST") {
        try {
            const body = await request.json() as ValidateRequest;

            if (!body.keys || !Array.isArray(body.keys) || body.keys.length !== 4) {
                return new Response(JSON.stringify({ error: "Must provide exactly 4 keys (can be empty strings)" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }

            // Validate each key
            const results: KeyResult[] = await Promise.all(
                body.keys.map(async (key, index): Promise<KeyResult> => {
                    const trimmedKey = key.trim();
                    if (!trimmedKey) {
                        return { slot: index + 1, status: 'empty', hasKey: false };
                    }

                    // Validate the key by making a test request to Gemini
                    try {
                        const testResponse = await fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`,
                            { method: 'GET' }
                        );

                        if (testResponse.ok) {
                            return { slot: index + 1, status: 'valid', hasKey: true };
                        } else if (testResponse.status === 400 || testResponse.status === 401 || testResponse.status === 403) {
                            return { slot: index + 1, status: 'invalid', hasKey: true };
                        } else {
                            return { slot: index + 1, status: 'unknown', hasKey: true };
                        }
                    } catch (e) {
                        console.error('Key validation error:', e);
                        return { slot: index + 1, status: 'unknown', hasKey: true };
                    }
                })
            );

            return new Response(JSON.stringify({
                success: true,
                message: "Keys validated. Store them locally in your browser.",
                hasKeys: results.some(k => k.hasKey),
                slots: results,
            }), {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });

        } catch (error: any) {
            console.error("Keys validation error:", error);
            return new Response(JSON.stringify({ error: error.message || "Validation failed" }), {
                status: 500,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
    });
};

export const config = {
    path: "/api/keys",
};
