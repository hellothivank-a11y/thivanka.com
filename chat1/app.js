/**
 * FaceTime Web App Logic - Auto-Connect Waiting Room
 * Pure WebRTC using PeerJS (No Database)
 */

// --- Constants ---
const ROLE_A_ID = 'oasis_user_a';
const ROLE_B_ID = 'oasis_user_b';

// --- Application State ---
const State = {
    peer: null,
    myRole: null,
    partnerId: null,
    call: null,
    localStream: null,
    remoteStream: null,
    isMicMuted: false,
    isCamOff: false,
    isVoiceIsolationOn: false,
    callDurationInterval: null,
    callStartTime: null,
    pollingInterval: null
};

// --- DOM Elements ---
const DOM = {
    // Screens
    connectionScreen: document.getElementById('connection-screen'),
    callScreen: document.getElementById('call-screen'),
    
    // UI Sections
    roleSelection: document.getElementById('role-selection'),
    joinSection: document.getElementById('join-section'),
    currentRoleDisplay: document.getElementById('current-role-display'),
    
    // Buttons
    btnRoleA: document.getElementById('btn-role-a'),
    btnRoleB: document.getElementById('btn-role-b'),
    btnChangeRole: document.getElementById('btn-change-role'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    
    // Video Call
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    pipContainer: document.getElementById('pip-container'),
    callStatus: document.getElementById('call-status'),
    callDuration: document.getElementById('call-duration'),
    
    // Controls
    btnIsolation: document.getElementById('btn-voice-isolation'),
    btnMic: document.getElementById('btn-toggle-mic'),
    btnCam: document.getElementById('btn-toggle-cam'),
    btnEndCall: document.getElementById('btn-end-call'),
    
    // Toast
    toastNotification: document.getElementById('toast-notification')
};

// --- 1. Initialization & Role Management ---
function initApp() {
    const savedRole = localStorage.getItem('oasis_role');
    if (savedRole) {
        setRole(savedRole);
    } else {
        showRoleSelection();
    }
}

function setRole(role) {
    State.myRole = role;
    State.partnerId = role === ROLE_A_ID ? ROLE_B_ID : ROLE_A_ID;
    
    localStorage.setItem('oasis_role', role);
    DOM.currentRoleDisplay.textContent = role === ROLE_A_ID ? 'User A' : 'User B';
    
    DOM.roleSelection.classList.add('hidden');
    DOM.joinSection.classList.remove('hidden');
}

function showRoleSelection() {
    State.myRole = null;
    localStorage.removeItem('oasis_role');
    
    DOM.joinSection.classList.add('hidden');
    DOM.roleSelection.classList.remove('hidden');
}

DOM.btnRoleA.addEventListener('click', () => setRole(ROLE_A_ID));
DOM.btnRoleB.addEventListener('click', () => setRole(ROLE_B_ID));
DOM.btnChangeRole.addEventListener('click', showRoleSelection);

// --- 2. Joining the Waiting Room ---
DOM.btnJoinRoom.addEventListener('click', async () => {
    try {
        // FIX #4: Guarantee Media Stream resolves BEFORE initializing PeerJS or attempting calls
        await setupLocalMedia();
        showCallScreen();
        
        // FIX #3: Explicitly pass reliable STUN servers to guarantee NAT traversal
        State.peer = new Peer(State.myRole, {
            debug: 1, // Reduced debug to prevent console spam
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        });
        
        State.peer.on('open', (id) => {
            console.log('Peer connected to server with ID:', id);
            startPollingPartner();
        });
        
        State.peer.on('call', handleIncomingCall);
        
        State.peer.on('error', (err) => {
            // Suppress the expected 'peer-unavailable' errors during polling
            if (err.type === 'peer-unavailable') {
                return;
            }
            console.error('PeerJS Error:', err);
            if (err.type === 'unavailable-id') {
                showToast('ID is already in use elsewhere.');
                endCallCleanup();
            }
        });
        
    } catch (err) {
        console.error('Failed to join room', err);
        showToast('Could not access camera/microphone. Please allow permissions.');
    }
});

// --- 3. Robust Auto-Connect Logic ---
function startPollingPartner() {
    if (State.pollingInterval) clearInterval(State.pollingInterval);
    
    // Attempt to call partner every 3 seconds
    State.pollingInterval = setInterval(() => {
        // Do not poll if we are already successfully connected
        if (State.call && State.remoteStream) return; 
        
        console.log('Polling partner:', State.partnerId);
        const outCall = State.peer.call(State.partnerId, State.localStream);
        
        if (outCall) {
            outCall.on('stream', (remoteStream) => {
                console.log('Outgoing call connected!');
                State.call = outCall;
                stopPollingPartner();
                handleStreamConnected(remoteStream);
            });
            
            outCall.on('close', () => {
                if (State.call === outCall) resetToWaitingRoom();
            });
        }
    }, 3000);
}

function stopPollingPartner() {
    if (State.pollingInterval) {
        clearInterval(State.pollingInterval);
        State.pollingInterval = null;
    }
}

// FIX #2: Flawless Auto-Answer
function handleIncomingCall(inCall) {
    console.log('Incoming call received from:', inCall.peer);
    
    // FIX #1: Race Condition - IMMEDIATELY stop outgoing polls if an incoming call arrives
    stopPollingPartner();
    
    // If we already established a fully active call, ignore duplicate incoming events to prevent streams overwriting
    if (State.call && State.remoteStream) {
        console.log('Already in an active call, ignoring duplicate incoming call.');
        return;
    }

    State.call = inCall;
    
    console.log('Auto-answering call...');
    // Ensure local stream is passed dynamically and correctly
    inCall.answer(State.localStream);
    
    inCall.on('stream', (remoteStream) => {
        console.log('Incoming call stream received!');
        handleStreamConnected(remoteStream);
    });
    
    inCall.on('close', () => {
        resetToWaitingRoom();
    });
}

// Unified function to handle UI transition once a stream is successfully received
function handleStreamConnected(remoteStream) {
    if (State.remoteStream === remoteStream) return; // Prevent duplicate triggers
    
    State.remoteStream = remoteStream;
    DOM.remoteVideo.srcObject = remoteStream;
    
    // Transition UI out of waiting state
    DOM.callStatus.textContent = '';
    DOM.callStatus.classList.add('hidden');
    DOM.callDuration.classList.remove('hidden');
    
    if (!State.callDurationInterval) startCallTimer();
}

function resetToWaitingRoom() {
    State.call = null;
    State.remoteStream = null;
    DOM.remoteVideo.srcObject = null;
    
    stopCallTimer();
    DOM.callDuration.classList.add('hidden');
    
    DOM.callStatus.textContent = 'Waiting for partner...';
    DOM.callStatus.classList.remove('hidden');
    
    // Partner disconnected, resume polling automatically
    startPollingPartner(); 
}

// --- 4. Video & Audio Management ---
async function setupLocalMedia() {
    if (State.localStream) return;
    
    // Request media securely
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, 
        audio: { noiseSuppression: false, echoCancellation: true } 
    });
    
    State.localStream = stream;
    DOM.localVideo.srcObject = stream;
}

