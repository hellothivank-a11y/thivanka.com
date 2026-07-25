/**
 * FaceTime Web App Logic
 * Modular, Video-First, with PeerJS & Supabase Presence
 */

// --- Configuration ---
const SUPABASE_URL = 'https://hfkwgumcdgpsqjjwtxik.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jtj7u2jXgqQt1oIC3P-pTg_nsF_foAQ';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Application State ---
const State = {
    username: null,
    peer: null,
    call: null,
    dataConnection: null,
    localStream: null,
    remoteStream: null,
    presenceChannel: null,
    onlineUsers: {},
    isMicMuted: false,
    isCamOff: false,
    isVoiceIsolationOn: false,
    callDurationInterval: null,
    callStartTime: null
};

// --- DOM Elements ---
const DOM = {
    // Screens
    onboardingScreen: document.getElementById('onboarding-screen'),
    dashboardScreen: document.getElementById('dashboard-screen'),
    callScreen: document.getElementById('call-screen'),
    incomingOverlay: document.getElementById('incoming-call-overlay'),
    
    // Inputs & Buttons
    usernameInput: document.getElementById('username-input'),
    loginBtn: document.getElementById('login-btn'),
    usersList: document.getElementById('users-list'),
    myUsernameDisplay: document.getElementById('my-username-display'),
    
    // Video Call
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    pipContainer: document.getElementById('pip-container'),
    callPartnerName: document.getElementById('call-partner-name'),
    callDuration: document.getElementById('call-duration'),
    
    // Controls
    btnIsolation: document.getElementById('btn-voice-isolation'),
    btnMic: document.getElementById('btn-toggle-mic'),
    btnCam: document.getElementById('btn-toggle-cam'),
    btnChat: document.getElementById('btn-toggle-chat'),
    btnEndCall: document.getElementById('btn-end-call'),
    
    // Chat
    chatDrawer: document.getElementById('chat-drawer'),
    btnCloseChat: document.getElementById('btn-close-chat'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    btnSendMsg: document.getElementById('btn-send-msg'),
    
    // Incoming Call
    incomingCallerName: document.getElementById('incoming-caller-name'),
    incomingCallerInitial: document.getElementById('incoming-caller-initial'),
    btnAccept: document.getElementById('btn-accept-call'),
    btnDecline: document.getElementById('btn-decline-call')
};

// --- 1. Initialization & Onboarding ---
DOM.loginBtn.addEventListener('click', handleLogin);
DOM.usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

async function handleLogin() {
    const username = DOM.usernameInput.value.trim();
    if (!username) return alert('Please enter a username.');
    if (username.length > 20) return alert('Username too long.');
    
    State.username = username;
    DOM.myUsernameDisplay.textContent = username;
    
    DOM.onboardingScreen.classList.add('hidden');
    DOM.dashboardScreen.classList.remove('hidden');
    
    initPeer();
    initPresence();
}

// --- 2. PeerJS Setup ---
function initPeer() {
    // Create Peer with username as ID
    State.peer = new Peer(State.username, {
        debug: 2
    });

    State.peer.on('open', (id) => {
        console.log('My peer ID is: ' + id);
    });

    State.peer.on('call', handleIncomingCall);
    
    State.peer.on('connection', (conn) => {
        setupDataConnection(conn);
    });

    State.peer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        if (err.type === 'unavailable-id') {
            alert('Username is already taken. Please refresh and try another.');
        }
    });
}

// --- 3. Supabase Presence (Dashboard) ---
function initPresence() {
    State.presenceChannel = supabase.channel('online-users', {
        config: {
            presence: {
                key: State.username
            }
        }
    });

    State.presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = State.presenceChannel.presenceState();
            renderUsersList(state);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await State.presenceChannel.track({
                    online_at: new Date().toISOString(),
                    username: State.username
                });
            }
        });
}

function renderUsersList(presenceState) {
    DOM.usersList.innerHTML = '';
    
    // Flatten state object
    const users = [];
    for (const id in presenceState) {
        presenceState[id].forEach(userData => {
            if (userData.username !== State.username) {
                users.push(userData.username);
            }
        });
    }

    if (users.length === 0) {
        DOM.usersList.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">No one else is online right now.</p>`;
        return;
    }

    users.forEach(username => {
        const li = document.createElement('li');
        li.className = 'user-card';
        li.innerHTML = `
            <div class="user-card-info">
                <div class="user-avatar">${username.charAt(0).toUpperCase()}</div>
                <div>
                    <div class="user-name">${username}</div>
                    <div class="user-status">
                        <div class="status-indicator"></div> Online
                    </div>
                </div>
            </div>
            <button class="call-btn" onclick="startCall('${username}')" title="Call">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </button>
        `;
        DOM.usersList.appendChild(li);
    });
}

