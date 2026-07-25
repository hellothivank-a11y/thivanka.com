/**
 * FaceTime Web App Logic - Direct ID Sharing
 * Pure WebRTC using PeerJS (No Database)
 */

// --- Application State ---
const State = {
    peer: null,
    myId: null,
    call: null,
    localStream: null,
    remoteStream: null,
    isMicMuted: false,
    isCamOff: false,
    isVoiceIsolationOn: false,
    callDurationInterval: null,
    callStartTime: null
};

// --- DOM Elements ---
const DOM = {
    // Screens
    connectionScreen: document.getElementById('connection-screen'),
    callScreen: document.getElementById('call-screen'),
    incomingOverlay: document.getElementById('incoming-call-overlay'),
    
    // Connection UI
    myIdDisplay: document.getElementById('my-id-display'),
    btnCopyId: document.getElementById('btn-copy-id'),
    partnerIdInput: document.getElementById('partner-id-input'),
    btnStartCall: document.getElementById('btn-start-call'),
    
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
    
    // Incoming Call
    incomingCallerId: document.getElementById('incoming-caller-id'),
    incomingCallerInitial: document.getElementById('incoming-caller-initial'),
    btnAccept: document.getElementById('btn-accept-call'),
    btnDecline: document.getElementById('btn-decline-call'),
    
    // Toast
    toastNotification: document.getElementById('toast-notification')
};

// --- 1. Initialization (Generate ID) ---
function initApp() {
    // Initialize PeerJS without an ID to let the server auto-generate a robust one
    State.peer = new Peer({
        debug: 2
    });

    State.peer.on('open', (id) => {
        State.myId = id;
        DOM.myIdDisplay.textContent = id;
        console.log('My secure ID is: ' + id);
    });

    State.peer.on('call', handleIncomingCall);

    State.peer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        showToast('Connection error. Please refresh.');
    });
}

// Start Initialization
initApp();

// --- 2. Connection UI Events ---
DOM.btnCopyId.addEventListener('click', () => {
    if (!State.myId) return;
    navigator.clipboard.writeText(State.myId).then(() => {
        showToast('ID Copied to clipboard!');
    });
});

DOM.btnStartCall.addEventListener('click', async () => {
    const partnerId = DOM.partnerIdInput.value.trim();
    if (!partnerId) {
        showToast('Please enter a Partner ID');
        return;
    }
    if (partnerId === State.myId) {
        showToast('You cannot call yourself');
        return;
    }
    
    startCall(partnerId);
});

DOM.partnerIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') DOM.btnStartCall.click();
});

function showToast(message) {
    DOM.toastNotification.textContent = message;
    DOM.toastNotification.classList.remove('hidden');
    setTimeout(() => {
        DOM.toastNotification.classList.add('hidden');
    }, 3000);
}

// --- 3. Calling Flow ---
async function startCall(partnerId) {
    try {
        await setupLocalMedia();
        
        DOM.callStatus.textContent = 'Calling...';
        showCallScreen();
        
        // Initiate Call
        const call = State.peer.call(partnerId, State.localStream);
        setupCallEventHandlers(call);
        
    } catch (err) {
        console.error('Failed to start call', err);
        showToast('Could not access camera/microphone.');
    }
}

let pendingIncomingCall = null;

function handleIncomingCall(call) {
    pendingIncomingCall = call;
    const callerId = call.peer;
    
    DOM.incomingCallerId.textContent = callerId;
    DOM.incomingCallerInitial.textContent = callerId.charAt(0).toUpperCase();
    DOM.incomingOverlay.classList.remove('hidden');
}

DOM.btnAccept.addEventListener('click', async () => {
    DOM.incomingOverlay.classList.add('hidden');
    if (!pendingIncomingCall) return;
    
    try {
        await setupLocalMedia();
        DOM.callStatus.textContent = 'Connected';
        showCallScreen();
        
        pendingIncomingCall.answer(State.localStream);
        setupCallEventHandlers(pendingIncomingCall);
        pendingIncomingCall = null;
    } catch (err) {
        console.error('Failed to answer call', err);
        showToast('Could not access camera/microphone to answer.');
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
        
        DOM.callStatus.textContent = 'Connected';
        if (!State.callDurationInterval) startCallTimer();
    });
    
    call.on('close', endCallCleanup);
    call.on('error', (err) => {
        console.error('Call Error:', err);
        showToast('Call error occurred.');
        endCallCleanup();
    });
}

async function setupLocalMedia() {
    if (State.localStream) return;
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
}

// --- 4. Video Call Controls ---
DOM.btnEndCall.addEventListener('click', () => {
    if (State.call) State.call.close();
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
    
    stopCallTimer();
    
    // Reset UI
    DOM.callScreen.classList.add('hidden');
    DOM.connectionScreen.classList.remove('hidden');
    DOM.callStatus.textContent = 'Connecting...';
    
    // Reset states
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
        State.isVoiceIsolationOn = !State.isVoiceIsolationOn; // Revert on failure
        showToast('Voice isolation is not supported on this device/browser.');
    }
});

function updateControlButtons() {
    DOM.btnMic.classList.toggle('active', State.isMicMuted);
    DOM.btnCam.classList.toggle('active', State.isCamOff);
    DOM.btnIsolation.classList.toggle('active', State.isVoiceIsolationOn);
}

// --- 5. Floating PiP Drag Logic ---
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
    
    // Snap to edges
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

// --- 6. Call Timer ---
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
