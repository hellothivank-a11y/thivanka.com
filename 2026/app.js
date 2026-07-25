/* ═══════════════════════════════════════════════════════════════════
   OASIS — PRODUCTION APP.JS
   FaceTime Native Hybrid | Deterministic PeerJS | End-to-End Encrypted
   ═══════════════════════════════════════════════════════════════════ */

// ─── SUPABASE & PUSH CREDENTIALS ───────────────────────────────────
const SUPABASE_URL = 'https://igjdlgkttaprkpnozumw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_406KPZpreoHBJrpyZNq7Zw_7QN5J0ia';
const VAPID_PUBLIC_KEY = 'BH42j4sf0q-GmcG1uqu2ozhkDNk_L5MgTvM7IFyV9Dq4KK71KEzjKQStMEUlFULTi6CgX0rf-orO9OdZ8_1OME4';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── APP STATE ──────────────────────────────────────────────────────
let peer = null;
let localStream = null;
let currentCall = null;
let currentMyId = '';
let partnerPeerId = '';
let currentUsername = 'Hani';

let activeChannel = null;
let presenceChannel = null;
let heartbeatInterval = null;
let typingTimeout = null;

let isAudioMuted = false;
let isVideoMuted = false;
let isFrontCamera = true;
let callStartTime = null;
let callTimerInterval = null;

// Voice note recording state
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

let swRegistration = null;

// ─── AUDIO / VIDEO CONSTRAINTS (HD Quality) ────────────────────────
const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1
};

const VIDEO_CONSTRAINTS = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
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
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const output = new Uint8Array(rawData.length);
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
    const params = new URLSearchParams(window.location.search);
    const urlUser = params.get('user');
    if (urlUser) {
        const name = urlUser.charAt(0).toUpperCase() + urlUser.slice(1).toLowerCase();
        if (name === 'Hani' || name === 'Bani') {
            currentUsername = name;
            selectUser(currentUsername);
        }
    }

    // ── Persistent Profile Selection & Auto-Bypass ───────────
    const savedActiveUser = localStorage.getItem('oasis_active_user') || localStorage.getItem('oasis_user');
    const savedKey = localStorage.getItem('oasis_key');

    if (savedActiveUser) {
        selectUser(savedActiveUser);
        if (savedKey) {
            document.getElementById('secretKeyInput').value = savedKey;
        } else {
            localStorage.setItem('oasis_key', '1234');
            document.getElementById('secretKeyInput').value = '1234';
        }
        enterOasis(); // Auto-bypass setup screen immediately!
    } else {
        selectUser('Hani');
        updateSafetyFingerprint();
    }

    // Password field live fingerprint
    document.getElementById('secretKeyInput').addEventListener('input', updateSafetyFingerprint);

    // Audio record button events (hold to record)
    setupAudioRecordButton();

    // Mobile keyboard viewport fix
    setupVisualViewportFix();

    // Setup Emoji Picker element event listener
    const picker = document.getElementById('emojiPickerComponent');
    if (picker) {
        picker.addEventListener('emoji-click', event => {
            if (event.detail && event.detail.unicode) {
                insertEmoji(event.detail.unicode);
            }
        });
    }

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
        audioBtn.addEventListener('touchend', e => { e.preventDefault(); stopVoiceRecording(); });
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
    localStorage.setItem('oasis_active_user', user);
    localStorage.setItem('oasis_user', user);

    const haniCard = document.getElementById('profileHani');
    const baniCard = document.getElementById('profileBani');
    if (haniCard && baniCard) {
        haniCard.className = 'profile-card' + (user === 'Hani' ? ' active hani-active' : '');
        baniCard.className = 'profile-card' + (user === 'Bani' ? ' active bani-active' : '');
    }
}

function updateSafetyFingerprint() {
    const key = document.getElementById('secretKeyInput').value;
    const fp = generateSafetyFingerprint(key);
    const el = document.getElementById('fingerprintPreview');
    if (el) el.innerText = fp;
}

