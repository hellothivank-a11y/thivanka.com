/* ════════════════════════════════════════════════════════════════
   CONNECT — Honey & Bunny  |  Full App Logic (STABLE WEBRTC)
   ════════════════════════════════════════════════════════════════ */

// ── Configuration ───────────────────────────────────────────────
const SUPABASE_URL = "https://ufiwakxqrepwnngspjxv.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ft_wdmxDIjL9ngoihVFKPA_EnYoD3r8";

// User credentials { name, emoji, passcode }
const USERS = {
    Honey: { emoji: "🍯", passcode: "1234", partner: "Bunny" },
    Bunny: { emoji: "🐰", passcode: "5678", partner: "Honey" }
};

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
    ]
};

// ── State ────────────────────────────────────────────────────────
let sb = null;  
let currentUser = null;         
let partnerUser = null;
let localStream = null;
let peerConnection = null;
let currentCallId = null;
let pendingCall = null;         
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
    const supabaseLib = window.supabase ?? window.supabaseJs;
    if (!supabaseLib || !supabaseLib.createClient) {
        alert("Supabase library failed to load. Check your internet connection.");
        return;
    }
    sb = supabaseLib.createClient(SUPABASE_URL, SUPABASE_KEY);

    selectUser("Honey");
    initPipDrag();  
});

// ════════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════════
function selectUser(name) {
    selectedUser = name;
    typedPasscode = "";
    updateDots();

    const btnH = document.getElementById("btn-honey");
    const btnB = document.getElementById("btn-bunny");
    if(btnH) {
        btnH.classList.toggle("active", name === "Honey");
        btnH.setAttribute("aria-pressed", name === "Honey");
    }
    if(btnB) {
        btnB.classList.toggle("active", name === "Bunny");
        btnB.setAttribute("aria-pressed", name === "Bunny");
    }

    hidePasscodeError();
}

function pressNum(n) {
    if (typedPasscode.length >= 4) return;
    typedPasscode += n;
    updateDots();

    if (typedPasscode.length === 4) {
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
        if(dot) {
            dot.classList.remove("filled", "error");
            if (i < typedPasscode.length) dot.classList.add("filled");
        }
    }
}

function showPasscodeError() {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if(dot) dot.classList.add("error");
    }
    const err = document.getElementById("passcode-error");
    if(err) err.classList.remove("hidden");
    setTimeout(() => {
        typedPasscode = "";
        updateDots();
        hidePasscodeError();
    }, 900);
}

function hidePasscodeError() {
    const err = document.getElementById("passcode-error");
    if(err) err.classList.add("hidden");
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

document.addEventListener("keydown", (e) => {
    const loginScreen = document.getElementById("login-screen");
    if (loginScreen && !loginScreen.classList.contains("hidden")) {
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
    if(dot) dot.classList.toggle("online", online);
    if(text) text.textContent = online ? "Online" : "Offline";
    const headerStatus = document.getElementById("chat-header-status");
    if(headerStatus) headerStatus.textContent = online ? "Active now" : "Offline";
}

// ════════════════════════════════════════════════════════════════
//  CHAT
// ════════════════════════════════════════════════════════════════
async function initChat() {
    const { data, error } = await sb
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);

    if (error) console.error("Error loading messages:", error);

    const container = document.getElementById("chat-messages");
    container.innerHTML = "";

    if (data && data.length > 0) {
        data.forEach(renderMessage);
    } else {
        renderEmptyChat();
    }

    if (chatChannel) chatChannel.unsubscribe();
    chatChannel = sb.channel("public:messages")
        .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "messages"
        }, payload => {
            const empty = document.getElementById("chat-empty");
            if (empty) empty.remove();

            renderMessage(payload.new);

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

    const { error } = await sb
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

function toggleChat() {
    chatOpen = !chatOpen;
    document.getElementById("chat-panel").classList.toggle("collapsed", !chatOpen);

    if (chatOpen) {
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

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const { data, error } = await sb
            .from("calls")
            .insert([{
                type,
                status: "pending",
                caller: currentUser,
                offer: { type: offer.type, sdp: offer.sdp },
                caller_candidates: [],
                callee_candidates: []
            }])
            .select()
            .single();

        if (error || !data) {
            console.error("Could not create call:", error);
            showToast("⚠️ Could not start call");
            return;
        }

        currentCallId = data.id;

        // Ice candidate gather & update
        peerConnection.onicecandidate = async (e) => {
            if (e.candidate) {
                const { data: latest } = await sb.from("calls").select("caller_candidates").eq("id", currentCallId).single();
                const currentList = latest?.caller_candidates || [];
                currentList.push(e.candidate.toJSON());
                await sb.from("calls").update({ caller_candidates: currentList }).eq("id", currentCallId);
            }
        };

        // Realtime sync with Callee
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
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(call.answer));
                }

                if (call.callee_candidates && Array.isArray(call.callee_candidates)) {
                    for (const c of call.callee_candidates) {
                        try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); }
                        catch (err) { }
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

        await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));

        if (call.caller_candidates && Array.isArray(call.caller_candidates)) {
            for (const c of call.caller_candidates) {
                try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); }
                catch (err) { }
            }
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        currentCallId = call.id;

        peerConnection.onicecandidate = async (e) => {
            if (e.candidate) {
                const { data: latest } = await sb.from("calls").select("callee_candidates").eq("id", currentCallId).single();
                const currentList = latest?.callee_candidates || [];
                currentList.push(e.candidate.toJSON());
                await sb.from("calls").update({ callee_candidates: currentList }).eq("id", currentCallId);
            }
        };

        if (callChannel) callChannel.unsubscribe();
        callChannel = sb.channel(`call:answer:${currentCallId}`)
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "calls",
                filter: `id=eq.${currentCallId}`
            }, async payload => {
                const updated = payload.new;

                if (updated.caller_candidates && Array.isArray(updated.caller_candidates)) {
                    for (const c of updated.caller_candidates) {
                        try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); }
                        catch (err) { }
                    }
                }

                if (updated.status === "ended") {
                    endCall(true);
                }
            })
            .subscribe();

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
        if(remoteVideo) remoteVideo.srcObject = e.streams[0];
        const idleState = document.getElementById("idle-state");
        if(idleState) idleState.classList.add("hidden");
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
    if(btn) {
        btn.classList.toggle("muted", isMuted);
        btn.setAttribute("aria-pressed", isMuted);
        btn.title = isMuted ? "Unmute" : "Mute";
    }

    showToast(isMuted ? "🔇 Muted" : "🎙️ Unmuted");
}

