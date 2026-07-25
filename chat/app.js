/* ═══════════════════════════════════════════════════════════════════
   OASIS — PRODUCTION APP.JS
   FaceTime Native Hybrid | Deterministic PeerJS | End-to-End Encrypted
   ═══════════════════════════════════════════════════════════════════ */

// ─── SUPABASE & PUSH CREDENTIALS ───────────────────────────────────
const SUPABASE_URL     = 'https://hfkwgumcdgpsqjjwtxik.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jtj7u2jXgqQt1oIC3P-pTg_nsF_foAQ';
const VAPID_PUBLIC_KEY  = 'BEl62iUYgUivxIkv69yViEuiBIa16tH9Z81A2lJ-J3J22vXq8wZ5F3E7Q3z834g5';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── APP STATE ──────────────────────────────────────────────────────
let peer          = null;
let localStream   = null;
let currentCall   = null;
let currentMyId   = '';
let partnerPeerId = '';
let currentUsername = 'Hani';

let activeChannel   = null;
let presenceChannel = null;
let heartbeatInterval = null;
let typingTimeout     = null;

let isAudioMuted = false;
let isVideoMuted = false;
let isFrontCamera = true;
let callStartTime = null;
let callTimerInterval = null;

// Voice note recording state
let isRecording  = false;
let mediaRecorder = null;
let audioChunks  = [];

let swRegistration = null;

// ─── AUDIO / VIDEO CONSTRAINTS (HD Quality) ────────────────────────
const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl:  true,
    sampleRate:       48000,
    channelCount:     1
};

const VIDEO_CONSTRAINTS = {
    width:     { ideal: 1280 },
    height:    { ideal: 720  },
    frameRate: { ideal: 30   },
    facingMode: 'user'
};

// ─── INDEXEDDB (DEXIE) ─────────────────────────────────────────────
const db = new Dexie('OasisLocalDB');
db.version(1).stores({
    messages: 'id, created_at, sender, encrypted_message'
});

// ─── SERVICE WORKER REGISTRATION ───────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                swRegistration = reg;
                console.log('Oasis SW registered:', reg.scope);
                subscribeWebPush();
            })
            .catch(err => console.warn('SW registration failed:', err));
    });
}

// ─── VAPID KEY HELPER ──────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData  = window.atob(base64);
    const output   = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        output[i] = rawData.charCodeAt(i);
    }
    return output;
}


/* ═══════════════════════════════════════════════════════════════════
   INITIALIZATION
   ═══════════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
    updateNotificationButtonState();
    checkBiometricSupport();

    // ── URL Parameter Identity Detection ─────────────────────────
    // Usage: open app as  yourapp.com/?user=hani  or  ?user=bani
    const params  = new URLSearchParams(window.location.search);
    const urlUser = params.get('user');
    if (urlUser) {
        const name = urlUser.charAt(0).toUpperCase() + urlUser.slice(1).toLowerCase();
        if (name === 'Hani' || name === 'Bani') {
            currentUsername = name;
            selectUser(currentUsername);
        }
    }

    // ── Persistent login ──────────────────────────────────────────
    const savedUser = localStorage.getItem('oasis_user');
    const savedKey  = localStorage.getItem('oasis_key');

    if (savedUser && savedKey) {
        document.getElementById('secretKeyInput').value = savedKey;
        selectUser(savedUser);
        enterOasis();
    } else {
        updateSafetyFingerprint();
    }

    // Password field live fingerprint
    document.getElementById('secretKeyInput').addEventListener('input', updateSafetyFingerprint);

    // Audio record button events (hold to record)
    setupAudioRecordButton();

    // Mobile keyboard viewport fix
    setupVisualViewportFix();

    // Global key / interaction listeners
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') triggerPanic();
    });

    document.getElementById('panicScreen').addEventListener('dblclick', restoreFromPanic);
    document.getElementById('panicScreen').addEventListener('touchend', (() => {
        let lastTap = 0;
        return () => {
            const now = Date.now();
            if (now - lastTap < 400) restoreFromPanic();
            lastTap = now;
        };
    })());

    window.addEventListener('click', () => {
        const menu = document.getElementById('dropdownMenu');
        if (menu && menu.classList.contains('show')) menu.classList.remove('show');
    });

    // PiP drag
    initSelfViewDrag();
});

function setupAudioRecordButton() {
    const audioBtns = [document.getElementById('audioRecordBtn'), document.getElementById('callAudioRecordBtn')];
    audioBtns.forEach(audioBtn => {
        if (!audioBtn) return;
        audioBtn.addEventListener('mousedown', startVoiceRecording);
        audioBtn.addEventListener('mouseup', stopVoiceRecording);
        audioBtn.addEventListener('mouseleave', cancelVoiceRecording);
        audioBtn.addEventListener('touchstart', e => { e.preventDefault(); startVoiceRecording(); }, { passive: false });
        audioBtn.addEventListener('touchend',   e => { e.preventDefault(); stopVoiceRecording(); });
    });
}

function setupVisualViewportFix() {
    if (!window.visualViewport) return;
    window.visualViewport.addEventListener('resize', () => {
        const appContainer = document.getElementById('appContainer');
        if (appContainer) appContainer.style.height = `${window.visualViewport.height}px`;
        const msgList = document.getElementById('messageList');
        if (msgList) msgList.scrollTop = msgList.scrollHeight;
    });
    const msgInput = document.getElementById('messageInput');
    if (msgInput) {
        msgInput.addEventListener('focus', () => {
            setTimeout(() => {
                const msgList = document.getElementById('messageList');
                if (msgList) msgList.scrollTop = msgList.scrollHeight;
            }, 150);
        });
    }
}


/* ═══════════════════════════════════════════════════════════════════
   ONBOARDING UX & USER SELECTION
   ═══════════════════════════════════════════════════════════════════ */
