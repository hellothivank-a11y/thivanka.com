const SUPABASE_URL = "https://ufiwakxqrepwnngspjxv.supabase.co";
const SUPABASE_KEY = "sb_publishable_Ft_wdmxDIjL9ngoihVFKPA_EnYoD3r8";
const PASSCODE = "1234"; // ඔයාලට කැමති Password එකක් දාන්න

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = "";
let localStream = null;
let peerConnection = null;
let currentCallId = null;

const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// 1. Authentication
function login() {
    const user = document.getElementById("user-select").value;
    const pass = document.getElementById("passcode").value;

    if (pass === PASSCODE) {
        currentUser = user;
        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("app-screen").classList.remove("hidden");
        initChat();
        listenForCalls();
    } else {
        alert("Passcode වැරදියි!");
    }
}

// 2. Chat Functionality
async function initChat() {
    // Load past messages
    const { data } = await supabase.from("messages").select("*").order("created_at", { ascending: true });
    if (data) data.forEach(renderMessage);

    // Listen for new messages
    supabase.channel("public:messages")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
            renderMessage(payload.new);
        })
        .subscribe();
}

async function sendMessage() {
    const input = document.getElementById("msg-input");
    const text = input.value.trim();
    if (!text) return;

    await supabase.from("messages").insert([{ sender: currentUser, content: text }]);
    input.value = "";
}

function renderMessage(msg) {
    const div = document.createElement("div");
    div.classList.add("message", msg.sender === currentUser ? "me" : "them");
    div.innerText = `${msg.sender}: ${msg.content}`;
    const container = document.getElementById("chat-messages");
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function handleKeyPress(e) { if (e.key === "Enter") sendMessage(); }

// 3. WebRTC Video / Voice Call Logic
async function startCall(type) {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: type === "video",
        audio: true
    });
    document.getElementById("local-video").srcObject = localStream;

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = e => {
        document.getElementById("remote-video").srcObject = e.streams[0];
    };

    // Create Call Entry in Supabase
    const { data } = await supabase.from("calls").insert([{ type, status: "pending" }]).select().single();
    currentCallId = data.id;

    peerConnection.onicecandidate = async e => {
        if (e.candidate) {
            await supabase.rpc('array_append', { table_name: 'calls', column_name: 'caller_candidates', row_id: currentCallId, value: e.candidate.toJSON() });
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await supabase.from("calls").update({ offer }).eq("id", currentCallId);

    // Listen for Answer
    supabase.channel(`call:${currentCallId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${currentCallId}` }, async payload => {
            if (payload.new.answer && !peerConnection.currentRemoteDescription) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.new.answer));
            }
        }).subscribe();

    toggleCallUI(true);
}

// Listen for incoming calls
function listenForCalls() {
    supabase.channel("public:calls")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls" }, async payload => {
            const call = payload.new;
            if (confirm(`Incoming ${call.type} call! පිළිගන්නද?`)) {
                answerCall(call);
            }
        }).subscribe();
}

async function answerCall(call) {
    currentCallId = call.id;
    localStream = await navigator.mediaDevices.getUserMedia({ video: call.type === "video", audio: true });
    document.getElementById("local-video").srcObject = localStream;

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = e => {
        document.getElementById("remote-video").srcObject = e.streams[0];
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await supabase.from("calls").update({ answer, status: "active" }).eq("id", currentCallId);
    toggleCallUI(true);
}

function endCall() {
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    toggleCallUI(false);
}

function toggleCallUI(inCall) {
    document.getElementById("btn-video").classList.toggle("hidden", inCall);
    document.getElementById("btn-audio").classList.toggle("hidden", inCall);
    document.getElementById("btn-end").classList.toggle("hidden", !inCall);
}