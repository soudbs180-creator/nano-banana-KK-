/**
 * Gemini Chat Service
 * 
 * Provides text-based conversation with Gemini API.
 * Uses keyManager for multi-key rotation.
 */

import { keyManager } from './keyManager';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface ChatSession {
    id: string;
    messages: ChatMessage[];
    createdAt: number;
}

const CHAT_STORAGE_KEY = 'kk_studio_chat_history';

class ChatService {
    private sessions: ChatSession[] = [];
    private currentSessionId: string | null = null;

    constructor() {
        this.loadSessions();
    }

    private loadSessions(): void {
        try {
            const stored = localStorage.getItem(CHAT_STORAGE_KEY);
            if (stored) {
                this.sessions = JSON.parse(stored);
                if (this.sessions.length > 0) {
                    this.currentSessionId = this.sessions[0].id;
                }
            }
        } catch (e) {
            console.warn('[ChatService] Failed to load sessions:', e);
        }
    }

    private saveSessions(): void {
        try {
            // Keep only last 10 sessions
            const toSave = this.sessions.slice(0, 10);
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('[ChatService] Failed to save sessions:', e);
        }
    }

    getCurrentSession(): ChatSession | null {
        if (!this.currentSessionId) {
            this.createNewSession();
        }
        return this.sessions.find(s => s.id === this.currentSessionId) || null;
    }

    createNewSession(): ChatSession {
        const session: ChatSession = {
            id: `session_${Date.now()}`,
            messages: [],
            createdAt: Date.now()
        };
        this.sessions.unshift(session);
        this.currentSessionId = session.id;
        this.saveSessions();
        return session;
    }

    /**
     * Send a message and get a response from Gemini
     */
    async sendMessage(content: string): Promise<string> {
        const session = this.getCurrentSession();
        if (!session) {
            throw new Error('No active session');
        }

        // Add user message
        const userMessage: ChatMessage = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content,
            timestamp: Date.now()
        };
        session.messages.push(userMessage);
        this.saveSessions();

        // Get API key from keyManager
        const keyData = keyManager.getNextKey();
        if (!keyData) {
            throw new Error('请先配置 API Key');
        }

        try {
            // Build conversation history for context
            const history = session.messages
                .slice(-10) // Last 10 messages for context
                .map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }));

            // Call Gemini API
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keyData.key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: history,
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 2048
                        }
                    })
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                keyManager.reportFailure(keyData.id, `HTTP ${response.status}`);
                throw new Error(`API 请求失败: ${response.status}`);
            }

            const data = await response.json();
            keyManager.reportSuccess(keyData.id);

            const assistantContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，无法生成回复。';

            // Add assistant message
            const assistantMessage: ChatMessage = {
                id: `msg_${Date.now()}`,
                role: 'assistant',
                content: assistantContent,
                timestamp: Date.now()
            };
            session.messages.push(assistantMessage);
            this.saveSessions();

            return assistantContent;
        } catch (error: any) {
            console.error('[ChatService] Error:', error);
            keyManager.reportFailure(keyData.id, error.message);
            throw error;
        }
    }

    clearCurrentSession(): void {
        const session = this.getCurrentSession();
        if (session) {
            session.messages = [];
            this.saveSessions();
        }
    }

    getSessions(): ChatSession[] {
        return this.sessions;
    }

    switchSession(sessionId: string): void {
        if (this.sessions.some(s => s.id === sessionId)) {
            this.currentSessionId = sessionId;
        }
    }
}

export const chatService = new ChatService();
export default ChatService;