function generateSafetyFingerprint(key) {
    if (!key) return '🔐✨🌸🤍💎';
    try {
        const hash = CryptoJS.SHA256(key).toString();
        const emojiSet = ['❤️', '💖', '✨', '🌸', '🤍', '💎', '🌟', '🌹', '🧸', '🍯', '🦄', '🌈', '🍭', '🍀', '🎀', '🕊️', '🎈', '🔮', '🪐', '🥂'];
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
    const open = document.getElementById('eyeOpenIcon');
    const closed = document.getElementById('eyeClosedIcon');
    if (input.type === 'password') {
        input.type = 'text';
        open.style.display = 'none';
        closed.style.display = 'block';
    } else {
        input.type = 'password';
        open.style.display = 'block';
        closed.style.display = 'none';
    }
}

function enterOasis() {
    const secretKey = document.getElementById('secretKeyInput').value.trim();
    if (!secretKey) { showToast('Please enter an Encryption Key.'); return; }

    localStorage.setItem('oasis_active_user', currentUsername);
    localStorage.setItem('oasis_user', currentUsername);
    localStorage.setItem('oasis_key', secretKey);

    const myAvatar = currentUsername === 'Hani' ? '👑' : '🌸';
    const partnerName = currentUsername === 'Hani' ? 'Bani' : 'Hani';
    const partnerAvatar = currentUsername === 'Hani' ? '🌸' : '👑';

    const titleEl = document.getElementById('spaceTitle');
    if (titleEl) titleEl.innerText = partnerName;
    const badgeEl = document.getElementById('headerMyBadge');
    if (badgeEl) badgeEl.innerText = `You: ${currentUsername} ${myAvatar}`;
    const avatarEl = document.getElementById('headerAvatar');
    if (avatarEl) avatarEl.innerText = partnerAvatar;
    const fpEl = document.getElementById('headerFingerprint');
    if (fpEl) fpEl.innerText = generateSafetyFingerprint(secretKey);

    // Close settings modal & dropdown menu and hide setup overlay to navigate to Home Screen
    closeSettingsModal();
    const dropdown = document.getElementById('dropdownMenu');
    if (dropdown) dropdown.classList.remove('show');
    document.getElementById('setupOverlay').classList.add('hidden');

    // Make sure main app container is displayed
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.style.display = 'flex';

    // Destroy previous peer connection if user identity changed
    const targetMyId = `oasis_${currentUsername.toLowerCase()}`;
    if (peer && currentMyId !== targetMyId) {
        try { peer.destroy(); } catch (e) { }
        peer = null;
    }

    initPeer();
    loadInitialMessages();
    setupStatusTracking();
    subscribeRealtime();
    setupPresence();
    checkAndAutoRequestNotificationPermission();
    setupAutoReconnectAndSync();

    // Scroll message list to bottom on Home Screen navigation
    setTimeout(() => {
        const msgList = document.getElementById('messageList');
        if (msgList) msgList.scrollTop = msgList.scrollHeight;
    }, 100);
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
        closeSettingsModal();
        localStorage.removeItem('oasis_user');
        localStorage.removeItem('oasis_active_user');
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
            try { new Notification(title, opts); } catch (_) { }
        });
    } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body, icon: './icon-192.png', tag: 'oasis-msg' });
    } else {
        try { new Notification(title, opts); } catch (_) { }
    }
}


/* ═══════════════════════════════════════════════════════════════════
   PEERJS — DETERMINISTIC IDs & 1-CLICK CALLING
   ═══════════════════════════════════════════════════════════════════ */
function initPeer() {
    if (peer) {
        if (!peer.destroyed) return;
        peer = null;
    }

    currentMyId = `oasis_${currentUsername.toLowerCase()}`;
    createPeerInstance(currentMyId);
}

