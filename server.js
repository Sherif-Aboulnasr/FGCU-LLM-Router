/**
 * FGCU LLM Router — Backend Server
 * Routes requests to different AI providers based on model selection
 */

import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize API clients lazily (only when needed)
let openai = null;
let groq = null;
let genAI = null;

function getOpenAI() {
    if (!openai) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY not configured');
        }
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openai;
}

function getGroq() {
    if (!groq) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not configured');
        }
        groq = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: 'https://api.groq.com/openai/v1'
        });
    }
    return groq;
}

function getGoogleAI() {
    if (!genAI) {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error('GOOGLE_API_KEY not configured');
        }
        genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    }
    return genAI;
}

// Model mapping
const MODEL_CONFIG = {
    'gpt-5.2': {
        provider: 'openai',
        model: 'gpt-5.2-chat-latest'
    },
    'gpt-5.1': {
        provider: 'openai',
        model: 'gpt-5.1-chat-latest'
    },
    'gpt-5': {
        provider: 'openai',
        model: 'gpt-5-chat-latest'
    },
    'gpt-4.1': {
        provider: 'openai',
        model: 'gpt-4.1'
    },
    'gpt-4o': {
        provider: 'openai',
        model: 'gpt-4o'
    },
    'gemini-2.5-flash': {
        provider: 'google',
        model: 'gemini-2.5-flash'
    },
    // Groq models (fast inference)
    'llama-3.3-70b': {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile'
    },
    'llama-4-maverick': {
        provider: 'groq',
        model: 'meta-llama/llama-4-maverick-17b-128e-instruct'
    },
    'llama-4-scout': {
        provider: 'groq',
        model: 'meta-llama/llama-4-scout-17b-16e-instruct'
    },
    'qwen3-32b': {
        provider: 'groq',
        model: 'qwen/qwen3-32b'
    },
    'kimi-k2': {
        provider: 'groq',
        model: 'moonshotai/kimi-k2-instruct'
    }
};

// System prompt for concise responses
const SYSTEM_PROMPT = "Be concise and direct in your responses. Avoid unnecessary filler words, repetition, or overly verbose explanations. Get straight to the point while still being helpful and accurate.";

// Generate with OpenAI
async function generateWithOpenAI(prompt, modelId, res) {
    const stream = await getOpenAI().chat.completions.create({
        model: modelId,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
        ],
        stream: true
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
            res.write(content);
        }
    }
    res.end();
}

// Generate with Groq (OpenAI-compatible API)
async function generateWithGroq(prompt, modelId, res) {
    const stream = await getGroq().chat.completions.create({
        model: modelId,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
        ],
        stream: true
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
            res.write(content);
        }
    }
    res.end();
}

// Generate with Google
async function generateWithGoogle(prompt, modelId, res) {
    const model = getGoogleAI().getGenerativeModel({
        model: modelId,
        systemInstruction: SYSTEM_PROMPT
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
            res.write(text);
        }
    }
    res.end();
}

// API endpoint
app.post('/api/generate', async (req, res) => {
    const { prompt, model } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    const config = MODEL_CONFIG[model];
    if (!config) {
        return res.status(400).json({ error: 'Invalid model selection' });
    }

    try {
        switch (config.provider) {
            case 'openai':
                await generateWithOpenAI(prompt, config.model, res);
                break;
            case 'groq':
                await generateWithGroq(prompt, config.model, res);
                break;
            case 'google':
                await generateWithGoogle(prompt, config.model, res);
                break;
            default:
                res.status(400).json({ error: 'Unknown provider' });
        }
    } catch (error) {
        console.error(`Error with ${config.provider}:`, error);

        // If headers haven't been sent yet, send error response
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            // If streaming has started, end the response
            res.end(`\n\nError: ${error.message}`);
        }
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

// Start server (only in non-Vercel environment)
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`
╭─────────────────────────────────────╮
│                                     │
│   FGCU LLM Router                   │
│   Running on http://localhost:${PORT}  │
│                                     │
╰─────────────────────────────────────╯
        `);
    });
}

// Export for Vercel
export default app;
