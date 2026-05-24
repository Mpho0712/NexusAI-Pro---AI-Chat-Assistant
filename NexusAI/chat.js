// ========== Configuration ==========
const GEMINI_API_KEY = 'AIzaSyCoYJa7buyzVmyPdc5LSY-_sb_eP_eTQI0';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ========== DOM Elements ==========
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const menuToggle = document.getElementById('menuToggle');
const newChatBtn = document.getElementById('newChatBtn');
const clearChatsBtn = document.getElementById('clearChatsBtn');
const chatHistory = document.getElementById('chatHistory');
const messagesContainer = document.getElementById('messagesContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatContainer = document.getElementById('chatContainer');
const suggestionCards = document.querySelectorAll('.suggestion-card');
const particlesBg = document.getElementById('particlesBg');

// ========== State ==========
let conversations = JSON.parse(localStorage.getItem('nexusai_conversations')) || {};
let currentChatId = localStorage.getItem('nexusai_current_chat') || null;
let isProcessing = false;
let requestTimestamps = [];
const MAX_REQUESTS = 10; // Reduced to be safer
const COOLDOWN = 6000; // 6 seconds between requests

// ========== Particle System ==========
function createParticles() {
    if (!particlesBg) return;
    const colors = ['#00f0ff', '#7b2cbf', '#1e4b6e', '#00c4d6'];
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.width = Math.random() * 3 + 1 + 'px';
        particle.style.height = particle.style.width;
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDuration = Math.random() * 20 + 10 + 's';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particlesBg.appendChild(particle);
    }
}

// ========== Rate Limiter with Better Feedback ==========
async function checkRateLimit() {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(ts => now - ts < 70000); // 70 second window
    
    if (requestTimestamps.length >= MAX_REQUESTS) {
        const oldestRequest = requestTimestamps[0];
        const waitTime = 70000 - (now - oldestRequest) + 3000;
        const waitSeconds = Math.round(waitTime / 1000);
        
        // Show countdown
        const waitDiv = document.createElement('div');
        waitDiv.className = 'message ai';
        waitDiv.id = 'waitingMsg';
        waitDiv.innerHTML = `
            <div class="message-avatar"><i class="fa-solid fa-hourglass-half"></i></div>
            <div class="message-content" style="text-align:center; color:#f59e0b;">
                <strong>⏳ Rate Limit Reached</strong><br>
                <small>Free tier: ${MAX_REQUESTS} requests per minute</small><br>
                <small>Waiting <span id="countdownTimer">${waitSeconds}</span> seconds...</small>
            </div>
        `;
        messagesContainer.appendChild(waitDiv);
        scrollToBottom();
        
        // Update countdown
        const timerEl = document.getElementById('countdownTimer');
        let remaining = waitSeconds;
        const interval = setInterval(() => {
            remaining--;
            if (timerEl) timerEl.textContent = remaining;
            if (remaining <= 0) clearInterval(interval);
        }, 1000);
        
        await new Promise(r => setTimeout(r, waitTime));
        clearInterval(interval);
        
        const msg = document.getElementById('waitingMsg');
        if (msg) msg.remove();
        
        requestTimestamps = [];
    }
    
    // Minimum cooldown
    if (requestTimestamps.length > 0) {
        const lastRequest = requestTimestamps[requestTimestamps.length - 1];
        const timeSince = now - lastRequest;
        if (timeSince < COOLDOWN) {
            await new Promise(r => setTimeout(r, COOLDOWN - timeSince));
        }
    }
    
    requestTimestamps.push(Date.now());
}

// ========== Initialize ==========
function initialize() {
    createParticles();
    loadChatHistory();
    if (currentChatId && conversations[currentChatId]) {
        loadConversation(currentChatId);
    } else {
        createNewChat();
    }
    setupEventListeners();
}

function setupEventListeners() {
    menuToggle.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
    newChatBtn.addEventListener('click', createNewChat);
    clearChatsBtn.addEventListener('click', clearAllChats);
    sendBtn.addEventListener('click', handleSendMessage);
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    
    messageInput.addEventListener('input', autoResizeTextarea);
    
    suggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            messageInput.value = card.dataset.prompt;
            handleSendMessage();
        });
    });
}