function createPeerInstance(targetId) {
    if (peer) {
        try { peer.destroy(); } catch (e) {}
        peer = null;
    }

    currentMyId = targetId;

    peer = new Peer(currentMyId, {
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', id => {
        currentMyId = id;
        const peerInfo = document.getElementById('peerInfoDisplay');
        if (peerInfo) peerInfo.innerText = 'Encrypted Line Active';
        
        // Broadcast active ID to partner via presence channel
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
        if (err.type === 'unavailable-id') {
            console.warn(`Peer ID "${currentMyId}" is taken. Generating fallback ID...`);
            // Automatically handle taken ID by generating a unique session peer ID
            const fallbackId = `oasis_${currentUsername.toLowerCase()}_${Math.floor(1000 + Math.random() * 9000)}`;
            createPeerInstance(fallbackId);
            return;
        }
        showToast('Connection note: ' + (err.type || 'reconnecting'));
    });

    // Incoming P2P DataChannel connection handler (files, progress signals)
    peer.on('connection', conn => {
        setupDataConnection(conn);
    });

    // Incoming call handler
    peer.on('call', call => {
        if (call.peer === currentMyId) {
            console.warn('Ignored self-call.');
            return;
        }

        currentCall = call;
        const partnerName = currentUsername === 'Hani' ? 'Bani' : 'Hani';

        document.getElementById('incomingCallModal').classList.add('active');
        document.getElementById('callerNameLabel').innerText = partnerName;
        document.getElementById('callStatusLabel').innerText = 'Incoming secure call...';

        const avatarEl = document.getElementById('callerAvatar');
        if (avatarEl) avatarEl.innerText = partnerName === 'Hani' ? '💙' : '💜';

        showBackgroundNotification(`Incoming Call from ${partnerName}`, 'Tap to answer call in Oasis ❤️');
    });
}

// ── 1-Click Call ────────────────────────────────────────────────────
function initiateCall() {
    if (!peer || peer.destroyed) { showToast('Connecting to peer network...'); initPeer(); return; }

    const defaultPartner = currentUsername.toLowerCase() === 'hani' ? 'oasis_bani' : 'oasis_hani';
    const targetPartner = partnerPeerId || localStorage.getItem('oasis_partner_id') || defaultPartner;
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
    const selfView = document.getElementById('selfView');
    const restoreBtn = document.getElementById('restorePipBtn');
    if (selfView) selfView.classList.remove('hidden-pip');
    if (restoreBtn) restoreBtn.style.display = 'none';
}

function hideCallScreen() {
    const callScreen = document.getElementById('callScreen');
    if (callScreen) callScreen.classList.remove('active', 'chat-open');
    stopCallTimer();
    const timerEl = document.getElementById('callTimer');
    if (timerEl) timerEl.innerText = '00:00';
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
    if (call.peerConnection) {
        call.peerConnection.oniceconnectionstatechange = () => {
            if (call.peerConnection.iceConnectionState === 'disconnected' ||
                call.peerConnection.iceConnectionState === 'failed' ||
                call.peerConnection.iceConnectionState === 'closed') {
                cleanUpCall();
            }
        };
    }
}

function cleanUpCall() {
    hideCallScreen();
    closeCallChat(); // close drawer if open

    const remoteVideo = document.getElementById('remoteVideo');
    const localVideo = document.getElementById('localVideo');

    if (remoteVideo) {
        if (remoteVideo.srcObject) {
            try { remoteVideo.srcObject.getTracks().forEach(t => t.stop()); } catch (e) { }
            remoteVideo.srcObject = null;
        }
        remoteVideo.classList.remove('contain-mode');
    }

    if (localStream) {
        try { localStream.getTracks().forEach(t => t.stop()); } catch (e) { }
        localStream = null;
    }

    if (localVideo) {
        if (localVideo.srcObject) {
            try { localVideo.srcObject.getTracks().forEach(t => t.stop()); } catch (e) { }
            localVideo.srcObject = null;
        }
    }

    isAudioMuted = false;
    isVideoMuted = false;
    isFrontCamera = true;

    const toggleAudioBtn = document.getElementById('toggleAudioBtn');
    const toggleVideoBtn = document.getElementById('toggleVideoBtn');
    if (toggleAudioBtn) toggleAudioBtn.classList.remove('off');
    if (toggleVideoBtn) toggleVideoBtn.classList.remove('off');

    if (currentCall) {
        try { currentCall.close(); } catch (e) { }
        currentCall = null;
    }

    showToast('Call ended.');
}

function endCall() {
    if (currentCall) {
        try { currentCall.close(); } catch (e) { }
    }
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
    const drawer = document.getElementById('callChatDrawer');
    const chatBtn = document.getElementById('callChatBtn');
    callChatOpen = !callChatOpen;

    if (callScreen) callScreen.classList.toggle('chat-open', callChatOpen);
    if (drawer) drawer.classList.toggle('open', callChatOpen);
    if (chatBtn) chatBtn.classList.toggle('active', callChatOpen);

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
    const drawer = document.getElementById('callChatDrawer');
    const chatBtn = document.getElementById('callChatBtn');
    callChatOpen = false;
    if (callScreen) callScreen.classList.remove('chat-open');
    if (drawer) drawer.classList.remove('open');
    if (chatBtn) chatBtn.classList.remove('active');
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
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    autoResizeTextarea(input);

    const row = document.getElementById('callChatInputRow');
    if (row) row.classList.remove('typing-active');

    // Re-use main sendMessage flow
    const mainInput = document.getElementById('messageInput');
    const prev = mainInput.value;
    mainInput.value = text;
    sendMessage();
    mainInput.value = prev;
}

