/* ════════════════════════════════════════════════════════════════
   CONNECT — Honey & Bunny  |  Full App Logic
   ════════════════════════════════════════════════════════════════ */

// ── Configuration ───────────────────────────────────────────────
const SUPABASE_URL = "https://ufiwakxqrepwnngspjxv.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ft_wdmxDIjL9ngoihVFKPA_EnYoD3r8";

// User credentials  { name, emoji, passcode }
const USERS = {
    Honey: { emoji: "🍯", passcode: "1234", partner: "Bunny" },
    Bunny: { emoji: "🐰", passcode: "5678", partner: "Honey" }
};

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

// ── State ────────────────────────────────────────────────────────
let sb = null;  // Supabase client (renamed to avoid conflict with window.supabase CDN global)
let currentUser = null;         // "Honey" | "Bunny"
let partnerUser = null;
let localStream = null;
let peerConnection = null;
let currentCallId = null;
let pendingCall = null;         // incoming call record
let isMuted = false;
let isCameraOff = false;
let callTimerInterval = null;
let callStartTime = null;
let typedPasscode = "";
let selectedUser = "Honey";
let unreadCount = 0;
let chatOpen = true;

// Channel references
let chatChannel = null;
let callChannel = null;
let presenceChannel = null;

// ════════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════════
window.addEventListener("DOMContentLoaded", () => {
    // The Supabase CDN exposes window.supabase as the namespace with createClient on it
    const supabaseLib = window.supabase ?? window.supabaseJs;
    if (!supabaseLib || !supabaseLib.createClient) {
        alert("Supabase library failed to load. Check your internet connection.");
        return;
    }
    sb = supabaseLib.createClient(SUPABASE_URL, SUPABASE_KEY);

    selectUser("Honey");
    initPipDrag();  // Init AFTER DOM is ready
});

// ════════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════════
function selectUser(name) {
    selectedUser = name;
    typedPasscode = "";
    updateDots();

    // Update button states
    document.getElementById("btn-honey").classList.toggle("active", name === "Honey");
    document.getElementById("btn-honey").setAttribute("aria-pressed", name === "Honey");
    document.getElementById("btn-bunny").classList.toggle("active", name === "Bunny");
    document.getElementById("btn-bunny").setAttribute("aria-pressed", name === "Bunny");

    hidePasscodeError();
}

function pressNum(n) {
    if (typedPasscode.length >= 4) return;
    typedPasscode += n;
    updateDots();

    if (typedPasscode.length === 4) {
        // Small delay for UX — show last dot filled before validating
        setTimeout(() => attemptLogin(), 180);
    }
}

function deleteNum() {
    if (!typedPasscode.length) return;
    typedPasscode = typedPasscode.slice(0, -1);
    updateDots();
    hidePasscodeError();
}

function updateDots() {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(`dot-${i}`);
        dot.classList.remove("filled", "error");
        if (i < typedPasscode.length) dot.classList.add("filled");
    }
}

function showPasscodeError() {
    for (let i = 0; i < 4; i++) {
        document.getElementById(`dot-${i}`).classList.add("error");
    }
    document.getElementById("passcode-error").classList.remove("hidden");
    setTimeout(() => {
        typedPasscode = "";
        updateDots();
        hidePasscodeError();
    }, 900);
}

function hidePasscodeError() {
    document.getElementById("passcode-error").classList.add("hidden");
}

function attemptLogin() {
    const expected = USERS[selectedUser].passcode;
    if (typedPasscode === expected) {
        currentUser = selectedUser;
        partnerUser = USERS[currentUser].partner;
        launchApp();
    } else {
        showPasscodeError();
    }
}

// ── Keyboard support ────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
    if (!document.getElementById("login-screen").classList.contains("hidden")) {
        // Login screen keyboard
        if (e.key >= "0" && e.key <= "9") pressNum(e.key);
        if (e.key === "Backspace") deleteNum();
    }
});