// --- 4. Calling Flow ---
async function startCall(partnerUsername) {
    try {
        await setupLocalMedia();
        
        DOM.callPartnerName.textContent = partnerUsername;
        showCallScreen();
        startCallTimer();
        
        // Initiate Call
        const call = State.peer.call(partnerUsername, State.localStream);
        setupCallEventHandlers(call);
        
        // Initiate Data Connection for Chat
        const conn = State.peer.connect(partnerUsername);
        setupDataConnection(conn);
        
    } catch (err) {
        console.error('Failed to start call', err);
        alert('Could not access camera/microphone.');
    }
}

let pendingIncomingCall = null;

function handleIncomingCall(call) {
    pendingIncomingCall = call;
    const callerName = call.peer;
    
    DOM.incomingCallerName.textContent = callerName;
    DOM.incomingCallerInitial.textContent = callerName.charAt(0).toUpperCase();
    DOM.incomingOverlay.classList.remove('hidden');
    
    // Play ringing sound conceptually here
}

DOM.btnAccept.addEventListener('click', async () => {
    DOM.incomingOverlay.classList.add('hidden');
    if (!pendingIncomingCall) return;
    
    try {
        await setupLocalMedia();
        DOM.callPartnerName.textContent = pendingIncomingCall.peer;
        showCallScreen();
        startCallTimer();
        
        pendingIncomingCall.answer(State.localStream);
        setupCallEventHandlers(pendingIncomingCall);
        pendingIncomingCall = null;
    } catch (err) {
        console.error('Failed to answer call', err);
        alert('Could not access camera/microphone to answer.');
        if(pendingIncomingCall) pendingIncomingCall.close();
    }
});

DOM.btnDecline.addEventListener('click', () => {
    DOM.incomingOverlay.classList.add('hidden');
    if (pendingIncomingCall) {
        pendingIncomingCall.close();
        pendingIncomingCall = null;
    }
});

function setupCallEventHandlers(call) {
    State.call = call;
    
    call.on('stream', (remoteStream) => {
        State.remoteStream = remoteStream;
        DOM.remoteVideo.srcObject = remoteStream;
    });
    
    call.on('close', endCallCleanup);
    call.on('error', (err) => {
        console.error('Call Error:', err);
        endCallCleanup();
    });
}

async function setupLocalMedia() {
    if (State.localStream) return;
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
        audio: { noiseSuppression: false, echoCancellation: true } 
    });
    State.localStream = stream;
    DOM.localVideo.srcObject = stream;
}

function showCallScreen() {
    DOM.dashboardScreen.classList.add('hidden');
    DOM.callScreen.classList.remove('hidden');
}

// --- 5. Video Call Controls ---
DOM.btnEndCall.addEventListener('click', () => {
    if (State.call) State.call.close();
    if (State.dataConnection) State.dataConnection.close();
    endCallCleanup();
});

function endCallCleanup() {
    if (State.localStream) {
        State.localStream.getTracks().forEach(t => t.stop());
        State.localStream = null;
    }
    DOM.remoteVideo.srcObject = null;
    DOM.localVideo.srcObject = null;
    
    State.call = null;
    State.remoteStream = null;
    State.dataConnection = null;
    
    stopCallTimer();
    
    // Reset UI
    DOM.chatMessages.innerHTML = '';
    closeChatDrawer();
    DOM.callScreen.classList.add('hidden');
    DOM.dashboardScreen.classList.remove('hidden');
    
    // Reset states
    State.isMicMuted = false;
    State.isCamOff = false;
    State.isVoiceIsolationOn = false;
    updateControlButtons();
}

DOM.btnMic.addEventListener('click', () => {
    if (!State.localStream) return;
    State.isMicMuted = !State.isMicMuted;
    State.localStream.getAudioTracks()[0].enabled = !State.isMicMuted;
    updateControlButtons();
});

DOM.btnCam.addEventListener('click', () => {
    if (!State.localStream) return;
    State.isCamOff = !State.isCamOff;
    State.localStream.getVideoTracks()[0].enabled = !State.isCamOff;
    updateControlButtons();
});

// Voice Isolation (Noise Cancellation toggle)
DOM.btnIsolation.addEventListener('click', async () => {
    if (!State.localStream) return;
    const audioTrack = State.localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    State.isVoiceIsolationOn = !State.isVoiceIsolationOn;
    
    try {
        await audioTrack.applyConstraints({
            noiseSuppression: State.isVoiceIsolationOn,
            echoCancellation: true
        });
        updateControlButtons();
        console.log('Voice isolation:', State.isVoiceIsolationOn ? 'ON' : 'OFF');
    } catch (error) {
        console.error('Failed to apply voice isolation constraints:', error);
        State.isVoiceIsolationOn = !State.isVoiceIsolationOn; // Revert on failure
        alert('Voice isolation is not supported on this device/browser.');
    }
});