function selectUser(user) {
    currentUsername = user;
    const options = document.querySelectorAll('.user-option');
    options.forEach(opt => {
        opt.classList.remove('active', 'hani-active', 'bani-active');
        if (opt.innerText.trim() === user) {
            opt.classList.add('active', user === 'Hani' ? 'hani-active' : 'bani-active');
        }
    });
}

function updateSafetyFingerprint() {
    const key = document.getElementById('secretKeyInput').value;
    const fp  = generateSafetyFingerprint(key);
    const el  = document.getElementById('fingerprintPreview');
    if (el) el.innerText = fp;
}

function generateSafetyFingerprint(key) {
    if (!key) return '🔐✨🌸🤍💎';
    try {
        const hash = CryptoJS.SHA256(key).toString();
        const emojiSet = ['❤️','💖','✨','🌸','🤍','💎','🌟','🌹','🧸','🍯','🦄','🌈','🍭','🍀','🎀','🕊️','🎈','🔮','🪐','🥂'];
        let fp = '';
        for (let i = 0; i < 5; i++) {
            const hex = hash.substr(i * 4, 4);
            fp += emojiSet[parseInt(hex, 16) % emojiSet.length];
        }
        return fp;
    } catch { return '🔐✨🌸🤍💎'; }
}

function togglePasswordVisibility() {
    const input = document.getElementById('secretKeyInput');
    const open  = document.getElementById('eyeOpenIcon');
    const closed = document.getElementById('eyeClosedIcon');
    if (input.type === 'password') {
        input.type = 'text';
        open.style.display  = 'none';
        closed.style.display = 'block';
    } else {
        input.type = 'password';
        open.style.display  = 'block';
        closed.style.display = 'none';
    }
}

function enterOasis() {
    const secretKey = document.getElementById('secretKeyInput').value.trim();
    if (!secretKey) { showToast('Please enter an Encryption Key.'); return; }

    localStorage.setItem('oasis_user', currentUsername);
    localStorage.setItem('oasis_key',  secretKey);

    document.getElementById('spaceTitle').innerText     = `${currentUsername.toUpperCase()}'S OASIS`;
    document.getElementById('headerFingerprint').innerText = generateSafetyFingerprint(secretKey);
    document.getElementById('setupOverlay').classList.add('hidden');

    initPeer();
    loadInitialMessages();
    setupStatusTracking();
    subscribeRealtime();
    setupPresence();
    checkAndAutoRequestNotificationPermission();
    setupAutoReconnectAndSync();
}

function setupAutoReconnectAndSync() {
    const handleResume = async () => {
        if (document.visibilityState === 'visible') {
            console.log('App resumed — syncing...');
            subscribeRealtime();
            loadInitialMessages();
            setupPresence();
            checkPartnerStatus();
        }
    };
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
}

function showSettingsSetup() {
    document.getElementById('setupOverlay').classList.remove('hidden');
}

function switchAccount() {
    if (confirm('Switch user account or change encryption key? You will need to re-authenticate.')) {
        localStorage.removeItem('oasis_user');
        localStorage.removeItem('oasis_key');
        showSettingsSetup();
    }
}


/* ═══════════════════════════════════════════════════════════════════
   BIOMETRIC LOCK (WEBAUTHN API)
   ═══════════════════════════════════════════════════════════════════ */
function checkBiometricSupport() {
    if (!window.PublicKeyCredential) return;
    const bioSetupBtn = document.getElementById('bioSetupBtn');
    if (bioSetupBtn) bioSetupBtn.style.display = 'flex';
    if (localStorage.getItem('oasis_bio_cred_id')) {
        const panicBioBtn = document.getElementById('panicBioBtn');
        if (panicBioBtn) panicBioBtn.style.display = 'inline-flex';
    }
}

async function registerBiometrics() {
    if (!window.PublicKeyCredential) {
        showToast('Biometrics not supported on this device/browser.');
        return;
    }
    try {
        showToast('Prompting for biometric setup...');
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { name: 'DevUtils Oasis Console' },
                user: {
                    id: Uint8Array.from(currentUsername, c => c.charCodeAt(0)),
                    name: currentUsername,
                    displayName: currentUsername
                },
                pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
                authenticatorSelection: { userVerification: 'preferred' },
                timeout: 60000
            }
        });
        if (credential) {
            const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
            localStorage.setItem('oasis_bio_cred_id', credId);
            showToast('Biometric lock enabled! 🔓');
            checkBiometricSupport();
        }
    } catch (e) {
        console.error('Biometric registration error:', e);
        showToast('Biometric registration canceled or unsupported.');
    }
}

async function unlockWithBiometrics() {
    const credId = localStorage.getItem('oasis_bio_cred_id');
    if (!credId) { showToast('No biometric credential saved.'); return false; }
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const rawId = Uint8Array.from(atob(credId), c => c.charCodeAt(0));
        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge,
                allowCredentials: [{ id: rawId, type: 'public-key' }],
                userVerification: 'preferred',
                timeout: 60000
            }
        });
        if (assertion) {
            showToast('Biometric authentication successful! ❤️');
            const savedKey = localStorage.getItem('oasis_key');
            if (savedKey) {
                document.getElementById('secretKeyInput').value = savedKey;
                document.getElementById('panicScreen').classList.remove('show');
                enterOasis();
                return true;
            } else {
                restoreFromPanic();
            }
        }
    } catch (e) {
        console.error('Biometric unlock failed:', e);
        showToast('Biometric unlock failed. Use Secret Key.');
    }
    return false;
}


/* ═══════════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS & SERVICE WORKER
   ═══════════════════════════════════════════════════════════════════ */
function checkAndAutoRequestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showToast('Notifications enabled! ❤️');
                updateNotificationButtonState();
                subscribeWebPush();
            }
        });
    } else if (Notification.permission === 'granted') {
        subscribeWebPush();
    }
}

function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showToast('Notifications are not supported on this browser.');
        return;
    }
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            showToast('Push notifications enabled! ❤️');
            updateNotificationButtonState();
            subscribeWebPush();
        } else if (permission === 'denied') {
            showToast('Notification permission blocked in browser settings.');
        }
    });
}

async function subscribeWebPush() {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }
        if (sub) {
            const subJson = JSON.stringify(sub);
            const { error } = await supabaseClient
                .from('user_push_subscriptions')
                .upsert({ username: currentUsername, subscription: subJson, updated_at: new Date().toISOString() }, { onConflict: 'username' });
            if (error) console.warn('Supabase push subscription upsert warning:', error.message);
        }
    } catch (e) {
        console.warn('Web Push registration error:', e);
    }
}

function updateNotificationButtonState() {
    const badge = document.getElementById('settingsPushStatus');
    if (badge && 'Notification' in window) {
        badge.innerText = Notification.permission === 'granted' ? 'Enabled' : 'Disabled';
    }
}

function showBackgroundNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = {
        body: body || 'New message received',
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'oasis-msg',
        vibrate: [200, 100, 200],
        renotify: true,
        data: { url: window.location.href }
    };
    if (swRegistration && swRegistration.showNotification) {
        swRegistration.showNotification(title, opts).catch(err => {
            console.warn('showNotification failed:', err);
            try { new Notification(title, opts); } catch (_) {}
        });
    } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body, icon: './icon-192.png', tag: 'oasis-msg' });
    } else {
        try { new Notification(title, opts); } catch (_) {}
    }
}


/* ═══════════════════════════════════════════════════════════════════
   PEERJS — DETERMINISTIC IDs & 1-CLICK CALLING
   ═══════════════════════════════════════════════════════════════════ */
function initPeer() {
    if (peer) return;

    // Deterministic static peer ID based on username
    currentMyId = `oasis_${currentUsername.toLowerCase()}`;

    peer = new Peer(currentMyId, {
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302'  },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', id => {
        currentMyId = id;
        const peerInfo = document.getElementById('peerInfoDisplay');
        if (peerInfo) peerInfo.innerText = 'Encrypted Line Active';
        // Track in presence channel so partner sees us online
        if (presenceChannel) {
            presenceChannel.track({
                username: currentUsername,
                peerId: id,
                onlineAt: new Date().toISOString()
            });
        }
    });

    peer.on('error', err => {
        console.error('PeerJS error:', err);
        showToast('Connection issue: ' + err.type);
    });

    // Incoming call handler
    peer.on('call', call => {
        // Prevent self-call loop
        if (call.peer === currentMyId) {
            console.warn('Ignored self-call.');
            return;
        }

        currentCall = call;
        const partnerName = currentUsername === 'Hani' ? 'Bani' : 'Hani';

        document.getElementById('incomingCallModal').classList.add('active');
        document.getElementById('callerNameLabel').innerText  = partnerName;
        document.getElementById('callStatusLabel').innerText  = 'Incoming secure call...';

        // Set caller avatar emoji
        const avatarEl = document.getElementById('callerAvatar');
        if (avatarEl) avatarEl.innerText = partnerName === 'Hani' ? '💙' : '💜';

        showBackgroundNotification(`Incoming Call from ${partnerName}`, 'Tap to answer call in Oasis ❤️');
    });
}

// ── 1-Click Call ────────────────────────────────────────────────────
function initiateCall() {
    if (!peer) { showToast('Connecting to peer network...'); return; }

    const targetPartner = currentUsername.toLowerCase() === 'hani' ? 'oasis_bani' : 'oasis_hani';
    showToast('Calling...');

    navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: AUDIO_CONSTRAINTS })
        .then(stream => {
            localStream = stream;
            document.getElementById('localVideo').srcObject = stream;
            document.getElementById('localVideo').play();

            showCallScreen();

            const call = peer.call(targetPartner, stream);
            currentCall = call;
            setupCallListeners(call);
        })
        .catch(err => {
            console.error('Camera denied:', err);
            showToast('Call failed: Camera/Microphone access required.');
        });
}

// ── Accept Incoming Call ────────────────────────────────────────────
function acceptCall() {
    document.getElementById('incomingCallModal').classList.remove('active');
    document.getElementById('callStatusLabel').innerText = 'Answering...';

    navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: AUDIO_CONSTRAINTS })
        .then(stream => {
            localStream = stream;
            document.getElementById('localVideo').srcObject = stream;
            document.getElementById('localVideo').play();

            showCallScreen();
            currentCall.answer(stream);
            setupCallListeners(currentCall);
        })
        .catch(err => {
            console.error('Permission error answering call:', err);
            showToast('Could not access camera/mic.');
            declineCall();
        });
}

function declineCall() {
    document.getElementById('incomingCallModal').classList.remove('active');
    if (currentCall) currentCall.close();
    showToast('Call declined.');
}


/* ═══════════════════════════════════════════════════════════════════
   CALL SCREEN MANAGEMENT
   ═══════════════════════════════════════════════════════════════════ */
function showCallScreen() {
    const callScreen = document.getElementById('callScreen');
    callScreen.classList.add('active');

    const partnerName = currentUsername === 'Hani' ? 'Bani' : 'Hani';
    document.getElementById('callPartnerName').innerText = partnerName;
    document.getElementById('callTimer').innerText = '00:00';

    // Reset dock button states
    isAudioMuted = false;
    isVideoMuted = false;
    document.getElementById('toggleAudioBtn').classList.remove('off');
    document.getElementById('toggleVideoBtn').classList.remove('off');

    // Restore PiP
    const selfView  = document.getElementById('selfView');
    const restoreBtn = document.getElementById('restorePipBtn');
    if (selfView)   selfView.classList.remove('hidden-pip');
    if (restoreBtn) restoreBtn.style.display = 'none';
}

