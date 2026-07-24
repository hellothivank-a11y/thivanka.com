const SUPABASE_URL = 'https://hfkwgumcdgpsqjjwtxik.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jtj7u2jXgqQt1oIC3P-pTg_nsF_foAQ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let peer, localStream, currentCall;
let currentMyId = '';
let partnerPeerId = '';
let currentUsername = 'Hani';
let activeChannel = null;
let presenceChannel = null;
let heartbeatInterval;
let typingTimeout;
let isAudioMuted = false;
let isVideoMuted = false;
let deferredPrompt = null;
let swRegistration = null;

// Register Service Worker for PWA & Push Notifications
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                swRegistration = reg;
                console.log('Oasis Service Worker registered successfully:', reg.scope);
            })
            .catch(err => {
                console.warn('Oasis Service Worker registration failed:', err);
            });
    });
}

// Catch PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) {
        installBtn.style.display = 'flex';
    }
});

// --- SECURE INITIALIZATION ---

// Load initial config from session memory if present
window.addEventListener('DOMContentLoaded', () => {
    updateNotificationButtonState();
    const savedUser = sessionStorage.getItem('oasis_user');
    const savedKey = sessionStorage.getItem('oasis_key');
    const savedPartnerId = sessionStorage.getItem('oasis_partner_id');

    if (savedUser && savedKey) {
        document.getElementById('secretKeyInput').value = savedKey;
        selectUser(savedUser);
        if (savedPartnerId) {
            partnerPeerId = savedPartnerId;
        }
        // Automatically enter space
        enterOasis();
    } else {
        // Run fingerprint generation for default value '1234'
        updateSafetyFingerprint();
    }

    // Set up password field listeners
    document.getElementById('secretKeyInput').addEventListener('input', () => {
        updateSafetyFingerprint();
    });

    // Audio recording button events
    const audioBtn = document.getElementById('audioRecordBtn');
    if (audioBtn) {
        audioBtn.addEventListener('mousedown', startVoiceRecording);
        audioBtn.addEventListener('mouseup', stopVoiceRecording);
        audioBtn.addEventListener('mouseleave', cancelVoiceRecording);
        
        // Touch events for mobile compatibility
        audioBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startVoiceRecording();
        }, { passive: false });
        audioBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopVoiceRecording();
        });
    }

    // Escape key listener for panic mode
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            triggerPanic();
        }
    });

    // Double-click panic restore
    document.getElementById('panicScreen').addEventListener('dblclick', () => {
        restoreFromPanic();
    });

    // Handle clicking outside dropdown
    window.addEventListener('click', () => {
        const menu = document.getElementById('dropdownMenu');
        if (menu && menu.classList.contains('show')) {
            menu.classList.remove('show');
        }
    });

    // Setup Safe Dragging for selfView PIP
    initSelfViewDrag();
});

// Clean-up when window closes
window.addEventListener('beforeunload', () => {
    localStorage.removeItem('oasis_temp_session');
    sessionStorage.clear();
});

// --- ONBOARDING UX FUNCTIONS ---

function selectUser(user) {
    currentUsername = user;
    const options = document.querySelectorAll('.user-option');
    options.forEach(opt => {
        opt.classList.remove('active', 'hani-active', 'bani-active');
        if (opt.innerText === user) {
            opt.classList.add('active');
            opt.classList.add(user === 'Hani' ? 'hani-active' : 'bani-active');
        }
    });
}

function updateSafetyFingerprint() {
    const key = document.getElementById('secretKeyInput').value;
    const fingerprint = generateSafetyFingerprint(key);
    document.getElementById('fingerprintPreview').innerText = fingerprint;
}

// SHA-256 Emoji Fingerprint generator
function generateSafetyFingerprint(key) {
    if (!key) return "🔐✨🌸🤍💎";
    try {
        const hash = CryptoJS.SHA256(key).toString();
        // A curated, cute, premium set of emojis for verification
        const emojiSet = ["❤️", "💖", "✨", "🌸", "🤍", "💎", "🌟", "🌹", "🧸", "🍯", "🦄", "🌈", "🍭", "🍀", "🎀", "🕊️", "🎈", "🔮", "🪐", "🥂"];
        let fingerprint = "";
        for (let i = 0; i < 5; i++) {
            const hexSegment = hash.substr(i * 4, 4);
            const val = parseInt(hexSegment, 16);
            const index = val % emojiSet.length;
            fingerprint += emojiSet[index];
        }
        return fingerprint;
    } catch (e) {
        return "🔐✨🌸🤍💎";
    }
}