// ── Quick Emoji Picker Shortcut ────────────────────────────────────
let activeTargetInputId = 'messageInput';

function toggleEmojiPicker(e, isInCall = false) {
    if (e) e.stopPropagation();
    activeTargetInputId = isInCall ? 'callChatInput' : 'messageInput';
    const popup = document.getElementById('emojiPickerPopup');
    if (!popup) return;

    const isShowing = popup.classList.contains('show');
    if (isShowing) {
        popup.classList.remove('show');
    } else {
        if (isInCall) {
            popup.style.bottom = '80px';
            popup.style.left = '16px';
            popup.style.zIndex = '1200';
        } else {
            popup.style.bottom = '75px';
            popup.style.left = '16px';
            popup.style.zIndex = '900';
        }
        popup.classList.add('show');
    }
}

function insertEmoji(emoji) {
    const input = document.getElementById(activeTargetInputId) || document.getElementById('messageInput');
    if (!input) return;

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const text = input.value;

    input.value = text.substring(0, start) + emoji + text.substring(end);
    const newPos = start + emoji.length;
    input.selectionStart = input.selectionEnd = newPos;
    input.focus();

    if (activeTargetInputId === 'callChatInput') {
        handleCallChatTyping();
    } else {
        handleInputTyping();
    }
}

window.addEventListener('click', (e) => {
    if (!e.target.closest('#emojiPickerPopup') && !e.target.closest('#emojiBtn') && !e.target.closest('#callEmojiBtn')) {
        const popup = document.getElementById('emojiPickerPopup');
        if (popup && popup.classList.contains('show')) {
            popup.classList.remove('show');
        }
    }
});

function handleRemoteVideoClick() {
    const callScreen = document.getElementById('callScreen');
    if (callScreen && callScreen.classList.contains('chat-open')) {
        closeCallChat();
    }
}

function handleCallChatKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendCallChatMessage();
    }
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
    const selfView = document.getElementById('selfView');
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

    // Dynamic Apple ID profile card info
    const activeUser = localStorage.getItem('oasis_active_user') || currentUsername || 'Hani';
    const userAvatar = activeUser === 'Hani' ? '👑' : '🌸';
    const userRole = activeUser === 'Hani' ? 'Dev Lead • Encrypted Space' : 'Partner • Encrypted Space';
    
    const profileAvatar = document.getElementById('settingsProfileAvatar');
    if (profileAvatar) profileAvatar.innerText = userAvatar;

    const profileName = document.getElementById('settingsProfileName');
    if (profileName) profileName.innerText = activeUser;

    const profileSub = document.getElementById('settingsProfileSub');
    if (profileSub) profileSub.innerText = userRole;

    const key = localStorage.getItem('oasis_key');
    const fpEl = document.getElementById('settingsModalFingerprint');
    if (fpEl && key) fpEl.innerText = generateSafetyFingerprint(key);

    // Update Push Notification status
    updateNotificationButtonState();

    // Update Biometrics status
    const bioStatus = document.getElementById('settingsBioStatus');
    if (bioStatus) bioStatus.innerText = localStorage.getItem('oasis_bio_cred_id') ? 'Active' : 'Setup';

    // Update Sound toggle state
    const soundToggle = document.getElementById('settingsSoundToggle');
    if (soundToggle) {
        const soundVal = localStorage.getItem('oasis_sound_enabled');
        soundToggle.checked = soundVal === null ? true : soundVal === 'true';
    }

    // Update P2P connection badge
    const peerBadge = document.getElementById('settingsPeerStatus');
    if (peerBadge) {
        peerBadge.innerText = (peer && !peer.destroyed) ? 'Ready' : 'Connecting';
    }

    modal.classList.add('show');
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('show');
}

function closeSettingsModalOnOverlay(e) {
    if (e.target.id === 'settingsModal') closeSettingsModal();
}

