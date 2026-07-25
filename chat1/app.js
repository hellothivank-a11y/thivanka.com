/**
 * FaceTime Web App - Supabase Realtime Presence + PeerJS Auto-Connect
 */

// --- Supabase Config ---
const SUPABASE_URL = 'https://ufiwakxqrepwnngspjxv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ft_wdmxDIjL9ngoihVFKPA_EnYoD3r8';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Role IDs ---
const ROLE_HUSBAND = 'oasis_husband';
const ROLE_WIFE = 'oasis_wife';

// --- State ---
const State = {
    myRole: null,        // 'oasis_husband' or 'oasis_wife'
    targetRole: null,    // opposite of myRole
    peer: null,
    call: null,
    localStream: null,
    remoteStream: null,
    presenceChannel: null,
    isPartnerOnline: false,
    isMicMuted: false,
    isCamOff: false,
    isVoiceIsolationOn: false,
    callDurationInterval: null,
    callStartTime: null
};

// --- DOM ---
const DOM = {
    connectionScreen: document.getElementById('connection-screen'),
    callScreen: document.getElementById('call-screen'),
    roleSelection: document.getElementById('role-selection'),
    joinSection: document.getElementById('join-section'),
    currentRoleDisplay: document.getElementById('current-role-display'),
    btnRoleHusband: document.getElementById('btn-role-husband'),
    btnRoleWife: document.getElementById('btn-role-wife'),
    btnChangeRole: document.getElementById('btn-change-role'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    pipContainer: document.getElementById('pip-container'),
    callStatus: document.getElementById('call-status'),
    callDuration: document.getElementById('call-duration'),
    btnIsolation: document.getElementById('btn-voice-isolation'),
    btnMic: document.getElementById('btn-toggle-mic'),
    btnCam: document.getElementById('btn-toggle-cam'),
    btnEndCall: document.getElementById('btn-end-call'),
    toastNotification: document.getElementById('toast-notification')
};

// --- 1. Role Setup ---
function initApp() {
    const savedRole = localStorage.getItem('oasis_facetime_role');
    if (savedRole) {
        setRole(savedRole);
    } else {
        showRoleSelection();
    }
}

function setRole(role) {
    State.myRole = role;
    State.targetRole = (role === ROLE_HUSBAND) ? ROLE_WIFE : ROLE_HUSBAND;
    
    localStorage.setItem('oasis_facetime_role', role);
    DOM.currentRoleDisplay.textContent = (role === ROLE_HUSBAND) ? 'Husband' : 'Wife';
    
    DOM.roleSelection.classList.add('hidden');
    DOM.joinSection.classList.remove('hidden');
}

function showRoleSelection() {
    State.myRole = null;
    localStorage.removeItem('oasis_facetime_role');
    DOM.joinSection.classList.add('hidden');
    DOM.roleSelection.classList.remove('hidden');
}

DOM.btnRoleHusband.addEventListener('click', () => setRole(ROLE_HUSBAND));
DOM.btnRoleWife.addEventListener('click', () => setRole(ROLE_WIFE));
DOM.btnChangeRole.addEventListener('click', showRoleSelection);

// --- 2. Enter Room & Initialize Connections ---
DOM.btnJoinRoom.addEventListener('click', async () => {
    try {
        await setupLocalMedia();
        showCallScreen();
        
        // Step A: Initialize PeerJS with my static PeerID
        initPeer();
        
        // Step B: Track Presence on Supabase
        initSupabasePresence();
        
    } catch (err) {
        console.error('Failed to enter room:', err);
        showToast('Camera/Microphone access required.');
    }
});

function initPeer() {
    State.peer = new Peer(State.myRole, {
        debug: 1,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });

    State.peer.on('open', (id) => {
        console.log('PeerJS ready with ID:', id);
    });

    // Auto-answer incoming calls from partner
    State.peer.on('call', handleIncomingCall);

    State.peer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        if (err.type === 'unavailable-id') {
            showToast('Account active elsewhere. Reconnecting...');
            setTimeout(() => {
                if (State.peer) State.peer.destroy();
                initPeer();
            }, 1000);
        }
    });
}