function togglePasswordVisibility() {
    const pwdInput = document.getElementById('secretKeyInput');
    const eyeOpen = document.getElementById('eyeOpenIcon');
    const eyeClosed = document.getElementById('eyeClosedIcon');
    
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
    } else {
        pwdInput.type = 'password';
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
    }
}

function enterOasis() {
    const secretKey = document.getElementById('secretKeyInput').value.trim();
    if (!secretKey) {
        showToast("Please enter an Encryption Key.");
        return;
    }

    // Save session (securely in sessionStorage)
    sessionStorage.setItem('oasis_user', currentUsername);
    sessionStorage.setItem('oasis_key', secretKey);
    if (partnerPeerId) {
        sessionStorage.setItem('oasis_partner_id', partnerPeerId);
    }

    // Set UI labels
    document.getElementById('spaceTitle').innerText = `${currentUsername.toUpperCase()}'S OASIS`;
    document.getElementById('headerFingerprint').innerText = generateSafetyFingerprint(secretKey);

    // Hide onboarding panel
    document.getElementById('setupOverlay').classList.add('hidden');

    // Initialize systems
    initPeer();
    loadInitialMessages();
    setupStatusTracking();
    subscribeRealtime();
    setupPresence();
}

function showSettingsSetup() {
    // Show setup screen again to modify key or user
    document.getElementById('setupOverlay').classList.remove('hidden');
}

// --- PWA & PUSH NOTIFICATION HANDLERS ---

function triggerPwaInstall() {
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (isStandalone) {
        showToast("Oasis is already installed as an app! ❤️");
        return;
    }

    const modal = document.getElementById('pwaInstallModal');
    const nativeBox = document.getElementById('pwaNativeInstallBox');
    const iosBox = document.getElementById('pwaIosGuideBox');

    if (deferredPrompt) {
        nativeBox.style.display = 'block';
        iosBox.style.display = 'none';
        modal.classList.add('show');
    } else if (isIos) {
        nativeBox.style.display = 'none';
        iosBox.style.display = 'block';
        modal.classList.add('show');
    } else {
        nativeBox.style.display = 'none';
        iosBox.style.display = 'block';
        modal.classList.add('show');
    }
}

function executeNativePwaInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(choiceResult => {
            if (choiceResult.outcome === 'accepted') {
                showToast('Installing Oasis App...');
            }
            deferredPrompt = null;
            closePwaModal();
        });
    }
}

function closePwaModal() {
    const modal = document.getElementById('pwaInstallModal');
    if (modal) modal.classList.remove('show');
}

function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showToast("Notifications are not supported on this browser.");
        return;
    }

    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            showToast("Push notifications enabled! ❤️");
            updateNotificationButtonState();
        } else if (permission === 'denied') {
            showToast("Notification permission blocked in browser settings.");
        }
    });
}