function toggleSoundSetting(enabled) {
    localStorage.setItem('oasis_sound_enabled', enabled ? 'true' : 'false');
    showToast(enabled ? 'Sound effects enabled 🔔' : 'Sound effects muted 🔕');
}


/* ═══════════════════════════════════════════════════════════════════
   SECURE CHAT & TYPING AUTO-EXPAND LOGIC
   ═══════════════════════════════════════════════════════════════════ */
async function sendMessage(mediaPayload = null) {
    const secretKey = localStorage.getItem('oasis_key');
    const msgInput = document.getElementById('messageInput');
    const text = msgInput.value.trim();

    if (!secretKey) { showToast('Encryption key not loaded. Re-authenticate.'); return; }

    let payload = mediaPayload;
    if (!payload) {
        if (!text) return;
        payload = `TEXT:${text}`;
    }

    const encryptedMsg = encryptText(payload, secretKey);

    if (!mediaPayload) {
        msgInput.value = '';
        autoResizeTextarea(msgInput);
        msgInput.focus();
        broadcastTyping(false);

        const wrapper = document.getElementById('inputContainerWrapper');
        if (wrapper) wrapper.classList.remove('typing-active');
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
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleInputTyping() {
    const msgInput = document.getElementById('messageInput');
    if (!msgInput) return;

    autoResizeTextarea(msgInput);

    const wrapper = document.getElementById('inputContainerWrapper');
    if (wrapper) {
        if (msgInput.value.trim().length > 0) {
            wrapper.classList.add('typing-active');
        } else {
            wrapper.classList.remove('typing-active');
        }
    }

    broadcastTyping(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => broadcastTyping(false), 2000);
}

function handleCallChatTyping() {
    const input = document.getElementById('callChatInput');
    if (!input) return;

    autoResizeTextarea(input);

    const row = document.getElementById('callChatInputRow');
    if (row) {
        if (input.value.trim().length > 0) {
            row.classList.add('typing-active');
        } else {
            row.classList.remove('typing-active');
        }
    }
}

// Auto-expanding textarea up to 4 lines (~100px max)
function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 100);
    el.style.height = `${newHeight}px`;
    if (el.scrollHeight > 100) {
        el.style.overflowY = 'auto';
        el.scrollTop = el.scrollHeight;
    } else {
        el.style.overflowY = 'hidden';
    }
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
   DIRECT PEER-TO-PEER (P2P) FILE TRANSFER & WEBRTC DATACHANNELS
   ═══════════════════════════════════════════════════════════════════ */
let p2pDataConnection = null;
const CHUNK_SIZE = 32768; // 32KB binary chunks
const activeP2PTransfers = {}; // Receiver state store

function setupDataConnection(conn) {
    p2pDataConnection = conn;

    conn.on('open', () => {
        console.log('P2P DataChannel active with:', conn.peer);
    });

    conn.on('data', data => {
        handleIncomingP2PPacket(data);
    });

    conn.on('close', () => {
        console.log('P2P DataChannel closed.');
        if (p2pDataConnection === conn) p2pDataConnection = null;
    });

    conn.on('error', err => {
        console.error('P2P DataChannel error:', err);
    });
}

function getOrConnectDataChannel(targetPeerId) {
    if (p2pDataConnection && p2pDataConnection.open) {
        return Promise.resolve(p2pDataConnection);
    }
    return new Promise((resolve, reject) => {
        if (!peer) { reject(new Error('Peer network not initialized.')); return; }
        const conn = peer.connect(targetPeerId, { reliable: true });
        setupDataConnection(conn);
        conn.on('open', () => resolve(conn));
        conn.on('error', err => reject(err));
        setTimeout(() => {
            if (conn && conn.open) resolve(conn);
        }, 2000);
    });
}

function triggerP2PFileUpload() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.click();
}

function handleP2PFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // Reset input so same file can be picked again
    sendP2PFile(file);
}