// ════════════════════════════════════════════════════════════════
//  APP LAUNCH
// ════════════════════════════════════════════════════════════════
function launchApp() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");

    updateTopBar();
    updateIdleState();
    initChat();
    listenForCalls();
    broadcastPresence();
    watchPartnerPresence();
}

function updateTopBar() {
    const me = USERS[currentUser];
    document.getElementById("top-avatar").textContent = me.emoji;
    document.getElementById("top-name").textContent = currentUser;
}

function updateIdleState() {
    const partner = USERS[partnerUser];
    document.getElementById("idle-partner-avatar").textContent = partner.emoji;
    document.getElementById("idle-partner-name").textContent = partnerUser;
    document.getElementById("chat-header-avatar").textContent = partner.emoji;
    document.getElementById("chat-header-name").textContent = partnerUser;
}

// ════════════════════════════════════════════════════════════════
//  PRESENCE
// ════════════════════════════════════════════════════════════════
function broadcastPresence() {
    if (presenceChannel) presenceChannel.unsubscribe();

    presenceChannel = sb.channel(`presence:${currentUser}`, {
        config: { presence: { key: currentUser } }
    });

    presenceChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
            await presenceChannel.track({ user: currentUser, online_at: new Date().toISOString() });
        }
    });
}

function watchPartnerPresence() {
    const watchCh = sb.channel(`presence:${partnerUser}`, {
        config: { presence: { key: partnerUser } }
    });

    watchCh.on("presence", { event: "sync" }, () => {
        const state = watchCh.presenceState();
        const isOnline = Object.keys(state).length > 0;
        setPartnerOnline(isOnline);
    }).on("presence", { event: "join" }, () => {
        setPartnerOnline(true);
    }).on("presence", { event: "leave" }, () => {
        setPartnerOnline(false);
    }).subscribe();
}

function setPartnerOnline(online) {
    const dot = document.getElementById("status-dot");
    const text = document.getElementById("status-text");
    dot.classList.toggle("online", online);
    text.textContent = online ? "Online" : "Offline";
    document.getElementById("chat-header-status").textContent = online ? "Active now" : "Offline";
}

// ════════════════════════════════════════════════════════════════
//  CHAT
// ════════════════════════════════════════════════════════════════
async function initChat() {
    // Load history
    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);

    if (error) {
        console.error("Error loading messages:", error);
    }

    const container = document.getElementById("chat-messages");
    container.innerHTML = "";

    if (data && data.length > 0) {
        data.forEach(renderMessage);
    } else {
        renderEmptyChat();
    }

    // Realtime listener
    if (chatChannel) chatChannel.unsubscribe();
    chatChannel = sb.channel("public:messages")
        .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "messages"
        }, payload => {
            // Remove empty state if present
            const empty = document.getElementById("chat-empty");
            if (empty) empty.remove();

            renderMessage(payload.new);

            // Badge if chat is closed and it's not our own message
            if (!chatOpen && payload.new.sender !== currentUser) {
                unreadCount++;
                updateBadge();
            }
        })
        .subscribe();
}

function renderEmptyChat() {
    const container = document.getElementById("chat-messages");
    container.innerHTML = `
        <div class="chat-empty" id="chat-empty">
            <div class="chat-empty-icon">💬</div>
            <p class="chat-empty-text">No messages yet.<br>Say hi to ${partnerUser}! 🌸</p>
        </div>
    `;
}

function renderMessage(msg) {
    const isMe = msg.sender === currentUser;
    const container = document.getElementById("chat-messages");

    // Remove empty state
    const empty = document.getElementById("chat-empty");
    if (empty) empty.remove();

    const wrapper = document.createElement("div");
    wrapper.classList.add("message-wrapper", isMe ? "me" : "them");

    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    wrapper.innerHTML = `
        <div class="message">${escapeHtml(msg.content)}</div>
        <div class="message-meta">${time}</div>
    `;

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById("msg-input");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";

    const { error } = await supabase
        .from("messages")
        .insert([{ sender: currentUser, content: text }]);

    if (error) {
        showToast("⚠️ Could not send message");
        console.error("Send error:", error);
    }
}