function toggleSidebar() { sidebar.classList.toggle('open'); sidebarOverlay.classList.toggle('active'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); }

// ========== Chat Management ==========
function createNewChat() {
    const chatId = 'chat_' + Date.now();
    conversations[chatId] = { id: chatId, title: 'New Conversation', messages: [], createdAt: new Date().toISOString() };
    currentChatId = chatId;
    saveState();
    loadConversation(chatId);
    loadChatHistory();
    closeSidebar();
}

function loadConversation(chatId) {
    currentChatId = chatId;
    const conversation = conversations[chatId];
    if (!conversation) { createNewChat(); return; }
    messagesContainer.innerHTML = '';
    
    if (conversation.messages.length === 0) {
        welcomeScreen.style.display = 'flex';
        messagesContainer.style.display = 'none';
    } else {
        welcomeScreen.style.display = 'none';
        messagesContainer.style.display = 'flex';
        conversation.messages.forEach(msg => appendMessage(msg.role, msg.content, false));
    }
    
    updateHistoryActiveState();
    scrollToBottom();
    saveState();
}

function updateHistoryActiveState() {
    document.querySelectorAll('.chat-history-item').forEach(item => {
        item.classList.toggle('active', item.dataset.chatId === currentChatId);
    });
}

function loadChatHistory() {
    chatHistory.innerHTML = '';
    const sorted = Object.values(conversations).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    sorted.forEach(chat => chatHistory.appendChild(createHistoryItem(chat)));
    updateHistoryActiveState();
}

function createHistoryItem(chat) {
    const div = document.createElement('div');
    div.className = 'chat-history-item';
    div.dataset.chatId = chat.id;
    div.innerHTML = `
        <i class="fa-solid fa-message"></i>
        <span class="history-item-text">${escapeHtml(chat.title)}</span>
        <button class="delete-chat-btn"><i class="fa-solid fa-xmark"></i></button>
    `;
    
    div.addEventListener('click', (e) => {
        if (!e.target.closest('.delete-chat-btn')) { loadConversation(chat.id); closeSidebar(); }
    });
    div.querySelector('.delete-chat-btn').addEventListener('click', (e) => {
        e.stopPropagation(); deleteConversation(chat.id);
    });
    return div;
}

function deleteConversation(chatId) {
    delete conversations[chatId];
    if (currentChatId === chatId) {
        const remaining = Object.keys(conversations);
        remaining.length > 0 ? loadConversation(remaining[0]) : createNewChat();
    }
    saveState(); loadChatHistory();
}

function clearAllChats() {
    if (!Object.keys(conversations).length) return;
    if (confirm('Delete all conversations?')) {
        conversations = {}; currentChatId = null;
        saveState(); createNewChat(); loadChatHistory();
    }
}

// ========== Message Handling ==========
async function handleSendMessage() {
    const message = messageInput.value.trim();
    if (!message || isProcessing) return;
    
    isProcessing = true;
    sendBtn.disabled = true;
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    welcomeScreen.style.display = 'none';
    messagesContainer.style.display = 'flex';
    
    appendMessage('user', message);
    
    if (conversations[currentChatId].messages.length <= 2) {
        conversations[currentChatId].title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        loadChatHistory();
    }
    
    const aiMessageDiv = createAIMessagePlaceholder();
    
    try {
        await checkRateLimit();
        const response = await getGeminiResponse(message);
        await streamResponse(aiMessageDiv, response);
        saveState();
    } catch (error) {
        const contentDiv = aiMessageDiv.querySelector('.message-content');
        const errorMsg = error.message;
        
        if (errorMsg.includes('Rate limit') || errorMsg.includes('quota')) {
            contentDiv.innerHTML = formatMessage(
                '**⏳ Rate Limit Exceeded**\n\n' +
                'Your API key has reached its free tier limit.\n\n' +
                '**Solutions:**\n' +
                '• Wait 2-3 minutes for quota to reset\n' +
                '• Get a new API key at: [Google AI Studio](https://aistudio.google.com/apikey)\n' +
                '• The free tier allows 20 requests/minute\n' +
                '• You may have used all 1,500 daily requests\n\n' +
                'Please try again later or use a different API key.'
            );
        } else if (errorMsg.includes('503')) {
            contentDiv.innerHTML = formatMessage(
                '**🔧 Google AI Servers Busy**\n\n' +
                'The Gemini API is temporarily overloaded.\n' +
                'This usually resolves within 1-2 minutes.\n\n' +
                'Please try again shortly.'
            );
        } else {
            contentDiv.innerHTML = formatMessage('**Error:** ' + errorMsg + '\n\nPlease try again.');
        }
        
        console.error('Error:', errorMsg);
        saveState();
    }
    
    isProcessing = false;
    sendBtn.disabled = false;
    scrollToBottom();
    messageInput.focus();
}