// --- 3. Supabase Realtime Presence Signaling ---
function initSupabasePresence() {
    State.presenceChannel = supabaseClient.channel('oasis_facetime_presence', {
        config: { presence: { key: State.myRole } }
    });

    State.presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const presenceState = State.presenceChannel.presenceState();
            console.log('Presence state updated:', presenceState);
            
            // Check if partner is online
            const isPartnerPresent = Boolean(presenceState[State.targetRole]);
            State.isPartnerOnline = isPartnerPresent;
            
            if (isPartnerPresent) {
                console.log('Partner detected online via Supabase Presence!');
                DOM.callStatus.textContent = 'Partner detected! Connecting...';
                
                // Designated Initiator (Husband calls Wife) to avoid dual-call glare
                if (State.myRole === ROLE_HUSBAND && !State.call) {
                    initiateCallToPartner();
                }
            } else {
                if (!State.call) {
                    DOM.callStatus.textContent = 'Waiting for partner...';
                }
            }
        })
        .on('presence', { event: 'leave' }, ({ key }) => {
            if (key === State.targetRole) {
                console.log('Partner left the room');
                State.isPartnerOnline = false;
                if (State.call) {
                    State.call.close();
                }
                resetToWaitingState();
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await State.presenceChannel.track({
                    user_role: State.myRole,
                    online_at: new Date().toISOString()
                });
            }
        });
}

function initiateCallToPartner() {
    if (State.call || !State.localStream) return;
    
    console.log('Initiating PeerJS call to:', State.targetRole);
    const outCall = State.peer.call(State.targetRole, State.localStream);
    
    if (outCall) {
        State.call = outCall;
        
        outCall.on('stream', (remoteStream) => {
            console.log('Call stream connected on initiator side!');
            handleStreamConnected(remoteStream);
        });
        
        outCall.on('close', () => {
            resetToWaitingState();
        });
        
        outCall.on('error', (err) => {
            console.error('Outgoing call error:', err);
            State.call = null;
        });
    }
}

function handleIncomingCall(inCall) {
    console.log('Incoming PeerJS call received from:', inCall.peer);
    
    if (State.call && State.remoteStream) {
        console.log('Already connected, ignoring duplicate call');
        return;
    }

    State.call = inCall;
    console.log('Auto-answering call...');
    inCall.answer(State.localStream);
    
    inCall.on('stream', (remoteStream) => {
        console.log('Call stream connected on answerer side!');
        handleStreamConnected(remoteStream);
    });
    
    inCall.on('close', () => {
        resetToWaitingState();
    });
    
    inCall.on('error', (err) => {
        console.error('Incoming call error:', err);
        resetToWaitingState();
    });
}

function handleStreamConnected(remoteStream) {
    if (!remoteStream) return;
    
    State.remoteStream = remoteStream;
    DOM.remoteVideo.srcObject = remoteStream;
    
    DOM.remoteVideo.play().then(() => {
        console.log('Remote video playing');
    }).catch(err => {
        console.warn('Video play catch fallback:', err);
        DOM.remoteVideo.muted = true;
        DOM.remoteVideo.play().catch(e => console.error(e));
    });
    
    DOM.callStatus.textContent = '';
    DOM.callStatus.classList.add('hidden');
    DOM.callDuration.classList.remove('hidden');
    
    if (!State.callDurationInterval) startCallTimer();
}

function resetToWaitingState() {
    State.call = null;
    State.remoteStream = null;
    DOM.remoteVideo.srcObject = null;
    
    stopCallTimer();
    DOM.callDuration.classList.add('hidden');
    DOM.callStatus.textContent = State.isPartnerOnline ? 'Reconnecting...' : 'Waiting for partner...';
    DOM.callStatus.classList.remove('hidden');
}

// --- 4. Local Media Setup ---
async function setupLocalMedia() {
    if (State.localStream) return State.localStream;
    
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true
    });
    
    State.localStream = stream;
    DOM.localVideo.srcObject = stream;
    return stream;
}

function showCallScreen() {
    DOM.connectionScreen.classList.add('hidden');
    DOM.callScreen.classList.remove('hidden');
    DOM.callStatus.textContent = 'Waiting for partner...';
    DOM.callStatus.classList.remove('hidden');
    DOM.callDuration.classList.add('hidden');
}

// --- 5. FaceTime Controls ---
DOM.btnEndCall.addEventListener('click', () => {
    endCallCleanup();
});