function handleKeyPress(e) {
    if (e.key === "Enter") sendMessage();
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ════════════════════════════════════════════════════════════════
//  CHAT PANEL TOGGLE
// ════════════════════════════════════════════════════════════════
function toggleChat() {
    chatOpen = !chatOpen;
    document.getElementById("chat-panel").classList.toggle("collapsed", !chatOpen);

    if (chatOpen) {
        // Clear badge
        unreadCount = 0;
        updateBadge();
    }
}

function updateBadge() {
    const badge = document.getElementById("chat-badge");
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? "9+" : unreadCount;
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

// ════════════════════════════════════════════════════════════════
//  WEBRTC — START CALL (Caller)
// ════════════════════════════════════════════════════════════════
async function startCall(type) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: type === "video",
            audio: true
        });
        document.getElementById("local-video").srcObject = localStream;

        peerConnection = createPeerConnection();
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Save to Supabase
        const { data, error } = await supabase
            .from("calls")
            .insert([{
                type,
                status: "pending",
                caller: currentUser,
                offer: { type: offer.type, sdp: offer.sdp }
            }])
            .select()
            .single();

        if (error || !data) {
            console.error("Could not create call:", error);
            showToast("⚠️ Could not start call");
            return;
        }

        currentCallId = data.id;

        // Collect ICE candidates and store them
        const callerCandidates = [];
        peerConnection.onicecandidate = async (e) => {
            if (e.candidate) {
                callerCandidates.push(e.candidate.toJSON());
                await supabase
                    .from("calls")
                    .update({ caller_candidates: callerCandidates })
                    .eq("id", currentCallId);
            }
        };

        // Wait for answer
        if (callChannel) callChannel.unsubscribe();
        callChannel = sb.channel(`call:${currentCallId}`)
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "calls",
                filter: `id=eq.${currentCallId}`
            }, async payload => {
                const call = payload.new;

                if (call.answer && !peerConnection.currentRemoteDescription) {
                    await peerConnection.setRemoteDescription(
                        new RTCSessionDescription(call.answer)
                    );
                }

                // Add remote ICE candidates
                if (call.callee_candidates && Array.isArray(call.callee_candidates)) {
                    for (const c of call.callee_candidates) {
                        try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); }
                        catch (err) { /* already added */ }
                    }
                }

                if (call.status === "ended") {
                    endCall(true);
                }
            })
            .subscribe();

        setInCallUI(true, type);
        showToast(`📞 Calling ${partnerUser}…`);

    } catch (err) {
        console.error("startCall error:", err);
        showToast("❌ Camera/mic access denied");
    }
}

// ════════════════════════════════════════════════════════════════
//  WEBRTC — LISTEN FOR INCOMING CALLS
// ════════════════════════════════════════════════════════════════
function listenForCalls() {
    sb.channel("public:calls:incoming")
        .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "calls"
        }, payload => {
            const call = payload.new;
            // Ignore calls we made ourselves
            if (call.caller === currentUser) return;
            if (call.status !== "pending") return;

            showIncomingCallUI(call);
        })
        .subscribe();
}

function showIncomingCallUI(call) {
    pendingCall = call;
    const callerInfo = USERS[call.caller] ?? { emoji: "📞" };

    document.getElementById("incoming-avatar").textContent = callerInfo.emoji;
    document.getElementById("incoming-name").textContent = call.caller;
    document.getElementById("incoming-type").textContent =
        call.type === "video" ? "FaceTime Video" : "Voice Call";

    document.getElementById("incoming-call-overlay").classList.remove("hidden");
}

function declineCall() {
    if (pendingCall) {
        sb.from("calls").update({ status: "declined" }).eq("id", pendingCall.id);
        pendingCall = null;
    }
    document.getElementById("incoming-call-overlay").classList.add("hidden");
    showToast("📵 Call declined");
}