function createAIMessagePlaceholder() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';
    messageDiv.innerHTML = `
        <div class="message-avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="message-content">
            <span class="streaming-cursor"></span>
            <div class="message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
    `;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

async function streamResponse(messageDiv, fullText) {
    const contentDiv = messageDiv.querySelector('.message-content');
    const timestamp = contentDiv.querySelector('.message-timestamp');
    
    if (fullText.length > 2000) {
        const chunks = fullText.match(/.{1,200}/g) || [fullText];
        let displayed = '';
        for (const chunk of chunks) {
            displayed += chunk;
            contentDiv.innerHTML = formatMessage(displayed) + '<span class="streaming-cursor"></span>';
            contentDiv.appendChild(timestamp);
            scrollToBottom();
            await new Promise(r => setTimeout(r, 20));
        }
    } else {
        const words = fullText.split(' ');
        let displayed = '';
        for (let i = 0; i < words.length; i++) {
            displayed += (i > 0 ? ' ' : '') + words[i];
            contentDiv.innerHTML = formatMessage(displayed) + '<span class="streaming-cursor"></span>';
            contentDiv.appendChild(timestamp);
            scrollToBottom();
            await new Promise(r => setTimeout(r, 10 + Math.random() * 15));
        }
    }
    
    contentDiv.innerHTML = formatMessage(fullText);
    contentDiv.appendChild(timestamp);
    
    conversations[currentChatId].messages.push({ role: 'ai', content: fullText, timestamp: new Date().toISOString() });
}

function appendMessage(role, content, save = true) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="message-avatar"><i class="fa-solid ${role === 'user' ? 'fa-user' : 'fa-robot'}"></i></div>
        <div class="message-content">${formatMessage(content)}<div class="message-timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div>
    `;
    messagesContainer.appendChild(div);
    if (save) { conversations[currentChatId].messages.push({ role, content, timestamp: new Date().toISOString() }); saveState(); }
    setTimeout(() => scrollToBottom(), 100);
}

function formatMessage(content) {
    return content
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== Gemini API ==========
async function getGeminiResponse(message) {
    const recentMessages = conversations[currentChatId].messages.slice(-2);
    const context = recentMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content.substring(0, 300) }]
    }));
    
    context.unshift({
        role: 'user',
        parts: [{ text: 'Be direct and complete. Focus on the user request.' }]
    });
    context.unshift({
        role: 'model', 
        parts: [{ text: 'Got it.' }]
    });
    
    context.push({ role: 'user', parts: [{ text: message }] });
    
    const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: context,
            generationConfig: { 
                temperature: 0.7, 
                topK: 40, 
                topP: 0.95, 
                maxOutputTokens: 65536
            }
        })
    });
    
    if (response.status === 429) {
        throw new Error('Rate limit exceeded. Your free API quota is used up.');
    }
    
    if (response.status === 503) {
        throw new Error('Google AI servers are busy (503). Try again in a minute.');
    }
    
    if (!response.ok) {
        throw new Error(`API Error ${response.status}`);
    }
    
    const data = await response.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
    }
    
    throw new Error('No response from AI');
}

// ========== Utilities ==========
function scrollToBottom() {
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
}

function saveState() {
    localStorage.setItem('nexusai_conversations', JSON.stringify(conversations));
    localStorage.setItem('nexusai_current_chat', currentChatId);
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); createNewChat(); }
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); toggleSidebar(); }
    if (e.key === 'Escape') closeSidebar();
});

document.addEventListener('DOMContentLoaded', initialize);