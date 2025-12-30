import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';

// --- CONFIGURATION ---
const envLocalPath = path.resolve(__dirname, '../.env.local');
const envDefaultPath = path.resolve(__dirname, '../.env');
let envPath = fs.existsSync(envLocalPath) ? envLocalPath : envDefaultPath;

console.log(`\n🔍 Loading Environment from: ${envPath}`);
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_KEY = process.env.VITE_GOOGLE_API_KEY; 

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
  console.error("❌ CRITICAL ERROR: Missing API Keys.");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json()); 

const PORT = 3001;
const MODEL_NAME = 'gemini-2.5-flash'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 1. CHAT ROUTE (FIXED) ---
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Invalid or empty message' });
    }
    
    const cleanHistory = (Array.isArray(history) ? history : [])
      .map((msg: any) => {
        if (!Array.isArray(msg.parts)) return null;
        const parts = msg.parts
          .map((p: any) => String(p.text || '').trim())
          .filter((t: string) => t.length > 0)
          .map((t: string) => ({ text: t }));
        if (!parts.length) return null;
        return {
          role: msg.role === 'user' ? 'user' : 'model',
          parts
        };
      })
      .filter((msg): msg is { role: string; parts: { text: string }[] } => msg !== null);
    
    const client = new GoogleGenAI({ apiKey: GEMINI_KEY });
    
    // Combine history + current message into a single contents array
    const contents = [
      ...cleanHistory,
      { role: 'user', parts: [{ text: message.trim() }] }
    ];
    
    // Use models.generateContentStream instead of chats.create().sendMessageStream()
    const result = await client.models.generateContentStream({
      model: MODEL_NAME,
      contents
    });
    
    // Set proper streaming headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    
    for await (const chunk of result) {
      const chunkText = chunk.text; 
      if (chunkText) {
        res.write(chunkText);
      }
    }
    res.end();

  } catch (error: any) {
    console.error("🔥 Chat API Error:", error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// --- 2. DB ROUTES (Existing) ---
app.get('/api/sessions', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  
  const { data: sessions } = await supabase.from('sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (!sessions) return res.json([]);

  const sessionIds = sessions.map(s => s.id);
  const { data: messages } = await supabase.from('messages').select('*').in('session_id', sessionIds).order('timestamp', { ascending: true });
  
  const fullSessions = sessions.map(s => ({
    ...s,
    createdAt: s.created_at,
    messages: messages?.filter(m => m.session_id === s.id).map(m => ({ ...m, timestamp: m.timestamp })) || []
  }));
  res.json(fullSessions);
});

app.post('/api/sessions', async (req, res) => {
  const { id, userId, title, createdAt } = req.body;
  await supabase.from('sessions').upsert({ id, user_id: userId, title, created_at: createdAt });
  res.json({ success: true });
});

app.post('/api/messages', async (req, res) => {
  const { id, sessionId, role, content, timestamp } = req.body;
  await supabase.from('messages').insert({ id, session_id: sessionId, role, content, timestamp });
  res.json({ success: true });
});

app.delete('/api/sessions/:id', async (req, res) => {
  await supabase.from('sessions').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// --- 3. LIVE ROUTE ---
wss.on('connection', async (ws: WebSocket) => {
  try {
    const client = new GoogleGenAI({ apiKey: GEMINI_KEY });
    const session = await client.live.connect({
      model: MODEL_NAME,
      config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
    });
    session.on('message', (msg: any) => ws.send(JSON.stringify(msg)));
    ws.on('message', (data) => { try { session.sendRealtimeInput(JSON.parse(data.toString()).realtimeInput); } catch(e){} });
    ws.on('close', () => session.close());
  } catch (err) { ws.close(); }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Proxy Server running on http://localhost:${PORT}`);
});