async function acceptCall() {
    if (!pendingCall) return;
    const call = pendingCall;
    pendingCall = null;
    document.getElementById("incoming-call-overlay").classList.add("hidden");

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: call.type === "video",
            audio: true
        });
        document.getElementById("local-video").srcObject = localStream;

        peerConnection = createPeerConnection();
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(call.offer)
        );

        // Add caller's ICE candidates if already available
        if (call.caller_candidates && Array.isArray(call.caller_candidates)) {
            for (const c of call.caller_candidates) {
                try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); }
                catch (err) { /* ignore */ }
            }
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        currentCallId = call.id;

        // Collect callee ICE candidates
        const calleeCandidates = [];
        peerConnection.onicecandidate = async (e) => {
            if (e.candidate) {
                calleeCandidates.push(e.candidate.toJSON());
                await supabase
                    .from("calls")
                    .update({ callee_candidates: calleeCandidates })
                    .eq("id", currentCallId);
            }
        };

        // Watch for status = "ended" from caller
        if (callChannel) callChannel.unsubscribe();
        callChannel = sb.channel(`call:answer:${currentCallId}`)
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "calls",
                filter: `id=eq.${currentCallId}`
            }, async payload => {
                const updated = payload.new;

                // Sync late caller candidates
                if (updated.caller_candidates && Array.isArray(updated.caller_candidates)) {
                    for (const c of updated.caller_candidates) {
                        try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); }
                        catch (err) { /* ignore */ }
                    }
                }

                if (updated.status === "ended") {
                    endCall(true);
                }
            })
            .subscribe();

        // Push answer back
        await sb.from("calls").update({
            answer: { type: answer.type, sdp: answer.sdp },
            status: "active"
        }).eq("id", currentCallId);

        setInCallUI(true, call.type);

    } catch (err) {
        console.error("acceptCall error:", err);
        showToast("❌ Camera/mic access denied");
    }
}

// ════════════════════════════════════════════════════════════════
//  WEBRTC — PEER CONNECTION FACTORY
// ════════════════════════════════════════════════════════════════
function createPeerConnection() {
    const pc = new RTCPeerConnection(rtcConfig);

    pc.ontrack = (e) => {
        const remoteVideo = document.getElementById("remote-video");
        remoteVideo.srcObject = e.streams[0];
        document.getElementById("idle-state").classList.add("hidden");
    };

    pc.oniceconnectionstatechange = () => {
        console.log("ICE state:", pc.iceConnectionState);
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
            showToast("⚠️ Connection lost");
        }
    };

    return pc;
}

// ════════════════════════════════════════════════════════════════
//  CALL CONTROLS
// ════════════════════════════════════════════════════════════════
function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });

    const btn = document.getElementById("btn-mute");
    btn.classList.toggle("muted", isMuted);
    btn.setAttribute("aria-pressed", isMuted);
    btn.title = isMuted ? "Unmute" : "Mute";

    document.getElementById("mic-icon").innerHTML = isMuted
        ? `<path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M9 5v2m6-2v2M3 3l18 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`
        : `<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 008 8.94V23h2v-2.06A9 9 0 0021 12v-2h-2z"/>`;

    showToast(isMuted ? "🔇 Muted" : "🎙️ Unmuted");
}

function toggleCamera() {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    if (!videoTracks.length) return;

    isCameraOff = !isCameraOff;
    videoTracks.forEach(t => { t.enabled = !isCameraOff; });

    const btn = document.getElementById("btn-camera");
    btn.classList.toggle("cam-off", isCameraOff);
    btn.setAttribute("aria-pressed", isCameraOff);
    btn.title = isCameraOff ? "Turn On Camera" : "Turn Off Camera";

    document.getElementById("camera-icon").innerHTML = isCameraOff
        ? `<path d="M18.42 5.6L21 8.18V16l-4-2v.82L4.18 3H4a2 2 0 00-2 2v10a2 2 0 002 2h10.82l3.6 3.6 1.08-1.08L17.34 18H20a2 2 0 002-2V8a2 2 0 00-.58-1.42L20 5.18l-1.58 1.58L19 8.18v7.64L7.18 4H16a2 2 0 011.42.58L19 6.18l-.58-.58z" fill="currentColor"/>
        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`
        : `<path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>`;

    showToast(isCameraOff ? "📵 Camera off" : "📹 Camera on");
}