async function sendP2PFile(file) {
    const targetPartner = currentUsername.toLowerCase() === 'hani' ? 'oasis_bani' : 'oasis_hani';
    const transferId = 'p2p_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const fileName = file.name;
    const fileSize = file.size;
    const fileType = file.type || 'application/octet-stream';
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

    // 1. Render Progress Card in Sender's Chat UI
    renderProgressCard(transferId, fileName, fileSize, fileType, true, 0);

    showToast(`Sending ${fileName} via P2P...`);

    try {
        const conn = await getOrConnectDataChannel(targetPartner);

        // Send Header Packet
        conn.send({
            type: 'P2P_FILE_START',
            transferId,
            fileName,
            fileSize,
            fileType,
            totalChunks,
            sender: currentUsername
        });

        // Start Streaming Chunks
        sendP2PChunkSequentially(file, transferId, 0, totalChunks, conn);
    } catch (err) {
        console.error('P2P File Transfer connection error:', err);
        showToast('P2P connection issue. Partner may be offline.');
        updateProgressCardError(transferId, 'Partner Offline');
    }
}

function sendP2PChunkSequentially(file, transferId, chunkIndex, totalChunks, conn) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blobSlice = file.slice(start, end);

    const reader = new FileReader();
    reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        const base64Data = arrayBufferToBase64(arrayBuffer);

        try {
            conn.send({
                type: 'P2P_FILE_CHUNK',
                transferId,
                chunkIndex,
                chunkData: base64Data
            });

            const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
            updateProgressCardPercentage(transferId, progress);

            if (chunkIndex + 1 < totalChunks) {
                setTimeout(() => {
                    sendP2PChunkSequentially(file, transferId, chunkIndex + 1, totalChunks, conn);
                }, 10); // yields event loop for smooth UI
            } else {
                conn.send({
                    type: 'P2P_FILE_END',
                    transferId
                });

                // Finalize Sender UI -> Replace progress card with Rich Media Card
                const blobUrl = URL.createObjectURL(file);
                replaceProgressCardWithMediaCard(transferId, file.name, file.type || 'application/octet-stream', file.size, blobUrl, true);
                showToast(`Sent ${file.name} via P2P ❤️`);
            }
        } catch (err) {
            console.error('Chunk send error:', err);
            updateProgressCardError(transferId, 'Transfer Error');
        }
    };
    reader.readAsArrayBuffer(blobSlice);
}

function handleIncomingP2PPacket(packet) {
    if (!packet || !packet.type) return;

    if (packet.type === 'P2P_FILE_START') {
        const { transferId, fileName, fileSize, fileType, totalChunks, sender } = packet;
        activeP2PTransfers[transferId] = {
            fileName,
            fileSize,
            fileType,
            totalChunks,
            chunks: new Array(totalChunks),
            receivedCount: 0,
            sender
        };

        renderProgressCard(transferId, fileName, fileSize, fileType, false, 0);
        showToast(`Receiving ${fileName} via P2P...`);
    }
    else if (packet.type === 'P2P_FILE_CHUNK') {
        const { transferId, chunkIndex, chunkData } = packet;
        const transfer = activeP2PTransfers[transferId];
        if (!transfer) return;

        const arrayBuffer = base64ToArrayBuffer(chunkData);
        transfer.chunks[chunkIndex] = arrayBuffer;
        transfer.receivedCount++;

        const progress = Math.round((transfer.receivedCount / transfer.totalChunks) * 100);
        updateProgressCardPercentage(transferId, progress);
    }
    else if (packet.type === 'P2P_FILE_END') {
        const { transferId } = packet;
        const transfer = activeP2PTransfers[transferId];
        if (!transfer) return;

        // Reassemble incoming binary chunks into a single Blob
        const fileBlob = new Blob(transfer.chunks, { type: transfer.fileType });
        const blobUrl = URL.createObjectURL(fileBlob);

        replaceProgressCardWithMediaCard(transferId, transfer.fileName, transfer.fileType, transfer.fileSize, blobUrl, false);
        showToast(`Received ${transfer.fileName} via P2P ❤️`);

        delete activeP2PTransfers[transferId];
    }
}