function showCallScreen() {
    DOM.connectionScreen.classList.add('hidden');
    DOM.callScreen.classList.remove('hidden');
    DOM.callStatus.textContent = 'Waiting for partner...';
    DOM.callStatus.classList.remove('hidden');
    DOM.callDuration.classList.add('hidden');
}

// --- 5. Controls ---
DOM.btnEndCall.addEventListener('click', () => {
    if (State.call) State.call.close();
    endCallCleanup();
});

function endCallCleanup() {
    stopPollingPartner();
    
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
    
    // Reset UI back to Connection Screen
    DOM.callScreen.classList.add('hidden');
    DOM.connectionScreen.classList.remove('hidden');
    
    // Reset control states
    State.isMicMuted = false;
    State.isCamOff = false;
    State.isVoiceIsolationOn = false;
    updateControlButtons();
}

DOM.btnMic.addEventListener('click', () => {
    if (!State.localStream) return;
    State.isMicMuted = !State.isMicMuted;
    const audioTrack = State.localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !State.isMicMuted;
    }
    updateControlButtons();
});

DOM.btnCam.addEventListener('click', () => {
    if (!State.localStream) return;
    State.isCamOff = !State.isCamOff;
    const videoTrack = State.localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !State.isCamOff;
    }
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
        showToast(State.isVoiceIsolationOn ? 'Voice Isolation: ON' : 'Voice Isolation: OFF');
    } catch (error) {
        console.error('Failed to apply voice isolation constraints:', error);
        State.isVoiceIsolationOn = !State.isVoiceIsolationOn; 
        showToast('Voice isolation is not supported on this device.');
    }
});

function updateControlButtons() {
    DOM.btnMic.classList.toggle('active', State.isMicMuted);
    DOM.btnCam.classList.toggle('active', State.isCamOff);
    DOM.btnIsolation.classList.toggle('active', State.isVoiceIsolationOn);
}

// --- 6. Floating PiP Drag Logic ---
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
    
    if(e.type.includes('touch')) e.preventDefault();
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

// --- 7. Call Timer ---
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

// Bootstrap
initApp();
