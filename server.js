import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Resolve directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load default .env
dotenv.config();

// Load separate secret files if present
const geminiEnvPath = path.join(__dirname, '.env.gemini');
if (fs.existsSync(geminiEnvPath)) {
  dotenv.config({ path: geminiEnvPath, override: true });
}

const supabaseEnvPath = path.join(__dirname, '.env.supabase');
if (fs.existsSync(supabaseEnvPath)) {
  dotenv.config({ path: supabaseEnvPath, override: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
// Serve frontend static files
const frontendDir = path.join(__dirname, 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

// Health check endpoints for Render uptime monitoring
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

// Global state for clients
let geminiApiKey = process.env.GEMINI_API_KEY || '';
let supabaseUrl = process.env.SUPABASE_URL || '';
let supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

let genAiClient = null;
let supabaseClient = null;

// Initialize clients
function initClients() {
  if (geminiApiKey) {
    try {
      genAiClient = new GoogleGenAI({ apiKey: geminiApiKey });
      console.log('✅ Google Gemini SDK initialized');
    } catch (err) {
      console.error('❌ Failed to initialize Gemini SDK:', err.message);
      genAiClient = null;
    }
  } else {
    genAiClient = null;
    console.log('⚠️ GEMINI_API_KEY is not set. Awaiting key in Settings or .env');
  }

  if (supabaseUrl && supabaseAnonKey) {
    try {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
      console.log('✅ Supabase client initialized');
    } catch (err) {
      console.error('❌ Failed to initialize Supabase client:', err.message);
      supabaseClient = null;
    }
  } else {
    supabaseClient = null;
    console.log('⚠️ Supabase credentials not fully set. Running in Local Memory Fallback Mode');
  }
}

initClients();

// =====================================================================
// Local In-Memory Storage Fallback (When Supabase is not yet connected)
// =====================================================================
class MemoryStore {
  constructor() {
    this.conversations = [
      {
        id: 'welcome-session',
        title: 'Getting Started with Gemini & Supabase',
        model: 'gemini-3.8-flash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    this.messages = [
      {
        id: 'welcome-msg-1',
        conversation_id: 'welcome-session',
        role: 'assistant',
        content: `👋 **Welcome to your Gemini & Supabase AI Chatbot!**\n\nThis application is connected to **Google Gemini** for cutting-edge AI responses and **Supabase** for persistent, cloud-stored conversation history.\n\n### Quick Start Guide:\n1. 🔑 **Gemini API Key:** If not set in \`.env\`, click the **Settings (⚙️)** button at the top right to paste your key.\n2. 🗄️ **Supabase Database:** Paste your project URL and Anon key in Settings, then run the provided SQL in the **Database Schema** modal to create the tables.\n3. 🚀 Try asking a question below to begin!`,
        created_at: new Date().toISOString()
      }
    ];
  }

  async getConversations() {
    return [...this.conversations].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  async createConversation(id, title = 'New Chat', model = 'gemini-3.8-flash') {
    const newConv = {
      id: id || crypto.randomUUID(),
      title,
      model,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.conversations.unshift(newConv);
    return newConv;
  }

  async updateConversationTitle(id, title) {
    const conv = this.conversations.find((c) => c.id === id);
    if (conv) {
      conv.title = title;
      conv.updated_at = new Date().toISOString();
    }
    return conv;
  }

  async touchConversation(id) {
    const conv = this.conversations.find((c) => c.id === id);
    if (conv) {
      conv.updated_at = new Date().toISOString();
    }
  }

  async deleteConversation(id) {
    this.conversations = this.conversations.filter((c) => c.id !== id);
    this.messages = this.messages.filter((m) => m.conversation_id !== id);
    return true;
  }

  async getMessages(conversationId) {
    return this.messages
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  async addMessage(conversationId, role, content) {
    const newMsg = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role,
      content,
      created_at: new Date().toISOString()
    };
    this.messages.push(newMsg);
    await this.touchConversation(conversationId);
    return newMsg;
  }
}

const memoryStore = new MemoryStore();

// =====================================================================
// Storage abstraction: Uses Supabase if available & healthy, else fallback
// =====================================================================
async function getStorage() {
  if (supabaseClient) {
    return {
      isSupabase: true,
      async getConversations() {
        const { data, error } = await supabaseClient
          .from('conversations')
          .select('*')
          .order('updated_at', { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async createConversation(id, title = 'New Chat', model = 'gemini-3.8-flash') {
        const payload = { title, model };
        if (id) payload.id = id;
        const { data, error } = await supabaseClient
          .from('conversations')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      async updateConversationTitle(id, title) {
        const { data, error } = await supabaseClient
          .from('conversations')
          .update({ title, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      async deleteConversation(id) {
        const { error } = await supabaseClient
          .from('conversations')
          .delete()
          .eq('id', id);
        if (error) throw error;
        return true;
      },
      async getMessages(conversationId) {
        const { data, error } = await supabaseClient
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
      },
      async addMessage(conversationId, role, content) {
        const { data, error } = await supabaseClient
          .from('messages')
          .insert({ conversation_id: conversationId, role, content })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    };
  }

  return {
    isSupabase: false,
    getConversations: () => memoryStore.getConversations(),
    createConversation: (id, title, model) => memoryStore.createConversation(id, title, model),
    updateConversationTitle: (id, title) => memoryStore.updateConversationTitle(id, title),
    deleteConversation: (id) => memoryStore.deleteConversation(id),
    getMessages: (conversationId) => memoryStore.getMessages(conversationId),
    addMessage: (conversationId, role, content) => memoryStore.addMessage(conversationId, role, content)
  };
}

// =====================================================================
// API ROUTES
// =====================================================================

// Status & Configuration
app.get('/api/status', (req, res) => {
  res.json({
    hasGemini: Boolean(geminiApiKey),
    geminiKeyMasked: geminiApiKey ? `${geminiApiKey.slice(0, 4)}...${geminiApiKey.slice(-4)}` : null,
    hasSupabase: Boolean(supabaseUrl && supabaseAnonKey),
    supabaseUrl: supabaseUrl ? supabaseUrl.replace(/^(https?:\/\/[^.]+).*/, '$1.supabase.co') : null,
    storageMode: supabaseClient ? 'Supabase Database' : 'Local Memory (Fallback)'
  });
});

// Update Settings (.env & runtime)
app.post('/api/settings', (req, res) => {
  const { apiKey, url, anonKey } = req.body;

  if (typeof apiKey === 'string' && apiKey.trim()) {
    geminiApiKey = apiKey.trim();
  }
  if (typeof url === 'string') {
    supabaseUrl = url.trim();
  }
  if (typeof anonKey === 'string') {
    supabaseAnonKey = anonKey.trim();
  }

  initClients();

  // Persist to separate secret files and main .env
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    const setEnvVar = (content, key, val) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${val}`);
      }
      return `${content}\n${key}=${val}`.trim();
    };

    let updated = envContent;
    if (geminiApiKey) {
      updated = setEnvVar(updated, 'GEMINI_API_KEY', geminiApiKey);
      fs.writeFileSync(path.join(__dirname, '.env.gemini'), `# Google Gemini API Secrets\nGEMINI_API_KEY=${geminiApiKey}\n`, 'utf8');
    }
    if (supabaseUrl || supabaseAnonKey) {
      if (supabaseUrl) updated = setEnvVar(updated, 'SUPABASE_URL', supabaseUrl);
      if (supabaseAnonKey) updated = setEnvVar(updated, 'SUPABASE_ANON_KEY', supabaseAnonKey);
      fs.writeFileSync(path.join(__dirname, '.env.supabase'), `# Supabase Database Secrets\nSUPABASE_URL=${supabaseUrl}\nSUPABASE_ANON_KEY=${supabaseAnonKey}\n`, 'utf8');
    }

    fs.writeFileSync(envPath, updated, 'utf8');
  } catch (err) {
    console.warn('Could not write secret files:', err.message);
  }

  res.json({
    success: true,
    hasGemini: Boolean(geminiApiKey),
    hasSupabase: Boolean(supabaseUrl && supabaseAnonKey),
    storageMode: supabaseClient ? 'Supabase Database' : 'Local Memory (Fallback)'
  });
});

// Test Gemini connection
app.post('/api/test/gemini', async (req, res) => {
  const testKey = req.body.apiKey || geminiApiKey;
  if (!testKey) {
    return res.status(400).json({ success: false, error: 'No Gemini API key provided.' });
  }

  try {
    const testAi = new GoogleGenAI({ apiKey: testKey });
    const response = await testAi.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Respond with exactly one word: "OK"'
    });
    return res.json({ success: true, text: response.text });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message || 'Gemini validation failed' });
  }
});

// Test Supabase connection
app.post('/api/test/supabase', async (req, res) => {
  const url = req.body.url || supabaseUrl;
  const anonKey = req.body.anonKey || supabaseAnonKey;

  if (!url || !anonKey) {
    return res.status(400).json({ success: false, error: 'Supabase URL and Anon Key are required.' });
  }

  try {
    const client = createClient(url, anonKey);
    // Query conversations table to check if table exists and credentials work
    const { data, error } = await client.from('conversations').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        return res.json({
          success: true,
          schemaWarning: true,
          message: 'Connected to Supabase, but "conversations" table is not found yet. Please run the SQL schema script in Supabase SQL editor!'
        });
      }
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.json({ success: true, message: 'Successfully connected to Supabase!', rowCount: data ? data.length : 0 });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// List Conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const storage = await getStorage();
    const conversations = await storage.getConversations();
    res.json({ conversations, storageMode: storage.isSupabase ? 'supabase' : 'memory' });
  } catch (err) {
    console.error('Error fetching conversations:', err);
    // Graceful fallback to memory on error
    const conversations = await memoryStore.getConversations();
    res.json({ conversations, storageMode: 'memory', fallbackNotice: err.message });
  }
});

// Create Conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const { title = 'New Chat', model = 'gemini-2.5-flash' } = req.body;
    const storage = await getStorage();
    let conversation;
    try {
      conversation = await storage.createConversation(null, title, model);
    } catch (e) {
      conversation = await memoryStore.createConversation(null, title, model);
    }
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename Conversation
app.patch('/api/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const storage = await getStorage();
    try {
      const updated = await storage.updateConversationTitle(id, title);
      res.json(updated);
    } catch (e) {
      const updated = await memoryStore.updateConversationTitle(id, title);
      res.json(updated);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Conversation
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const storage = await getStorage();
    try {
      await storage.deleteConversation(id);
    } catch (e) {
      await memoryStore.deleteConversation(id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Messages for Conversation
app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const storage = await getStorage();
    let messages = [];
    try {
      messages = await storage.getMessages(id);
    } catch (e) {
      messages = await memoryStore.getMessages(id);
    }
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send Chat Message & Get Gemini Response (Streamed via SSE)
app.post('/api/chat', async (req, res) => {
  const {
    conversationId,
    message,
    model = 'gemini-3.8-flash',
    systemInstruction = 'You are a smart, concise, and helpful AI assistant.',
    temperature = 0.7
  } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  if (!geminiApiKey || !genAiClient) {
    return res.status(400).json({
      error: 'Gemini API Key is not configured. Please open Settings (⚙️) to enter your API key.'
    });
  }

  // Setup Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let activeConvId = conversationId;
  const storage = await getStorage();

  try {
    // If no conversationId provided, create a new conversation
    if (!activeConvId) {
      // First 35 chars of user message as initial title
      const initialTitle = message.trim().slice(0, 35) + (message.length > 35 ? '...' : '');
      let newConv;
      try {
        newConv = await storage.createConversation(null, initialTitle, model);
      } catch (e) {
        newConv = await memoryStore.createConversation(null, initialTitle, model);
      }
      activeConvId = newConv.id;
      sendEvent('conversation_created', newConv);
    }

    // 1. Save user message to database
    let userMsgRecord;
    try {
      userMsgRecord = await storage.addMessage(activeConvId, 'user', message);
    } catch (e) {
      userMsgRecord = await memoryStore.addMessage(activeConvId, 'user', message);
    }
    sendEvent('user_message_saved', userMsgRecord);

    // 2. Fetch past conversation messages to build chat history context
    let history = [];
    try {
      history = await storage.getMessages(activeConvId);
    } catch (e) {
      history = await memoryStore.getMessages(activeConvId);
    }

    // Build contents array for Gemini:
    // Format: [{ role: 'user' | 'model', parts: [{ text: '...' }] }]
    // Keep last 15 messages for token efficiency and relevant context
    const recentHistory = history.slice(-15);
    const contents = recentHistory.map((m) => {
      const role = m.role === 'assistant' ? 'model' : m.role === 'model' ? 'model' : 'user';
      return {
        role,
        parts: [{ text: m.content }]
      };
    });

    // Make sure the last item in contents is the new user prompt if not already present
    if (contents.length === 0 || contents[contents.length - 1].parts[0].text !== message) {
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });
    }

    // 3. Call Gemini API with streaming
    const config = {
      temperature: Number(temperature) || 0.7
    };
    if (systemInstruction && systemInstruction.trim()) {
      config.systemInstruction = systemInstruction.trim();
    }

    let fullAssistantResponse = '';

    const activeModel = (!model || model === 'gemini-2.5-flash') ? 'gemini-3.8-flash' : model;

    const streamResponse = await genAiClient.models.generateContentStream({
      model: activeModel,
      contents,
      config
    });

    for await (const chunk of streamResponse) {
      const chunkText = chunk.text || '';
      if (chunkText) {
        fullAssistantResponse += chunkText;
        sendEvent('chunk', { text: chunkText });
      }
    }

    // 4. Save assistant response to database
    let assistantMsgRecord;
    try {
      assistantMsgRecord = await storage.addMessage(activeConvId, 'assistant', fullAssistantResponse);
    } catch (e) {
      assistantMsgRecord = await memoryStore.addMessage(activeConvId, 'assistant', fullAssistantResponse);
    }

    // 5. If this was a new conversation with a default title, generate a smart short title
    if (history.length <= 2) {
      try {
        const titlePrompt = `Summarize this chat topic into 3-5 words maximum (no quotes, no punctuation):\nUser: "${message}"\nAssistant: "${fullAssistantResponse.slice(0, 100)}"`;
        const titleGen = await genAiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: titlePrompt
        });
        const smartTitle = titleGen.text?.trim().replace(/^["']|["']$/g, '');
        if (smartTitle) {
          try {
            await storage.updateConversationTitle(activeConvId, smartTitle);
          } catch (e) {
            await memoryStore.updateConversationTitle(activeConvId, smartTitle);
          }
          sendEvent('title_updated', { conversationId: activeConvId, title: smartTitle });
        }
      } catch (err) {
        // Non-critical, ignore
      }
    }

    sendEvent('done', {
      conversationId: activeConvId,
      messageId: assistantMsgRecord.id,
      fullText: fullAssistantResponse
    });
    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    sendEvent('error', {
      error: err.message || 'An error occurred while communicating with Gemini.'
    });
    res.end();
  }
});

// Fallback to index.html for SPA routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/health')) {
    const indexPath = path.join(__dirname, 'frontend', 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  next();
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Gemini & Supabase AI Chatbot Server running!`);
  console.log(`📍 Web App URL: http://localhost:${PORT}`);
  console.log(`⚡ Supabase:   ${supabaseClient ? 'Connected' : 'Offline / Local Mode'}`);
  console.log(`🤖 Gemini:     ${geminiApiKey ? 'Configured' : 'Missing API Key'}`);
  console.log(`======================================================\n`);
});