function renderProgressCard(transferId, fileName, fileSize, fileType, isSender, initialProgress) {
    const msgList = document.getElementById('messageList');
    if (!msgList) return;

    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isSender ? 'sent' : 'received'}`;
    wrapper.id = `msg_${transferId}`;

    const iconEmoji = fileType.startsWith('image/') ? '🖼️' : fileType.startsWith('video/') ? '🎥' : fileType.startsWith('audio/') ? '🎵' : '📄';

    wrapper.innerHTML = `
        <div class="message-bubble p2p-progress-bubble">
            <div class="p2p-progress-card">
                <div class="p2p-file-header">
                    <div class="p2p-file-icon">${iconEmoji}</div>
                    <div class="p2p-file-details">
                        <span class="p2p-file-name">${escapeHtml(fileName)}</span>
                        <span class="p2p-file-size">${formatFileSize(fileSize)}</span>
                    </div>
                </div>
                <div class="p2p-progress-track">
                    <div class="p2p-progress-fill" id="fill_${transferId}" style="width: ${initialProgress}%;"></div>
                </div>
                <div class="p2p-progress-status" id="status_${transferId}">
                    <span>${isSender ? 'Sending P2P' : 'Receiving P2P'}</span>
                    <span class="p2p-percent-label" id="percent_${transferId}">${initialProgress}%</span>
                </div>
            </div>
        </div>`;

    msgList.appendChild(wrapper);
    msgList.scrollTop = msgList.scrollHeight;

    appendToCallChatIfOpen(wrapper.outerHTML);
}

function updateProgressCardPercentage(transferId, percent) {
    const fill = document.getElementById(`fill_${transferId}`);
    const percentLabel = document.getElementById(`percent_${transferId}`);
    if (fill) fill.style.width = `${percent}%`;
    if (percentLabel) percentLabel.innerText = `${percent}%`;
}

function updateProgressCardError(transferId, errorMsg) {
    const statusEl = document.getElementById(`status_${transferId}`);
    if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--ios-red);">${escapeHtml(errorMsg)}</span>`;
    }
}

function replaceProgressCardWithMediaCard(transferId, fileName, fileType, fileSize, blobUrl, isSender) {
    const wrapper = document.getElementById(`msg_${transferId}`);
    if (!wrapper) return;

    let mediaHTML = '';
    const isImage = fileType.startsWith('image/');
    const isVideo = fileType.startsWith('video/');
    const isAudio = fileType.startsWith('audio/');

    if (isImage) {
        mediaHTML = `
            <div class="p2p-media-card image-media">
                <img src="${blobUrl}" alt="${escapeHtml(fileName)}" class="p2p-img-preview" onclick="openImageModal('${blobUrl}')">
                <div class="p2p-media-meta">
                    <span class="p2p-media-name">${escapeHtml(fileName)}</span>
                    <a href="${blobUrl}" download="${escapeHtml(fileName)}" class="p2p-dl-btn" title="Download Original">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Download</span>
                    </a>
                </div>
            </div>`;
    } else if (isVideo) {
        mediaHTML = `
            <div class="p2p-media-card video-media">
                <video src="${blobUrl}" controls class="p2p-video-preview"></video>
                <div class="p2p-media-meta">
                    <span class="p2p-media-name">${escapeHtml(fileName)}</span>
                    <a href="${blobUrl}" download="${escapeHtml(fileName)}" class="p2p-dl-btn">Download Video</a>
                </div>
            </div>`;
    } else if (isAudio) {
        mediaHTML = `
            <div class="p2p-media-card audio-media">
                <audio src="${blobUrl}" controls class="p2p-audio-preview"></audio>
                <div class="p2p-media-meta">
                    <span class="p2p-media-name">${escapeHtml(fileName)} • ${formatFileSize(fileSize)}</span>
                    <a href="${blobUrl}" download="${escapeHtml(fileName)}" class="p2p-dl-btn">Download Audio</a>
                </div>
            </div>`;
    } else {
        const fileExt = fileName.split('.').pop().toUpperCase() || 'FILE';
        mediaHTML = `
            <div class="p2p-media-card doc-media">
                <div class="p2p-doc-header">
                    <div class="p2p-doc-badge">${escapeHtml(fileExt)}</div>
                    <div class="p2p-doc-info">
                        <span class="p2p-media-name">${escapeHtml(fileName)}</span>
                        <span class="p2p-doc-size">${formatFileSize(fileSize)}</span>
                    </div>
                </div>
                <a href="${blobUrl}" download="${escapeHtml(fileName)}" class="p2p-dl-btn p2p-dl-btn-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>Download Original File</span>
                </a>
            </div>`;
    }

    wrapper.querySelector('.message-bubble').innerHTML = mediaHTML;

    const msgList = document.getElementById('messageList');
    if (msgList) msgList.scrollTop = msgList.scrollHeight;

    appendToCallChatIfOpen(wrapper.outerHTML);
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}