function toggleCamera() {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    if (!videoTracks.length) return;

    isCameraOff = !isCameraOff;
    videoTracks.forEach(t => { t.enabled = !isCameraOff; });

    const btn = document.getElementById("btn-camera");
    if(btn) {
        btn.classList.toggle("cam-off", isCameraOff);
        btn.setAttribute("aria-pressed", isCameraOff);
        btn.title = isCameraOff ? "Turn On Camera" : "Turn Off Camera";
    }

    showToast(isCameraOff ? "📵 Camera off" : "📹 Camera on");
}

async function endCall(remote = false) {
    if (!remote && currentCallId) {
        await sb.from("calls").update({ status: "ended" }).eq("id", currentCallId);
    }

    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (callChannel) { callChannel.unsubscribe(); callChannel = null; }

    const rVideo = document.getElementById("remote-video");
    const lVideo = document.getElementById("local-video");
    if(rVideo) rVideo.srcObject = null;
    if(lVideo) lVideo.srcObject = null;

    currentCallId = null;
    isMuted = false;
    isCameraOff = false;

    setInCallUI(false, null);
    showToast(remote ? `${partnerUser} ended the call` : "Call ended");
}

function setInCallUI(inCall, callType) {
    const cIdle = document.getElementById("controls-idle");
    const cInCall = document.getElementById("controls-in-call");
    const idleSt = document.getElementById("idle-state");
    const btnCam = document.getElementById("btn-camera");
    const btnMute = document.getElementById("btn-mute");

    if(cIdle) cIdle.classList.toggle("hidden", inCall);
    if(cInCall) cInCall.classList.toggle("hidden", !inCall);
    if(idleSt) idleSt.classList.toggle("hidden", inCall);

    if (inCall) {
        startCallTimer();
        if (callType === "audio" && btnCam) {
            btnCam.style.display = "none";
        } else if(btnCam) {
            btnCam.style.display = "";
        }
    } else {
        stopCallTimer();
        if(idleSt) idleSt.classList.remove("hidden");
        if(btnMute) btnMute.classList.remove("muted");
        if(btnCam) {
            btnCam.classList.remove("cam-off");
            btnCam.style.display = "";
        }
    }
}

function startCallTimer() {
    callStartTime = Date.now();
    const timer = document.getElementById("call-timer");
    if(timer) timer.classList.remove("hidden");
    callTimerInterval = setInterval(updateTimer, 1000);
}

function stopCallTimer() {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
    const timer = document.getElementById("call-timer");
    const text = document.getElementById("timer-text");
    if(timer) timer.classList.add("hidden");
    if(text) text.textContent = "0:00";
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const text = document.getElementById("timer-text");
    if(text) text.textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

let toastTimeout = null;
function showToast(msg, duration = 2600) {
    const toast = document.getElementById("toast");
    if(!toast) return;
    toast.textContent = msg;
    toast.classList.remove("hidden");
    void toast.offsetWidth;
    toast.classList.add("show");

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.classList.add("hidden"), 400);
    }, duration);
}

function initPipDrag() {
    const pip = document.getElementById("local-pip");
    if(!pip) return;
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
}