function endCallCleanup() {
    if (State.presenceChannel) {
        State.presenceChannel.untrack();
        State.presenceChannel.unsubscribe();
        State.presenceChannel = null;
    }
    
    if (State.peer) {
        State.peer.destroy();
        State.peer = null;
    }
    
    if (State.localStream) {
        State.localStream.getTracks().forEach(t => t.stop());
        State.localStream = null;
    }
    
    DOM.remoteVideo.srcObject = null;
    DOM.localVideo.srcObject = null;
    
    State.call = null;
    State.remoteStream = null;
    
    stopCallTimer();
    DOM.callDuration.classList.add('hidden');
    DOM.callStatus.classList.remove('hidden');
    
    DOM.callScreen.classList.add('hidden');
    DOM.connectionScreen.classList.remove('hidden');
    
    State.isMicMuted = false;
    State.isCamOff = false;
    State.isVoiceIsolationOn = false;
    updateControlButtons();
}

DOM.btnMic.addEventListener('click', () => {
    if (!State.localStream) return;
    State.isMicMuted = !State.isMicMuted;
    const audioTrack = State.localStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = !State.isMicMuted;
    updateControlButtons();
});

DOM.btnCam.addEventListener('click', () => {
    if (!State.localStream) return;
    State.isCamOff = !State.isCamOff;
    const videoTrack = State.localStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = !State.isCamOff;
    updateControlButtons();
});

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
        showToast(State.isVoiceIsolationOn ? 'Voice Isolation: ON' : 'Voice Isolation: OFF');
    } catch (error) {
        console.error(error);
        State.isVoiceIsolationOn = !State.isVoiceIsolationOn;
        showToast('Voice isolation not supported on this device.');
    }
});

function updateControlButtons() {
    DOM.btnMic.classList.toggle('active', State.isMicMuted);
    DOM.btnCam.classList.toggle('active', State.isCamOff);
    DOM.btnIsolation.classList.toggle('active', State.isVoiceIsolationOn);
}

// --- 6. Draggable PiP ---
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
    
    if (e.type.includes('touch')) e.preventDefault();
}

function dragMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    const deltaX = clientX - initialMouseX;
    const deltaY = clientY - initialMouseY;
    
    DOM.pipContainer.style.bottom = 'auto';
    DOM.pipContainer.style.right = 'auto';
    DOM.pipContainer.style.left = `${pipStartX + deltaX}px`;
    DOM.pipContainer.style.top = `${pipStartY + deltaY}px`;
}

function dragEnd() {
    if (!isDragging) return;
    isDragging = false;
    
    const rect = DOM.pipContainer.getBoundingClientRect();
    const snapMargin = 20;
    
    let newLeft = rect.left;
    let newTop = rect.top;
    
    if (rect.left < window.innerWidth / 2) {
        newLeft = snapMargin;
    } else {
        newLeft = window.innerWidth - rect.width - snapMargin;
    }
    
    if (rect.top < snapMargin) newTop = snapMargin + 80;
    if (rect.bottom > window.innerHeight - snapMargin) newTop = window.innerHeight - rect.height - snapMargin - 100;
    
    DOM.pipContainer.style.transition = 'left 0.3s, top 0.3s';
    DOM.pipContainer.style.left = `${newLeft}px`;
    DOM.pipContainer.style.top = `${newTop}px`;
    
    setTimeout(() => {
        DOM.pipContainer.style.transition = 'transform var(--transition-fast), box-shadow var(--transition-fast)';
    }, 300);
}

// --- 7. Call Timer & Toast ---
function startCallTimer() {
    if (State.callDurationInterval) clearInterval(State.callDurationInterval);
    State.callStartTime = Date.now();
    updateTimerDisplay();
    State.callDurationInterval = setInterval(updateTimerDisplay, 1000);
}

function stopCallTimer() {
    if (State.callDurationInterval) clearInterval(State.callDurationInterval);
    State.callDurationInterval = null;
    DOM.callDuration.textContent = '00:00';
}

function updateTimerDisplay() {
    const diff = Math.floor((Date.now() - State.callStartTime) / 1000);
    const mins = String(Math.floor(diff / 60)).padStart(2, '0');
    const secs = String(diff % 60).padStart(2, '0');
    DOM.callDuration.textContent = `${mins}:${secs}`;
}

function showToast(message) {
    DOM.toastNotification.textContent = message;
    DOM.toastNotification.classList.remove('hidden');
    setTimeout(() => {
        DOM.toastNotification.classList.add('hidden');
    }, 3000);
}

// Start app
initApp();