/* ═══════════════════════════════════════════════════════════════════
   VOICE NOTES (P2P TRANSMISSION)
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
                const voiceFile = new File([blob], `voicenote_${Date.now()}.webm`, { type: 'audio/webm' });
                sendP2PFile(voiceFile);
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
    const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

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
let lastRenderedTime = null;
let dateTrackingString = '';

async function renderMessage(data, isInitialLoad = false) {
    const secretKey = localStorage.getItem('oasis_key');
    const messageList = document.getElementById('messageList');

    let decryptedPayload = '••••••••';
    if (secretKey) decryptedPayload = decryptText(data.encrypted_message, secretKey);

    let msgType = 'TEXT';
    let msgContent = decryptedPayload;

    if (decryptedPayload.startsWith('IMAGE_URL:')) { msgType = 'IMAGE_URL'; msgContent = decryptedPayload.substring(10); }
    else if (decryptedPayload.startsWith('AUDIO_URL:')) { msgType = 'AUDIO_URL'; msgContent = decryptedPayload.substring(10); }
    else if (decryptedPayload.startsWith('IMAGE:')) { msgType = 'IMAGE'; msgContent = decryptedPayload.substring(6); }
    else if (decryptedPayload.startsWith('AUDIO:')) { msgType = 'AUDIO'; msgContent = decryptedPayload.substring(6); }
    else if (decryptedPayload.startsWith('TEXT:')) { msgType = 'TEXT'; msgContent = decryptedPayload.substring(5); }

    const rawTime = data.created_at || new Date().toISOString();
    const date = new Date(rawTime);
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
    const isGrouped = lastRenderedSender === data.sender && timeDiffMins < 2;

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
    lastRenderedTime = date;

    // Resolve encrypted media from storage URLs
    if (msgType === 'IMAGE_URL' || msgType === 'AUDIO_URL') {
        try {
            const res = await fetch(msgContent);
            const encText = await res.text();
            const dec = decryptText(encText, secretKey);
            const el = document.getElementById(bubbleId);
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
        if (msgType === 'TEXT') snippet = msgContent.substring(0, 60);
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
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let str = '';
    if (date.toDateString() === today.toDateString()) str = 'Today';
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
    lastRenderedTime = null;
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
        lastRenderedTime = null;
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
    const dot = document.getElementById('statusDot');
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
    const selfView = document.getElementById('selfView');
    const container = document.getElementById('callScreen');
    if (!selfView || !container) return;

    let dragging = false, startX, startY, initLeft, initTop;

    selfView.addEventListener('mousedown', startDrag);
    selfView.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
        if (e.target.closest('.pip-eye-btn')) return;
        dragging = true;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX; startY = clientY;

        const rect = selfView.getBoundingClientRect();
        const pRect = container.getBoundingClientRect();
        initLeft = rect.left - pRect.left;
        initTop = rect.top - pRect.top;

        selfView.style.transition = 'none';
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);
    }

    function onDrag(e) {
        if (!dragging) return;
        if (e.cancelable) e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const pRect = container.getBoundingClientRect();
        const sRect = selfView.getBoundingClientRect();
        const newLeft = Math.max(8, Math.min(initLeft + (clientX - startX), pRect.width - sRect.width - 8));
        const newTop = Math.max(8, Math.min(initTop + (clientY - startY), pRect.height - sRect.height - 8));

        selfView.style.left = `${newLeft}px`;
        selfView.style.top = `${newTop}px`;
        selfView.style.right = 'auto';
    }

    function stopDrag() {
        if (!dragging) return;
        dragging = false;

        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchend', stopDrag);

        // Snap to nearest corner
        const pRect = container.getBoundingClientRect();
        const sRect = selfView.getBoundingClientRect();
        const curLeft = sRect.left - pRect.left;
        const curTop = sRect.top - pRect.top;
        const snapL = curLeft < (pRect.width - sRect.width) / 2 ? 12 : (pRect.width - sRect.width - 12);
        const snapT = curTop < (pRect.height - sRect.height) / 2 ? 12 : (pRect.height - sRect.height - 12);

        selfView.style.transition = 'left 0.28s cubic-bezier(0.16,1,0.3,1), top 0.28s cubic-bezier(0.16,1,0.3,1)';
        selfView.style.left = `${snapL}px`;
        selfView.style.top = `${snapT}px`;
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