function updateControlButtons() {
    DOM.btnMic.classList.toggle('active', State.isMicMuted);
    DOM.btnCam.classList.toggle('active', State.isCamOff);
    DOM.btnIsolation.classList.toggle('active', State.isVoiceIsolationOn);
}

// --- 6. Chat Drawer ---
DOM.btnChat.addEventListener('click', toggleChatDrawer);
DOM.btnCloseChat.addEventListener('click', closeChatDrawer);

function toggleChatDrawer() {
    const isOpening = !DOM.chatDrawer.classList.contains('open');
    if (isOpening) {
        DOM.chatDrawer.classList.add('open');
        DOM.callScreen.classList.add('chat-active');
        DOM.btnChat.classList.add('active');
    } else {
        closeChatDrawer();
    }
}

function closeChatDrawer() {
    DOM.chatDrawer.classList.remove('open');
    DOM.callScreen.classList.remove('chat-active');
    DOM.btnChat.classList.remove('active');
}

// Data Connection for Chat
function setupDataConnection(conn) {
    State.dataConnection = conn;
    conn.on('open', () => {
        console.log('Chat connection opened');
    });
    conn.on('data', (data) => {
        appendMessage(data.message, false);
    });
}

DOM.btnSendMsg.addEventListener('click', sendChatMessage);
DOM.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
    const text = DOM.chatInput.value.trim();
    if (!text || !State.dataConnection) return;
    
    State.dataConnection.send({ message: text });
    appendMessage(text, true);
    DOM.chatInput.value = '';
}

function appendMessage(text, isSent) {
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    div.textContent = text;
    DOM.chatMessages.appendChild(div);
    DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
}

// --- 7. Floating PiP Drag Logic ---
let isDragging = false;
let pipStartX, pipStartY, initialMouseX, initialMouseY;

DOM.pipContainer.addEventListener('mousedown', dragStart);
DOM.pipContainer.addEventListener('touchstart', dragStart, {passive: false});
window.addEventListener('mousemove', dragMove);
window.addEventListener('touchmove', dragMove, {passive: false});
window.addEventListener('mouseup', dragEnd);
window.addEventListener('touchend', dragEnd);

function dragStart(e) {
    isDragging = true;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    initialMouseX = clientX;
    initialMouseY = clientY;
    
    const rect = DOM.pipContainer.getBoundingClientRect();
    pipStartX = rect.left;
    pipStartY = rect.top;
    
    // Prevent default to stop text selection during drag
    if(e.type.includes('touch')) e.preventDefault();
}

function dragMove(e) {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scrolling on touch
    
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    const deltaX = clientX - initialMouseX;
    const deltaY = clientY - initialMouseY;
    
    // Convert to absolute positioning to override bottom/right
    DOM.pipContainer.style.bottom = 'auto';
    DOM.pipContainer.style.right = 'auto';
    DOM.pipContainer.style.left = `${pipStartX + deltaX}px`;
    DOM.pipContainer.style.top = `${pipStartY + deltaY}px`;
}

function dragEnd() {
    if (!isDragging) return;
    isDragging = false;
    
    // Snap to edges (simplified implementation)
    const rect = DOM.pipContainer.getBoundingClientRect();
    const snapMargin = 20;
    
    let newLeft = rect.left;
    let newTop = rect.top;
    
    if (rect.left < window.innerWidth / 2) {
        newLeft = snapMargin;
    } else {
        newLeft = window.innerWidth - rect.width - snapMargin;
    }
    
    if (rect.top < snapMargin) newTop = snapMargin + 80; // avoid header
    if (rect.bottom > window.innerHeight - snapMargin) newTop = window.innerHeight - rect.height - snapMargin - 100; // avoid dock
    
    DOM.pipContainer.style.transition = 'left 0.3s, top 0.3s';
    DOM.pipContainer.style.left = `${newLeft}px`;
    DOM.pipContainer.style.top = `${newTop}px`;
    
    setTimeout(() => {
        DOM.pipContainer.style.transition = 'transform var(--transition-fast), box-shadow var(--transition-fast)';
    }, 300);
}

// --- 8. Call Timer ---
function startCallTimer() {
    State.callStartTime = Date.now();
    updateTimerDisplay();
    State.callDurationInterval = setInterval(updateTimerDisplay, 1000);
}

function stopCallTimer() {
    clearInterval(State.callDurationInterval);
    DOM.callDuration.textContent = '00:00';
}

function updateTimerDisplay() {
    const diff = Math.floor((Date.now() - State.callStartTime) / 1000);
    const mins = String(Math.floor(diff / 60)).padStart(2, '0');
    const secs = String(diff % 60).padStart(2, '0');
    DOM.callDuration.textContent = `${mins}:${secs}`;
}