function hideCallScreen() {
    document.getElementById('callScreen').classList.remove('active');
    stopCallTimer();
}

function startCallTimer() {
    callStartTime = Date.now();
    callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        const timerEl = document.getElementById('callTimer');
        if (timerEl) timerEl.innerText = `${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    callStartTime = null;
}

// ── Call Lifecycle ──────────────────────────────────────────────────
function setupCallListeners(call) {
    call.on('stream', remoteStream => {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = remoteStream;
        remoteVideo.play();

        // Smart aspect ratio detection — prevent face cropping on landscape screens
        const applyAspectRatio = () => {
            const vw = remoteVideo.videoWidth;
            const vh = remoteVideo.videoHeight;
            if (!vw || !vh) return;

            const isDesktop = window.innerWidth >= 768;
            if (isDesktop) {
                remoteVideo.classList.add('contain-mode');
                return;
            }

            const videoAspect = vw / vh;
            if (videoAspect > 1.25) {
                remoteVideo.classList.add('contain-mode');
            } else {
                remoteVideo.classList.remove('contain-mode');
            }
        };

        remoteVideo.addEventListener('loadedmetadata', applyAspectRatio);
        remoteVideo.addEventListener('resize', applyAspectRatio);
        window.addEventListener('resize', applyAspectRatio);

        startCallTimer();
        document.getElementById('callPartnerName').innerText =
            currentUsername === 'Hani' ? 'Bani' : 'Hani';

        showToast('Call connected securely ❤️');
    });

    call.on('close', () => cleanUpCall());
    call.on('error', err => {
        console.error('Call error:', err);
        cleanUpCall();
    });
}

function cleanUpCall() {
    hideCallScreen();
    closeCallChat(); // close drawer if open

    const remoteVideo = document.getElementById('remoteVideo');
    const localVideo  = document.getElementById('localVideo');

    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(t => t.stop());
        remoteVideo.srcObject = null;
    }
    // Reset aspect ratio class
    remoteVideo.classList.remove('contain-mode');

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    if (localVideo) localVideo.srcObject = null;

    isAudioMuted = false;
    isVideoMuted = false;
    isFrontCamera = true;
    currentCall = null;
    showToast('Call ended.');
}

function endCall() {
    if (currentCall) currentCall.close();
    cleanUpCall();
}

// ── In-Call Controls ────────────────────────────────────────────────
function toggleLocalAudio() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    isAudioMuted = !isAudioMuted;
    track.enabled = !isAudioMuted;
    const btn = document.getElementById('toggleAudioBtn');
    btn.classList.toggle('off', isAudioMuted);
    showToast(isAudioMuted ? 'Mic muted' : 'Mic unmuted');
}

function toggleLocalVideo() {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    isVideoMuted = !isVideoMuted;
    track.enabled = !isVideoMuted;
    const btn = document.getElementById('toggleVideoBtn');
    btn.classList.toggle('off', isVideoMuted);
    showToast(isVideoMuted ? 'Camera off' : 'Camera on');
}

async function flipCamera() {
    if (!localStream) return;
    isFrontCamera = !isFrontCamera;
    const newConstraints = {
        video: { ...VIDEO_CONSTRAINTS, facingMode: isFrontCamera ? 'user' : 'environment' },
        audio: AUDIO_CONSTRAINTS
    };
    try {
        const newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
        const newVideoTrack = newStream.getVideoTracks()[0];

        // Replace track in PeerJS connection
        if (currentCall && currentCall.peerConnection) {
            const sender = currentCall.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(newVideoTrack);
        }

        // Replace local preview
        const oldVideoTracks = localStream.getVideoTracks();
        oldVideoTracks.forEach(t => { localStream.removeTrack(t); t.stop(); });
        localStream.addTrack(newVideoTrack);

        document.getElementById('localVideo').srcObject = localStream;
        showToast(isFrontCamera ? 'Front camera' : 'Rear camera');
    } catch (err) {
        console.error('Camera flip error:', err);
        showToast('Could not flip camera.');
    }
}

// ── In-Call Chat Drawer ─────────────────────────────────────────────
let callChatOpen = false;

function toggleCallChat() {
    const callScreen = document.getElementById('callScreen');
    const drawer     = document.getElementById('callChatDrawer');
    const chatBtn    = document.getElementById('callChatBtn');
    callChatOpen     = !callChatOpen;

    if (callScreen) callScreen.classList.toggle('chat-open', callChatOpen);
    if (drawer)     drawer.classList.toggle('open', callChatOpen);
    if (chatBtn)    chatBtn.classList.toggle('active', callChatOpen);

    if (callChatOpen) {
        // Populate drawer with current messages from the main chat
        syncCallChatMessages();
        setTimeout(() => {
            const msgs = document.getElementById('callChatMessages');
            if (msgs) msgs.scrollTop = msgs.scrollHeight;
            const input = document.getElementById('callChatInput');
            if (input) input.focus();
        }, 300); // after slide-in animation
    }
}

function closeCallChat() {
    const callScreen = document.getElementById('callScreen');
    const drawer     = document.getElementById('callChatDrawer');
    const chatBtn    = document.getElementById('callChatBtn');
    callChatOpen     = false;
    if (callScreen) callScreen.classList.remove('chat-open');
    if (drawer)     drawer.classList.remove('open');
    if (chatBtn)    chatBtn.classList.remove('active');
}

// Mirror the main #messageList content into the drawer
function syncCallChatMessages() {
    const source = document.getElementById('messageList');
    const target = document.getElementById('callChatMessages');
    if (!source || !target) return;
    target.innerHTML = source.innerHTML;
}

// Also push new messages into the drawer in real-time if it's open
function appendToCallChatIfOpen(msgWrapperHTML) {
    if (!callChatOpen) return;
    const target = document.getElementById('callChatMessages');
    if (!target) return;
    target.insertAdjacentHTML('beforeend', msgWrapperHTML);
    target.scrollTop = target.scrollHeight;
}

function sendCallChatMessage() {
    const input = document.getElementById('callChatInput');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';
    // Re-use the main sendMessage flow, setting input temporarily
    const mainInput = document.getElementById('messageInput');
    const prev = mainInput.value;
    mainInput.value = text;
    sendMessage();
    mainInput.value = prev;
}

function handleCallChatKeyPress(e) {
    if (e.key === 'Enter') sendCallChatMessage();
}

function toggleSideBySideMode() {
    const container = document.getElementById('appContainer');
    if (!container) return;
    container.classList.toggle('side-by-side');
    showToast(container.classList.contains('side-by-side') ? 'Side-by-Side View' : 'Full-Screen Video');
}

// ── PiP Self-View Toggle ────────────────────────────────────────────
function toggleSelfViewVisibility(e) {
    if (e) e.stopPropagation();
    const selfView  = document.getElementById('selfView');
    const restoreBtn = document.getElementById('restorePipBtn');
    if (!selfView) return;

    if (selfView.classList.contains('hidden-pip')) {
        selfView.classList.remove('hidden-pip');
        if (restoreBtn) restoreBtn.style.display = 'none';
        showToast('Camera preview restored');
    } else {
        selfView.classList.add('hidden-pip');
        if (restoreBtn) restoreBtn.style.display = 'flex';
        showToast('Camera preview hidden');
    }
}


/* ═══════════════════════════════════════════════════════════════════
   SETTINGS MODAL
   ═══════════════════════════════════════════════════════════════════ */
function openSettingsModal() {
    const dropdown = document.getElementById('dropdownMenu');
    if (dropdown) dropdown.classList.remove('show');

    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    modal.classList.add('show');
    updateNotificationButtonState();

    const bioStatus = document.getElementById('settingsBioStatus');
    if (bioStatus) bioStatus.innerText = localStorage.getItem('oasis_bio_cred_id') ? 'Active' : 'Setup';

    const key = localStorage.getItem('oasis_key');
    const fpEl = document.getElementById('settingsModalFingerprint');
    if (fpEl && key) fpEl.innerText = generateSafetyFingerprint(key);
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('show');
}

function closeSettingsModalOnOverlay(e) {
    if (e.target.id === 'settingsModal') closeSettingsModal();
}


/* ═══════════════════════════════════════════════════════════════════
   CRYPTOGRAPHIC HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function encryptText(text, key) {
    return CryptoJS.AES.encrypt(text, key).toString();
}

function decryptText(ciphertext, key) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, key);
        const result = bytes.toString(CryptoJS.enc.Utf8);
        return result || '•••••••• (Invalid Key)';
    } catch { return '••••••••'; }
}

function linkify(inputText) {
    const p1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/gim;
    let out = inputText.replace(p1, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    const p2 = /(^|[^/])(www\.[\S]+(\b|$))/gim;
    out = out.replace(p2, '$1<a href="http://$2" target="_blank" rel="noopener">$2</a>');
    return out;
}


/* ═══════════════════════════════════════════════════════════════════
   MEDIA STORAGE (SUPABASE STORAGE BUCKET)
   ═══════════════════════════════════════════════════════════════════ */
async function uploadEncryptedMediaToStorage(encryptedPayload, extension = 'enc') {
    const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${extension}`;
    const blob = new Blob([encryptedPayload], { type: 'text/plain' });

    const { data, error } = await supabaseClient.storage
        .from('oasis-media')
        .upload(fileName, blob, { contentType: 'text/plain', cacheControl: '3600' });

    if (error) { console.error('Storage upload failed:', error); throw error; }

    const { data: urlData } = supabaseClient.storage.from('oasis-media').getPublicUrl(fileName);
    return urlData.publicUrl;
}


