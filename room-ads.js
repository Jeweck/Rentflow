/**
 * room-ads.js — Room Advertisement page
 * Reads the SAME Firestore "rooms" collection that room-details.js manages,
 * so any room added/edited/deleted there shows up here automatically.
 * Images use room.photoUrl (public Supabase Storage URL saved by room-details.js).
 * No timer and no auto-redirect: the visitor decides when to leave.
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Config you may need to change ────────────────────────────────────────────
const SIGN_IN_PAGE = "index.html?login=1";
const BOOKING_PAGE = "booking.html";   // <- change to your real booking page
const ROOMS_COLLECTION = "rooms";

// Same project config as room-details.js
const firebaseConfig = {
    apiKey:            "AIzaSyAGd7Aaiu_d-VIokG16gapCZOlpGheb9tY",
    authDomain:        "rentalmangemnetsystem.firebaseapp.com",
    projectId:         "rentalmangemnetsystem",
    storageBucket:     "rentalmangemnetsystem.firebasestorage.app",
    messagingSenderId: "143952534193",
    appId:             "1:143952534193:web:1a0dc97e5e0f10fde16090",
    measurementId:     "G-8HXJE3259V"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db  = getFirestore(app);

// A room is advertised when it has no tenant (the "Vacant" state in Room Details).
const isAdvertisable = (r) => {
    const t = String(r.tenant || "").trim().toLowerCase();
    return t === "" || t === "vacant";
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const peso = (v) => "₱ " + (parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")) || 0)
    .toLocaleString("en-PH");

function roomType(r) {
    const b = Number(r.bedrooms) || 0;
    return b === 0 ? "Studio" : b === 1 ? "1-bedroom" : `${b}-bedroom`;
}
function photoOf(r) {
    return r.photoUrl || localStorage.getItem("room_photo_" + r.id) || null; // local fallback = same browser only
}
function descriptionOf(r) {
    if (r.description) return r.description;
    const bits = [];
    if (r.size) bits.push(`${r.size} sqm`);
    bits.push(`${Number(r.bedrooms) || 0} bedroom${Number(r.bedrooms) === 1 ? "" : "s"}`);
    bits.push(`${Number(r.bathrooms) || 0} bathroom${Number(r.bathrooms) === 1 ? "" : "s"}`);
    return `A ${roomType(r).toLowerCase()} room with ${bits.join(", ")}, ready for you to move in.`;
}

// ── State ────────────────────────────────────────────────────────────────────
let rooms = [];
let i = 0;

const markSeen = () => sessionStorage.setItem("rf_ad_seen", "1");
const goSignIn = () => { markSeen(); window.location.href = SIGN_IN_PAGE; };
function bookRoom() {
    const r = rooms[i];
    markSeen();
    // Full room data goes to the booking flow so the visitor doesn't pick it again.
    sessionStorage.setItem("selectedRoom", JSON.stringify({ ...r, photoUrl: photoOf(r) && r.photoUrl ? r.photoUrl : null }));
    window.location.href = `${BOOKING_PAGE}?room=${encodeURIComponent(r.id)}`;
}

// ── Render ───────────────────────────────────────────────────────────────────
function render(animate = true) {
    const r = rooms[i];
    const media = $("media"), info = $("info"), img = $("photo"), ph = $("ph");

    const src = photoOf(r);
    img.hidden = !src; ph.hidden = !!src;
    if (src) { img.src = src; img.alt = `Room ${r.number || ""} photo`; img.onerror = () => { img.hidden = true; ph.hidden = false; }; }

    const many = rooms.length > 1;
    $("prev").hidden = $("next").hidden = !many;
    $("count").hidden = !many;
    $("count").textContent = `${i + 1} / ${rooms.length}`;
    $("ctrl").hidden = !many;

    const addr = r.address || "Location on request";
    info.innerHTML = `
        <p class="kicker">Room ${esc(r.number ?? "")}</p>
        <h1>${esc(addr)}</h1>
        <p class="price">${esc(peso(r.rentAmount))} <small>/ month</small></p>
        <div class="chips">
            <span><i class="fas fa-door-open"></i>${esc(roomType(r))}</span>
            ${r.size ? `<span><i class="fas fa-expand"></i>${esc(r.size)} sqm</span>` : ""}
            <span><i class="fas fa-bed"></i>${Number(r.bedrooms) || 0} bed</span>
            <span><i class="fas fa-bath"></i>${Number(r.bathrooms) || 0} bath</span>
        </div>
        <p class="desc">${esc(descriptionOf(r))}</p>
        <dl>
            <dt>Status</dt><dd>Available</dd>
            <dt>Location</dt><dd>${esc(addr)}</dd>
            <dt>Payment</dt><dd>Every ${esc(r.payPeriodNum || 1)} ${esc(r.payPeriodUnit || "month")}</dd>
        </dl>
        <div class="actions">
            <button class="btn btn-book" type="button" data-act="book">Book room</button>
            <button class="btn btn-skip" type="button" data-act="skip">Skip to sign in</button>
            ${many ? `<button class="btn btn-browse" type="button" data-act="browse"><i class="fas fa-table-cells-large"></i>Browse other units (${rooms.length})</button>` : ""}
        </div>`;

    if (animate) {
        [media, info].forEach(el => { el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); });
    }
}

function go(step) {
    if (rooms.length < 2) return;
    i = (i + step + rooms.length) % rooms.length;
    render();
}

// ── Unit picker (Browse other units) ────────────────────────────────────────
function openPicker() {
    $("pkList").innerHTML = rooms.map((r, n) => {
        const src = photoOf(r);
        return `<li><button type="button" data-i="${n}" ${n === i ? 'aria-current="true"' : ""}>
            <span class="pk-thumb" ${src ? `style="background-image:url('${esc(src)}')"` : ""}>${src ? "" : '<i class="fas fa-image"></i>'}</span>
            <span class="pk-text">
                <strong>Room ${esc(r.number ?? "")} - ${esc(roomType(r))}</strong>
                <span>${esc(r.address || "Location on request")}</span>
                <em>${esc(peso(r.rentAmount))} / month</em>
            </span></button></li>`;
    }).join("");
    $("picker").showModal();
    $("pkList").querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
}
$("pkClose").addEventListener("click", () => $("picker").close());
$("picker").addEventListener("click", (e) => { if (e.target === $("picker")) $("picker").close(); });
$("pkList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    i = Number(b.dataset.i);
    $("picker").close();
    render();
});

function showState(html) { const s = $("state"); s.innerHTML = html; s.hidden = false; $("showcase").hidden = true; }

// ── Init ─────────────────────────────────────────────────────────────────────
$("skipTop").addEventListener("click", goSignIn);
$("prev").addEventListener("click", () => go(-1));
$("next").addEventListener("click", () => go(1));
$("info").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "book") bookRoom();
    if (act === "skip") goSignIn();
    if (act === "browse") openPicker();
});
document.addEventListener("keydown", (e) => {
    if ($("picker").open) return;
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
});
// Swipe on touch devices
let x0 = null;
$("media").addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
$("media").addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    x0 = null;
});

(async function load() {
    try {
        const snap = await getDocs(query(collection(db, ROOMS_COLLECTION), orderBy("number")));
        rooms = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isAdvertisable);
    } catch (err) {
        console.error("Room ads load error:", err);
        showState(`<i class="fas fa-triangle-exclamation spin"></i>
            <h2>We couldn't load the rooms</h2>
            <p>Check your connection and refresh, or continue to sign in.</p>
            <button class="btn btn-book" id="skipState" type="button">Continue to sign in</button>`);
        $("skipState").addEventListener("click", goSignIn);
        return;
    }
    if (!rooms.length) {
        showState(`<i class="fas fa-house spin"></i>
            <h2>No rooms are open right now</h2>
            <p>All rooms are currently occupied. You can still sign in to your account.</p>
            <button class="btn btn-book" id="skipState" type="button">Continue to sign in</button>`);
        $("skipState").addEventListener("click", goSignIn);
        return;
    }
    $("state").hidden = true;
    $("showcase").hidden = false;
    render(false);
})();