async function endCall(remote = false) {
    // Signal other side if we are ending
    if (!remote && currentCallId) {
        await sb.from("calls").update({ status: "ended" }).eq("id", currentCallId);
    }

    // Cleanup
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (callChannel) { callChannel.unsubscribe(); callChannel = null; }

    document.getElementById("remote-video").srcObject = null;
    document.getElementById("local-video").srcObject = null;
    currentCallId = null;
    isMuted = false;
    isCameraOff = false;

    setInCallUI(false, null);
    showToast(remote ? `${partnerUser} ended the call` : "Call ended");
}

// ════════════════════════════════════════════════════════════════
//  UI STATE
// ════════════════════════════════════════════════════════════════
function setInCallUI(inCall, callType) {
    document.getElementById("controls-idle").classList.toggle("hidden", inCall);
    document.getElementById("controls-in-call").classList.toggle("hidden", !inCall);
    document.getElementById("idle-state").classList.toggle("hidden", inCall);

    if (inCall) {
        startCallTimer();
        // Hide camera button for audio-only calls
        if (callType === "audio") {
            document.getElementById("btn-camera").style.display = "none";
        } else {
            document.getElementById("btn-camera").style.display = "";
        }
    } else {
        stopCallTimer();
        document.getElementById("idle-state").classList.remove("hidden");
        // Reset mute/camera button states
        document.getElementById("btn-mute").classList.remove("muted");
        document.getElementById("btn-camera").classList.remove("cam-off");
        document.getElementById("btn-camera").style.display = "";
    }
}

// ── Call Timer ──────────────────────────────────────────────────
function startCallTimer() {
    callStartTime = Date.now();
    document.getElementById("call-timer").classList.remove("hidden");
    callTimerInterval = setInterval(updateTimer, 1000);
}

function stopCallTimer() {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
    document.getElementById("call-timer").classList.add("hidden");
    document.getElementById("timer-text").textContent = "0:00";
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    document.getElementById("timer-text").textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

// ════════════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════════════
let toastTimeout = null;

function showToast(msg, duration = 2600) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    // Trigger reflow for animation
    void toast.offsetWidth;
    toast.classList.add("show");

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.classList.add("hidden"), 400);
    }, duration);
}

// ════════════════════════════════════════════════════════════════
//  PiP DRAG (local video tile)
// ════════════════════════════════════════════════════════════════
function initPipDrag() {
    const pip = document.getElementById("local-pip");
    let dragging = false, ox = 0, oy = 0;

    pip.addEventListener("mousedown", e => {
        dragging = true;
        ox = e.clientX - pip.offsetLeft;
        oy = e.clientY - pip.offsetTop;
        pip.style.transition = "none";
        pip.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", e => {
        if (!dragging) return;
        let x = e.clientX - ox;
        let y = e.clientY - oy;
        const maxX = window.innerWidth - pip.offsetWidth;
        const maxY = window.innerHeight - pip.offsetHeight;
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));
        pip.style.left = `${x}px`;
        pip.style.top = `${y}px`;
        pip.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
        dragging = false;
        pip.style.transition = "";
        pip.style.cursor = "grab";
    });

    // Touch support
    pip.addEventListener("touchstart", e => {
        const t = e.touches[0];
        dragging = true;
        ox = t.clientX - pip.offsetLeft;
        oy = t.clientY - pip.offsetTop;
        pip.style.transition = "none";
    }, { passive: true });

    document.addEventListener("touchmove", e => {
        if (!dragging) return;
        const t = e.touches[0];
        let x = t.clientX - ox;
        let y = t.clientY - oy;
        const maxX = window.innerWidth - pip.offsetWidth;
        const maxY = window.innerHeight - pip.offsetHeight;
        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));
        pip.style.left = `${x}px`;
        pip.style.top = `${y}px`;
        pip.style.right = "auto";
    }, { passive: true });

    document.addEventListener("touchend", () => {
        dragging = false;
        pip.style.transition = "";
    });
}