function updateNotificationButtonState() {
    const btn = document.getElementById('notificationBtn');
    if (btn && 'Notification' in window) {
        if (Notification.permission === 'granted') {
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><polyline points="20 6 9 17 4 12"/></svg> Push Notifications Enabled`;
        }
    }
}

function showBackgroundNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    if (swRegistration && swRegistration.active) {
        swRegistration.active.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: title,
            body: body,
            icon: './icon-192.png'
        });
    } else {
        try {
            new Notification(title, {
                body: body,
                icon: './icon-192.png',
                vibrate: [200, 100, 200]
            });
        } catch (e) {
            console.warn('Fallback notification failed:', e);
        }
    }
}

// --- PEER JS (CALLING & NETWORKING) ---

function initPeer() {
    if (peer) return;

    // Use a clean Peer connection. Default PeerServer cloud instance.
    peer = new Peer();
    
    peer.on('open', id => {
        currentMyId = id;
        document.getElementById('peerInfoDisplay').innerText = "PEER ID: " + id.substring(0, 8) + "...";
        // Track presence
        if (presenceChannel) {
            presenceChannel.track({
                username: currentUsername,
                peerId: id,
                onlineAt: new Date().toISOString()
            });
        }
    });

    peer.on('error', err => {
        console.error("PeerJS error:", err);
        showToast("Connection issue: " + err.type);
    });

    // Accept Incoming call flow
    peer.on('call', call => {
        currentCall = call;
        const partnerName = currentUsername === 'Hani' ? 'Bani' : 'Hani';
        
        // Show incoming call UI
        const incomingModal = document.getElementById('incomingCallModal');
        incomingModal.classList.add('active');
        if (partnerName === 'Bani') {
            incomingModal.classList.add('rose-theme');
        } else {
            incomingModal.classList.remove('rose-theme');
        }
        document.getElementById('callerNameLabel').innerText = partnerName;
        document.getElementById('callStatusLabel').innerText = "Secure Call Request...";

        // Background notification for incoming call
        if (document.hidden) {
            showBackgroundNotification(`Incoming Call from ${partnerName}`, "Tap to answer call in Oasis ❤️");
        }
    });
}

function copyMyId() {
    if (!currentMyId) {
        showToast("Connecting, please wait...");
        return;
    }
    navigator.clipboard.writeText(currentMyId)
        .then(() => showToast("Peer ID copied to clipboard!"))
        .catch(() => showToast("Failed to copy Peer ID"));
}

function pairWithPartner() {
    const partnerId = prompt("Paste your partner's Secure Peer ID:");
    if (!partnerId) return;
    
    partnerPeerId = partnerId.trim();
    sessionStorage.setItem('oasis_partner_id', partnerPeerId);
    showToast("Partner ID paired successfully!");
    
    // Attempt call auto-connection check
    updatePartnerOnlineLabel(true);
}

function initiateCall() {
    if (!partnerPeerId) {
        // Fallback check: ask user
        const partnerId = prompt("Enter Partner's Peer ID to call:");
        if (!partnerId) return;
        partnerPeerId = partnerId.trim();
        sessionStorage.setItem('oasis_partner_id', partnerPeerId);
    }

    showToast("Calling partner...");
    
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        localStream = stream;
        
        // Render local preview
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = stream;
        localVideo.play();

        // Open video window canvas
        document.getElementById('videoCanvas').classList.add('active');
        
        // Call the partner
        const call = peer.call(partnerPeerId, stream);
        currentCall = call;

        setupCallListeners(call);
    }).catch(err => {
        console.error("Camera denied:", err);
        showToast("Call failed: Camera/Microphone access required.");
    });
}

function acceptCall() {
    document.getElementById('incomingCallModal').classList.remove('active');
    document.getElementById('callStatusLabel').innerText = "Answering...";
    
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        localStream = stream;
        
        // Local preview
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = stream;
        localVideo.play();
        
        // Open screen
        document.getElementById('videoCanvas').classList.add('active');

        // Answer partner
        currentCall.answer(stream);
        setupCallListeners(currentCall);
    }).catch(err => {
        console.error("Permission error answering call:", err);
        showToast("Could not access camera/mic.");
        declineCall();
    });
}

function declineCall() {
    document.getElementById('incomingCallModal').classList.remove('active');
    if (currentCall) {
        currentCall.close();
    }
    showToast("Call declined.");
}

function setupCallListeners(call) {
    call.on('stream', remoteStream => {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = remoteStream;
        remoteVideo.play();
        showToast("Call Connected securely!");
    });

    call.on('close', () => {
        cleanUpCall();
    });
    
    call.on('error', err => {
        console.error("Call error:", err);
        cleanUpCall();
    });
}

function cleanUpCall() {
    document.getElementById('videoCanvas').classList.remove('active');
    const remoteVideo = document.getElementById('remoteVideo');
    const localVideo = document.getElementById('localVideo');
    
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    isAudioMuted = false;
    isVideoMuted = false;
    document.getElementById('toggleAudioBtn').classList.remove('off');
    document.getElementById('toggleVideoBtn').classList.remove('off');
    showToast("Call ended.");
}

function endCall() {
    if (currentCall) {
        currentCall.close();
    }
    cleanUpCall();
}

function toggleLocalAudio() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        isAudioMuted = !isAudioMuted;
        audioTrack.enabled = !isAudioMuted;
        
        const btn = document.getElementById('toggleAudioBtn');
        if (isAudioMuted) {
            btn.classList.add('off');
            showToast("Microphone muted");
        } else {
            btn.classList.remove('off');
            showToast("Microphone unmuted");
        }
    }
}

function toggleLocalVideo() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        isVideoMuted = !isVideoMuted;
        videoTrack.enabled = !isVideoMuted;
        
        const btn = document.getElementById('toggleVideoBtn');
        if (isVideoMuted) {
            btn.classList.add('off');
            showToast("Camera disabled");
        } else {
            btn.classList.remove('off');
            showToast("Camera enabled");
        }
    }
}

function toggleFullScreen() {
    const elem = document.getElementById('videoCanvas');
    if (!document.fullscreenElement) {
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

// --- CRYPTOGRAPHIC & MEDIA HELPERS ---

function encryptText(text, key) {
    return CryptoJS.AES.encrypt(text, key).toString();
}

function decryptText(ciphertext, key) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, key);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        return originalText ? originalText : "•••••••• (Invalid Key)";
    } catch (e) {
        return "••••••••";
    }
}

function linkify(inputText) {
    const replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
    let replacedText = inputText.replace(replacePattern1, '<a href="$1" target="_blank">$1</a>');
    const replacePattern2 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
    replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2" target="_blank">$2</a>');
    return replacedText;
}

// --- SECURE CHAT LOGIC ---

async function sendMessage(mediaPayload = null) {
    const secretKey = sessionStorage.getItem('oasis_key');
    const msgInput = document.getElementById('messageInput');
    let text = msgInput.value.trim();

    if (!secretKey) {
        showToast('Encryption key not loaded. Re-authenticate.');
        return;
    }

    let payload = "";
    if (mediaPayload) {
        // mediaPayload format: "IMAGE:data:image/jpeg;base64,..." or "AUDIO:data:audio/webm;base64,..."
        payload = mediaPayload;
    } else {
        if (!text) return;
        payload = `TEXT:${text}`;
    }

    const encryptedMsg = encryptText(payload, secretKey);
    
    if (!mediaPayload) {
        msgInput.value = '';
        msgInput.focus();
        // Clear typing status immediately on send
        broadcastTyping(false);
    }

    const { error } = await supabaseClient
        .from('chat_messages')
        .insert([{ sender: currentUsername, encrypted_message: encryptedMsg }]);

    if (error) {
        showToast("Error sending: " + error.message);
    }
}

function handleInputKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

// Handle typing indicator trigger
function handleInputTyping() {
    broadcastTyping(true);
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        broadcastTyping(false);
    }, 2000);
}

function broadcastTyping(isTyping) {
    if (activeChannel) {
        activeChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { username: currentUsername, isTyping: isTyping }
        });
    }
}

// Image Selection and Encryption
function triggerImageUpload() {
    document.getElementById('imageFileInput').click();
}

function handleImageFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("File must be an image.");
        return;
    }

    showToast("Processing & encrypting image...");

    const reader = new FileReader();
    reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
            // Resize and compress the image locally using a Canvas
            const maxDimension = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG with 0.7 quality
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            
            // Send payload as encrypted message
            sendMessage(`IMAGE:${compressedBase64}`);
            document.getElementById('imageFileInput').value = ''; // Reset input
        };
        img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
}

// Audio Recording (Voice Notes)
function startVoiceRecording() {
    if (isRecording) return;
    
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        isRecording = true;
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Check if recording was canceled
            if (audioChunks.length === 0) return;

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onload = function(evt) {
                const base64Audio = evt.target.result;
                sendMessage(`AUDIO:${base64Audio}`);
            };
            reader.readAsDataURL(audioBlob);
            
            // Stop recording stream tracks
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        document.getElementById('audioRecordBtn').classList.add('recording');
        showToast("Recording... Release to send.");
    }).catch(err => {
        console.error("Audio recording permission issue:", err);
        showToast("Audio recording access denied.");
    });
}

function stopVoiceRecording() {
    if (!isRecording) return;
    isRecording = false;
    document.getElementById('audioRecordBtn').classList.remove('recording');
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        showToast("Voice note sent.");
    }
}

function cancelVoiceRecording() {
    if (!isRecording) return;
    isRecording = false;
    document.getElementById('audioRecordBtn').classList.remove('recording');
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        audioChunks = []; // clear chunks so it isn't sent
        mediaRecorder.stop();
        showToast("Voice note canceled.");
    }
}

// Playback Audio Notes
function playAudioMsg(btn, audioSrc) {
    const wrapper = btn.closest('.audio-player-wrapper');
    const progressBar = wrapper.querySelector('.audio-progress-bar');
    const durationLabel = wrapper.querySelector('.audio-duration');
    
    // Check if there is an existing audio tag
    let audio = wrapper.querySelector('audio');
    if (!audio) {
        audio = new Audio(audioSrc);
        wrapper.appendChild(audio);
        
        audio.addEventListener('timeupdate', () => {
            const percent = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = `${percent}%`;
            
            // update duration
            const formatTime = (time) => {
                const mins = Math.floor(time / 60);
                const secs = Math.floor(time % 60);
                return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            };
            durationLabel.innerText = formatTime(audio.currentTime);
        });

        audio.addEventListener('loadedmetadata', () => {
            const formatTime = (time) => {
                const mins = Math.floor(time / 60);
                const secs = Math.floor(time % 60);
                return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            };
            durationLabel.innerText = formatTime(audio.duration);
        });

        audio.addEventListener('ended', () => {
            progressBar.style.width = '0%';
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

// Render Messages & Message Grouping & Layout
let lastRenderedSender = null;
let lastRenderedTime = null;

function renderMessage(data, isInitialLoad = false) {
    const secretKey = sessionStorage.getItem('oasis_key');
    const messageList = document.getElementById('messageList');

    let decryptedPayload = "••••••••";
    if (secretKey) {
        decryptedPayload = decryptText(data.encrypted_message, secretKey);
    }

    // Determine type: TEXT, IMAGE, or AUDIO
    let msgType = 'TEXT';
    let msgContent = decryptedPayload;

    if (decryptedPayload.startsWith('IMAGE:')) {
        msgType = 'IMAGE';
        msgContent = decryptedPayload.substring(6);
    } else if (decryptedPayload.startsWith('AUDIO:')) {
        msgType = 'AUDIO';
        msgContent = decryptedPayload.substring(6);
    } else if (decryptedPayload.startsWith('TEXT:')) {
        msgType = 'TEXT';
        msgContent = decryptedPayload.substring(5);
    }

    const rawTime = data.created_at || new Date().toISOString();
    const date = new Date(rawTime);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Determine date header
    const dateDivider = checkAndGetDateDivider(date);
    if (dateDivider) {
        const divElement = document.createElement('div');
        divElement.className = 'date-divider';
        divElement.innerHTML = `<div class="date-divider-line"></div><div class="date-divider-text">${dateDivider}</div><div class="date-divider-line"></div>`;
        messageList.appendChild(divElement);
    }

    // Check if we should group this message with the previous one
    const isSelf = data.sender === currentUsername;
    const timeDiffMinutes = lastRenderedTime ? Math.abs(date - lastRenderedTime) / 60000 : 999;
    const isGrouped = lastRenderedSender === data.sender && timeDiffMinutes < 2;

    const msgWrapper = document.createElement('div');
    msgWrapper.className = `msg-wrapper ${isSelf ? 'sent' : 'received'}`;
    
    // Grouping adjustments
    if (isGrouped) {
        msgWrapper.style.marginTop = '4px';
    }

    let innerHTML = "";
    
    // Add username header only if not grouped and received
    if (!isGrouped && !isSelf) {
        innerHTML += `<div class="sender-tag">${data.sender}</div>`;
    }

    // Prepare message bubble core
    let bubbleContent = "";
    if (msgType === 'IMAGE') {
        bubbleContent = `<img src="${msgContent}" class="msg-image" onclick="zoomImage('${msgContent}')" alt="Encrypted image attachment">`;
    } else if (msgType === 'AUDIO') {
        bubbleContent = `
            <div class="audio-player-wrapper">
                <button class="audio-control-btn" onclick="playAudioMsg(this, '${msgContent}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
                <div class="audio-progress">
                    <div class="audio-progress-bar"></div>
                </div>
                <div class="audio-duration">0:00</div>
            </div>
        `;
    } else {
        bubbleContent = `<div>${linkify(msgContent)}</div>`;
    }

    innerHTML += `<div class="msg-bubble">${bubbleContent}</div>`;

    // Only render time label if not grouped, or if it's the last message in a cluster
    if (!isInitialLoad || !isGrouped) {
        innerHTML += `<div class="msg-meta-row"><span>${timeString}</span></div>`;
    }

    msgWrapper.innerHTML = innerHTML;
    messageList.appendChild(msgWrapper);
    
    // Scroll to bottom
    messageList.scrollTop = messageList.scrollHeight;

    lastRenderedSender = data.sender;
    lastRenderedTime = date;

    // Trigger push notification if message is from partner and tab is hidden
    if (!isInitialLoad && data.sender !== currentUsername && document.hidden) {
        let notificationSnippet = "Sent a message";
        if (msgType === 'TEXT') notificationSnippet = msgContent;
        else if (msgType === 'IMAGE') notificationSnippet = "📷 Sent an image";
        else if (msgType === 'AUDIO') notificationSnippet = "🎵 Sent a voice note";

        showBackgroundNotification(`New message from ${data.sender}`, notificationSnippet);
    }
}

// Manage Date Boundaries in Chat View
let dateTrackingString = "";
function checkAndGetDateDivider(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateStr = "";
    if (date.toDateString() === today.toDateString()) {
        dateStr = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
        dateStr = "Yesterday";
    } else {
        dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }

    if (dateStr !== dateTrackingString) {
        dateTrackingString = dateStr;
        return dateStr;
    }
    return null;
}

async function loadInitialMessages() {
    const messageList = document.getElementById('messageList');
    messageList.innerHTML = '';
    
    lastRenderedSender = null;
    lastRenderedTime = null;
    dateTrackingString = "";

    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(80);
        
    if (error) {
        console.error("Failed to load chat logs:", error.message);
        return;
    }

    if (data) {
        data.forEach(msg => renderMessage(msg, true));
    }
}

async function clearAllMessages() {
    if (confirm("Are you absolutely sure you want to wipe the secure chat history? This cannot be undone.")) {
        const { error } = await supabaseClient.from('chat_messages').delete().neq('id', 0);
        if (error) {
            showToast("Wipe error: " + error.message);
        } else {
            document.getElementById('messageList').innerHTML = '';
            showToast("Chat history completely cleared.");
            lastRenderedSender = null;
            lastRenderedTime = null;
            dateTrackingString = "";
        }
    }
}

// Image lightbox operations
function zoomImage(src) {
    const modal = document.getElementById('imageModal');
    const target = document.getElementById('imageModalTarget');
    target.src = src;
    modal.classList.add('show');
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.remove('show');
}

// --- STATUS & HEARTBEAT TRACKING ---

async function updateMyStatus() {
    try {
        await supabaseClient.from('online_status').upsert({ 
            username: currentUsername, 
            last_seen: new Date().toISOString() 
        });
    } catch (e) {
        // Silence errors here to avoid UI prompts if the table schema doesn't exist
    }
}

async function checkPartnerStatus() {
    // If Presence is running, rely on that for immediate feedback.
    // Otherwise fallback to querying table.
    const partnerUsername = currentUsername === 'Hani' ? 'Bani' : 'Hani';

    const { data } = await supabaseClient
        .from('online_status')
        .select('last_seen')
        .eq('username', partnerUsername)
        .maybeSingle();

    if (data && data.last_seen) {
        const lastSeenTime = new Date(data.last_seen).getTime();
        const now = new Date().getTime();
        
        // If updated within last 15 seconds, partner is active
        if ((now - lastSeenTime) < 15000) {
            updatePartnerOnlineLabel(true);
            return;
        }
    }
    
    // Only set offline if presence state also confirms offline
    if (!partnerPeerId) {
        updatePartnerOnlineLabel(false);
    }
}

function updatePartnerOnlineLabel(isOnline) {
    const statusDot = document.getElementById('statusDot');
    const label = document.getElementById('partnerStatusLabel');
    const appContainer = document.getElementById('appContainer');
    
    statusDot.className = 'status-dot';
    appContainer.style.setProperty('--glow-color', 'transparent');

    if (isOnline) {
        label.innerText = "Online";
        if (currentUsername === 'Hani') {
            statusDot.classList.add('online-rose'); // Bani is Online (Bani's color is Rose)
            appContainer.style.setProperty('--glow-color', 'rgba(244, 63, 94, 0.18)');
        } else {
            statusDot.classList.add('online-cyan'); // Hani is Online (Hani's color is Cyan)
            appContainer.style.setProperty('--glow-color', 'rgba(6, 182, 212, 0.18)');
        }
    } else {
        label.innerText = "Offline";
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

// --- BROADCAST & PRESENCE (SUPABASE REALTIME) ---

function subscribeRealtime() {
    if (activeChannel) {
        supabaseClient.removeChannel(activeChannel);
    }

    activeChannel = supabaseClient.channel('public:chat_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
            renderMessage(payload.new);
        })
        .on('broadcast', { event: 'typing' }, payload => {
            const partner = currentUsername === 'Hani' ? 'Bani' : 'Hani';
            if (payload.payload.username === partner) {
                const indicator = document.getElementById('typingIndicator');
                if (payload.payload.isTyping) {
                    indicator.style.display = 'flex';
                } else {
                    indicator.style.display = 'none';
                }
            }
        })
        .subscribe();
}

function setupPresence() {
    if (presenceChannel) {
        supabaseClient.removeChannel(presenceChannel);
    }

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
                    sessionStorage.setItem('oasis_partner_id', partnerPeerId);
                }
                updatePartnerOnlineLabel(true);
            } else {
                // If they left presence, verify via database check
                checkPartnerStatus();
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED' && currentMyId) {
                await presenceChannel.track({
                    username: currentUsername,
                    peerId: currentMyId,
                    onlineAt: new Date().toISOString()
                });
            }
        });
}

// --- UI STUFF ---

function toggleMenu(e) {
    e.stopPropagation();
    document.getElementById('dropdownMenu').classList.toggle('show');
}

function showToast(message) {
    const toast = document.getElementById('toastMessage');
    toast.innerText = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Safe dragging implementation for PIP
function initSelfViewDrag() {
    const selfView = document.getElementById("selfView");
    const videoCanvas = document.getElementById("videoCanvas");
    let isDragging = false;
    let offsetStartX, offsetStartY, initialLeft, initialTop;

    selfView.addEventListener("mousedown", startDrag);
    selfView.addEventListener("touchstart", startDrag, { passive: false });

    function startDrag(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        offsetStartX = clientX;
        offsetStartY = clientY;
        
        const rect = selfView.getBoundingClientRect();
        const parentRect = videoCanvas.getBoundingClientRect();
        
        initialLeft = rect.left - parentRect.left;
        initialTop = rect.top - parentRect.top;

        document.addEventListener("mousemove", onDrag);
        document.addEventListener("touchmove", onDrag, { passive: false });
        document.addEventListener("mouseup", stopDrag);
        document.addEventListener("touchend", stopDrag);
    }

    function onDrag(e) {
        if (!isDragging) return;
        if (e.cancelable) e.preventDefault();
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const deltaX = clientX - offsetStartX;
        const deltaY = clientY - offsetStartY;

        const parentRect = videoCanvas.getBoundingClientRect();
        const rect = selfView.getBoundingClientRect();

        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;

        // Clamping to screen boundary safely
        newLeft = Math.max(8, Math.min(newLeft, parentRect.width - rect.width - 8));
        newTop = Math.max(8, Math.min(newTop, parentRect.height - rect.height - 8));

        selfView.style.left = `${newLeft}px`;
        selfView.style.top = `${newTop}px`;
        selfView.style.right = 'auto';
    }

    function stopDrag() {
        if (!isDragging) return;
        isDragging = false;
        
        document.removeEventListener("mousemove", onDrag);
        document.removeEventListener("touchmove", onDrag);

        // Snap to nearest corner (top-left, top-right, bottom-left, bottom-right)
        const parentRect = videoCanvas.getBoundingClientRect();
        const rect = selfView.getBoundingClientRect();
        
        const currentLeft = rect.left - parentRect.left;
        const currentTop = rect.top - parentRect.top;
        
        const snapLeft = currentLeft < (parentRect.width - rect.width) / 2 ? 12 : (parentRect.width - rect.width - 12);
        const snapTop = currentTop < (parentRect.height - rect.height) / 2 ? 12 : (parentRect.height - rect.height - 12);
        
        selfView.style.transition = 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1), top 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        selfView.style.left = `${snapLeft}px`;
        selfView.style.top = `${snapTop}px`;
        
        setTimeout(() => {
            selfView.style.transition = 'transform 0.2s ease, border-color 0.3s';
        }, 300);
    }
}

// --- PANIC MODE & LOCKING ---

function triggerPanic() {
    const panicScreen = document.getElementById('panicScreen');
    panicScreen.classList.add('show');
    
    // End active calling and streams
    endCall();
    
    // Clean memory
    sessionStorage.clear();
    
    // Clear list from DOM so nothing is visible on screen
    document.getElementById('messageList').innerHTML = '';
}

function restoreFromPanic() {
    const phrase = prompt("Enter Unlock Key:");
    if (!phrase) return;
    
    // Reset key and restore setup
    document.getElementById('secretKeyInput').value = phrase;
    document.getElementById('panicScreen').classList.remove('show');
    showSettingsSetup();
    updateSafetyFingerprint();
}