/* ═══════════════════════════════════════════════════════════════════
   SECURE CHAT LOGIC
   ═══════════════════════════════════════════════════════════════════ */
async function sendMessage(mediaPayload = null) {
    const secretKey = localStorage.getItem('oasis_key');
    const msgInput  = document.getElementById('messageInput');
    const text      = msgInput.value.trim();

    if (!secretKey) { showToast('Encryption key not loaded. Re-authenticate.'); return; }

    let payload = mediaPayload;
    if (!payload) {
        if (!text) return;
        payload = `TEXT:${text}`;
    }

    const encryptedMsg = encryptText(payload, secretKey);

    if (!mediaPayload) {
        msgInput.value = '';
        msgInput.focus();
        broadcastTyping(false);
    }

    const { data, error } = await supabaseClient
        .from('chat_messages')
        .insert([{ sender: currentUsername, encrypted_message: encryptedMsg }])
        .select();

    if (error) {
        showToast('Error sending: ' + error.message);
    } else if (data && data[0]) {
        await db.messages.put(data[0]);
    }
}

function handleInputKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
}

function handleInputTyping() {
    broadcastTyping(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => broadcastTyping(false), 2000);
}

function broadcastTyping(isTyping) {
    if (activeChannel) {
        activeChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { username: currentUsername, isTyping }
        });
    }
}

function triggerImageUpload() {
    document.getElementById('imageFileInput').click();
}

function handleImageFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('File must be an image.'); return; }
    showToast('Processing & encrypting image...');

    const reader = new FileReader();
    reader.onload = function(evt) {
        const img = new Image();
        img.onload = async function() {
            const maxDim = 800;
            let w = img.width, h = img.height;
            if (w > h ? w > maxDim : h > maxDim) {
                if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                else        { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const b64 = canvas.toDataURL('image/jpeg', 0.7);
            const payload = `IMAGE:${b64}`;
            try {
                showToast('Uploading encrypted image...');
                const url = await uploadEncryptedMediaToStorage(payload, 'enc');
                sendMessage(`IMAGE_URL:${url}`);
            } catch {
                sendMessage(payload);
            }
            document.getElementById('imageFileInput').value = '';
        };
        img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
}


/* ═══════════════════════════════════════════════════════════════════
   VOICE NOTES
   ═══════════════════════════════════════════════════════════════════ */
function startVoiceRecording() {
    if (isRecording) return;
    navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
        .then(stream => {
            isRecording = true;
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                if (!audioChunks.length) return;
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onload = async function(evt) {
                    const payload = `AUDIO:${evt.target.result}`;
                    try {
                        showToast('Uploading encrypted voice note...');
                        const url = await uploadEncryptedMediaToStorage(payload, 'enc');
                        sendMessage(`AUDIO_URL:${url}`);
                    } catch {
                        sendMessage(payload);
                    }
                };
                reader.readAsDataURL(blob);
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorder.start();
            ['audioRecordBtn', 'callAudioRecordBtn'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.classList.add('recording');
            });
            showToast('Recording... Release to send.');
        })
        .catch(err => {
            console.error('Audio recording permission issue:', err);
            showToast('Audio recording access denied.');
        });
}

function stopVoiceRecording() {
    if (!isRecording) return;
    isRecording = false;
    ['audioRecordBtn', 'callAudioRecordBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('recording');
    });
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        showToast('Voice note processing...');
    }
}

function cancelVoiceRecording() {
    if (!isRecording) return;
    isRecording = false;
    ['audioRecordBtn', 'callAudioRecordBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('recording');
    });
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        audioChunks = [];
        mediaRecorder.stop();
        showToast('Voice note canceled.');
    }
}

function playAudioMsg(btn, audioSrc) {
    const wrapper = btn.closest('.audio-player-wrapper');
    const progress = wrapper.querySelector('.audio-progress-bar');
    const duration = wrapper.querySelector('.audio-duration');
    const fmt = t => `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;

    let audio = wrapper.querySelector('audio');
    if (!audio) {
        audio = new Audio(audioSrc);
        wrapper.appendChild(audio);
        audio.addEventListener('timeupdate', () => {
            progress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
            duration.innerText = fmt(audio.currentTime);
        });
        audio.addEventListener('loadedmetadata', () => { duration.innerText = fmt(audio.duration); });
        audio.addEventListener('ended', () => {
            progress.style.width = '0%';
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        });
    }

    if (audio.paused) {
        audio.play();
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    } else {
        audio.pause();
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    }
}


/* ═══════════════════════════════════════════════════════════════════
   MESSAGE RENDERING
   ═══════════════════════════════════════════════════════════════════ */
let lastRenderedSender = null;
let lastRenderedTime   = null;
let dateTrackingString = '';

async function renderMessage(data, isInitialLoad = false) {
    const secretKey = localStorage.getItem('oasis_key');
    const messageList = document.getElementById('messageList');

    let decryptedPayload = '••••••••';
    if (secretKey) decryptedPayload = decryptText(data.encrypted_message, secretKey);

    let msgType = 'TEXT';
    let msgContent = decryptedPayload;

    if      (decryptedPayload.startsWith('IMAGE_URL:')) { msgType = 'IMAGE_URL'; msgContent = decryptedPayload.substring(10); }
    else if (decryptedPayload.startsWith('AUDIO_URL:')) { msgType = 'AUDIO_URL'; msgContent = decryptedPayload.substring(10); }
    else if (decryptedPayload.startsWith('IMAGE:'))     { msgType = 'IMAGE';     msgContent = decryptedPayload.substring(6);  }
    else if (decryptedPayload.startsWith('AUDIO:'))     { msgType = 'AUDIO';     msgContent = decryptedPayload.substring(6);  }
    else if (decryptedPayload.startsWith('TEXT:'))      { msgType = 'TEXT';      msgContent = decryptedPayload.substring(5);  }

    const rawTime    = data.created_at || new Date().toISOString();
    const date       = new Date(rawTime);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const dateDivider = checkAndGetDateDivider(date);
    if (dateDivider) {
        const div = document.createElement('div');
        div.className = 'date-divider';
        div.innerHTML = `<div class="date-divider-line"></div><div class="date-divider-text">${dateDivider}</div><div class="date-divider-line"></div>`;
        messageList.appendChild(div);
    }

    const isSelf = data.sender === currentUsername;
    const timeDiffMins = lastRenderedTime ? Math.abs(date - lastRenderedTime) / 60000 : 999;
    const isGrouped    = lastRenderedSender === data.sender && timeDiffMins < 2;

    const msgWrapper = document.createElement('div');
    msgWrapper.className = `msg-wrapper ${isSelf ? 'sent' : 'received'}`;
    if (isGrouped) msgWrapper.style.marginTop = '2px';

    let html = '';
    if (!isGrouped && !isSelf) html += `<div class="sender-tag">${data.sender}</div>`;

    const bubbleId = `mb-${Math.random().toString(36).substring(2, 9)}`;
    let bubbleContent = '';

    if (msgType === 'IMAGE_URL' || msgType === 'AUDIO_URL') {
        bubbleContent = `<div id="${bubbleId}"><span style="font-size:0.75rem; color:rgba(255,255,255,0.4);">Decrypting...</span></div>`;
    } else if (msgType === 'IMAGE') {
        bubbleContent = `<img src="${msgContent}" class="msg-image" onclick="zoomImage('${msgContent}')" alt="Image">`;
    } else if (msgType === 'AUDIO') {
        bubbleContent = buildAudioPlayer(msgContent);
    } else {
        bubbleContent = `<div>${linkify(msgContent)}</div>`;
    }

    html += `<div class="msg-bubble">${bubbleContent}</div>`;
    if (!isGrouped) html += `<div class="msg-meta-row"><span>${timeString}</span></div>`;

    msgWrapper.innerHTML = html;
    messageList.appendChild(msgWrapper);
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: isInitialLoad ? 'auto' : 'smooth' });

    // Mirror new message live into the in-call chat drawer if it's open
    if (!isInitialLoad) appendToCallChatIfOpen(msgWrapper.outerHTML);

    lastRenderedSender = data.sender;
    lastRenderedTime   = date;

    // Resolve encrypted media from storage URLs
    if (msgType === 'IMAGE_URL' || msgType === 'AUDIO_URL') {
        try {
            const res = await fetch(msgContent);
            const encText = await res.text();
            const dec = decryptText(encText, secretKey);
            const el  = document.getElementById(bubbleId);
            if (el) {
                if (dec.startsWith('IMAGE:')) {
                    const src = dec.substring(6);
                    el.innerHTML = `<img src="${src}" class="msg-image" onclick="zoomImage('${src}')" alt="Image">`;
                } else if (dec.startsWith('AUDIO:')) {
                    el.innerHTML = buildAudioPlayer(dec.substring(6));
                } else {
                    el.innerText = 'Decryption error.';
                }
            }
        } catch (err) {
            console.error('Error loading encrypted media:', err);
            const el = document.getElementById(bubbleId);
            if (el) el.innerText = 'Error loading media.';
        }
    }

    // Notify partner of new message (when not from self)
    if (!isInitialLoad && data.sender !== currentUsername) {
        let snippet = 'Sent a message';
        if (msgType === 'TEXT')  snippet = msgContent.substring(0, 60);
        else if (msgType === 'IMAGE' || msgType === 'IMAGE_URL') snippet = '📷 Sent an image';
        else if (msgType === 'AUDIO' || msgType === 'AUDIO_URL') snippet = '🎵 Sent a voice note';
        showBackgroundNotification(`Message from ${data.sender}`, snippet);
    }
}

function buildAudioPlayer(src) {
    return `
        <div class="audio-player-wrapper">
            <button class="audio-control-btn" onclick="playAudioMsg(this, '${src}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <div class="audio-progress"><div class="audio-progress-bar"></div></div>
            <div class="audio-duration">0:00</div>
        </div>`;
}

function checkAndGetDateDivider(date) {
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let str = '';
    if (date.toDateString() === today.toDateString())     str = 'Today';
    else if (date.toDateString() === yesterday.toDateString()) str = 'Yesterday';
    else str = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    if (str !== dateTrackingString) { dateTrackingString = str; return str; }
    return null;
}


/* ═══════════════════════════════════════════════════════════════════
   LOCAL CACHING & INITIAL LOAD
   ═══════════════════════════════════════════════════════════════════ */
async function loadInitialMessages() {
    const messageList = document.getElementById('messageList');
    messageList.innerHTML = '';
    lastRenderedSender = null;
    lastRenderedTime   = null;
    dateTrackingString = '';

    try {
        const localMsgs = await db.messages.orderBy('created_at').toArray();
        if (localMsgs.length > 0) localMsgs.forEach(m => renderMessage(m, true));

        let query = supabaseClient.from('chat_messages').select('*').order('created_at', { ascending: true });
        if (localMsgs.length > 0) {
            query = query.gt('created_at', localMsgs[localMsgs.length - 1].created_at);
        } else {
            query = query.limit(100);
        }

        const { data, error } = await query;
        if (error) { console.error('Failed to fetch messages:', error.message); return; }
        if (data && data.length > 0) {
            await db.messages.bulkPut(data);
            data.forEach(m => renderMessage(m, true));
        }
    } catch (e) {
        console.error('IndexedDB / message load error:', e);
    }
}

async function clearAllMessages() {
    if (!confirm('Are you absolutely sure you want to wipe the secure chat history? This cannot be undone.')) return;
    const { error } = await supabaseClient.from('chat_messages').delete().neq('id', 0);
    if (error) {
        showToast('Wipe error: ' + error.message);
    } else {
        await db.messages.clear();
        document.getElementById('messageList').innerHTML = '';
        lastRenderedSender = null;
        lastRenderedTime   = null;
        dateTrackingString = '';
        showToast('Chat history completely cleared.');
    }
}


/* ═══════════════════════════════════════════════════════════════════
   IMAGE LIGHTBOX
   ═══════════════════════════════════════════════════════════════════ */
function zoomImage(src) {
    document.getElementById('imageModalTarget').src = src;
    document.getElementById('imageModal').classList.add('show');
}

function closeImageModal() {
    document.getElementById('imageModal').classList.remove('show');
}


/* ═══════════════════════════════════════════════════════════════════
   STATUS & HEARTBEAT
   ═══════════════════════════════════════════════════════════════════ */
async function updateMyStatus() {
    try {
        await supabaseClient.from('online_status').upsert({
            username: currentUsername,
            last_seen: new Date().toISOString()
        });
    } catch { /* silence */ }
}

async function checkPartnerStatus() {
    const partnerName = currentUsername === 'Hani' ? 'Bani' : 'Hani';
    const { data } = await supabaseClient
        .from('online_status')
        .select('last_seen')
        .eq('username', partnerName)
        .maybeSingle();

    if (data && data.last_seen) {
        const stale = (Date.now() - new Date(data.last_seen).getTime()) < 15000;
        if (stale) { updatePartnerOnlineLabel(true); return; }
    }
    if (!partnerPeerId) updatePartnerOnlineLabel(false);
}

function updatePartnerOnlineLabel(isOnline) {
    const dot   = document.getElementById('statusDot');
    const label = document.getElementById('partnerStatusLabel');
    dot.className = 'status-dot';

    if (isOnline) {
        label.innerText = 'Online';
        dot.classList.add(currentUsername === 'Hani' ? 'online-rose' : 'online-cyan');
    } else {
        label.innerText = 'Offline';
    }
}

function setupStatusTracking() {
    updateMyStatus();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        updateMyStatus();
        checkPartnerStatus();
    }, 6000);
}


/* ═══════════════════════════════════════════════════════════════════
   SUPABASE REALTIME & PRESENCE
   ═══════════════════════════════════════════════════════════════════ */
function subscribeRealtime() {
    if (activeChannel) supabaseClient.removeChannel(activeChannel);

    activeChannel = supabaseClient.channel('public:chat_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async payload => {
            await db.messages.put(payload.new);
            renderMessage(payload.new);

            if (payload.new.sender !== currentUsername) {
                showBackgroundNotification(
                    `Message from ${payload.new.sender}`,
                    'Tap to decrypt and read.'
                );
            }
        })
        .on('broadcast', { event: 'typing' }, payload => {
            const partner = currentUsername === 'Hani' ? 'Bani' : 'Hani';
            if (payload.payload.username === partner) {
                document.getElementById('typingIndicator').style.display =
                    payload.payload.isTyping ? 'flex' : 'none';
            }
        })
        .subscribe();
}

function setupPresence() {
    if (presenceChannel) supabaseClient.removeChannel(presenceChannel);

    presenceChannel = supabaseClient.channel('online_presence', {
        config: { presence: { key: currentUsername } }
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            const partner = currentUsername === 'Hani' ? 'Bani' : 'Hani';

            if (state[partner] && state[partner].length > 0) {
                const partnerData = state[partner][0];
                if (partnerData.peerId) {
                    partnerPeerId = partnerData.peerId;
                    localStorage.setItem('oasis_partner_id', partnerPeerId);
                }
                updatePartnerOnlineLabel(true);
            } else {
                checkPartnerStatus();
            }
        })
        .subscribe(async status => {
            if (status === 'SUBSCRIBED' && currentMyId) {
                await presenceChannel.track({
                    username: currentUsername,
                    peerId: currentMyId,
                    onlineAt: new Date().toISOString()
                });
            }
        });
}


/* ═══════════════════════════════════════════════════════════════════
   UI HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function toggleMenu(e) {
    e.stopPropagation();
    document.getElementById('dropdownMenu').classList.toggle('show');
}

function showToast(message) {
    const toast = document.getElementById('toastMessage');
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}


/* ═══════════════════════════════════════════════════════════════════
   DRAGGABLE PiP SELF-VIEW
   ═══════════════════════════════════════════════════════════════════ */
function initSelfViewDrag() {
    const selfView  = document.getElementById('selfView');
    const container = document.getElementById('callScreen');
    if (!selfView || !container) return;

    let dragging = false, startX, startY, initLeft, initTop;

    selfView.addEventListener('mousedown',  startDrag);
    selfView.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
        if (e.target.closest('.pip-eye-btn')) return;
        dragging = true;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX; startY = clientY;

        const rect    = selfView.getBoundingClientRect();
        const pRect   = container.getBoundingClientRect();
        initLeft = rect.left - pRect.left;
        initTop  = rect.top  - pRect.top;

        selfView.style.transition = 'none';
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('mouseup',  stopDrag);
        document.addEventListener('touchend', stopDrag);
    }

    function onDrag(e) {
        if (!dragging) return;
        if (e.cancelable) e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const pRect   = container.getBoundingClientRect();
        const sRect   = selfView.getBoundingClientRect();
        const newLeft = Math.max(8, Math.min(initLeft + (clientX - startX), pRect.width  - sRect.width  - 8));
        const newTop  = Math.max(8, Math.min(initTop  + (clientY - startY), pRect.height - sRect.height - 8));

        selfView.style.left  = `${newLeft}px`;
        selfView.style.top   = `${newTop}px`;
        selfView.style.right = 'auto';
    }

    function stopDrag() {
        if (!dragging) return;
        dragging = false;

        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('mouseup',  stopDrag);
        document.removeEventListener('touchend', stopDrag);

        // Snap to nearest corner
        const pRect  = container.getBoundingClientRect();
        const sRect  = selfView.getBoundingClientRect();
        const curLeft = sRect.left - pRect.left;
        const curTop  = sRect.top  - pRect.top;
        const snapL = curLeft < (pRect.width - sRect.width) / 2 ? 12 : (pRect.width  - sRect.width  - 12);
        const snapT = curTop  < (pRect.height - sRect.height) / 2 ? 12 : (pRect.height - sRect.height - 12);

        selfView.style.transition = 'left 0.28s cubic-bezier(0.16,1,0.3,1), top 0.28s cubic-bezier(0.16,1,0.3,1)';
        selfView.style.left = `${snapL}px`;
        selfView.style.top  = `${snapT}px`;
        setTimeout(() => { selfView.style.transition = ''; }, 300);
    }
}


/* ═══════════════════════════════════════════════════════════════════
   PANIC MODE & LOCKING
   ═══════════════════════════════════════════════════════════════════ */
function triggerPanic() {
    document.getElementById('panicScreen').classList.add('show');
    endCall();
    localStorage.removeItem('oasis_user');
    localStorage.removeItem('oasis_key');
    document.getElementById('messageList').innerHTML = '';
    checkBiometricSupport();
}

function restoreFromPanic() {
    const phrase = prompt('Enter Unlock Key:');
    if (!phrase) return;
    document.getElementById('secretKeyInput').value = phrase;
    document.getElementById('panicScreen').classList.remove('show');
    showSettingsSetup();
    updateSafetyFingerprint();
}
