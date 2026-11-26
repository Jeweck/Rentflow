// landlord-bookings.js — Booking Requests list for the landlord dashboard
// Usage: <div id="bookingRequests"></div>  then  import { initLandlordBookings } from './landlord-bookings.js'; initLandlordBookings();
import { supabase } from './supabase.js';   // <-- your existing client file

const BADGE = {
  pending:['🟡','Pending','#fff4cc','#7a5b00'], approved:['🟢','Approved','#e1f5d0','#2d5a0a'],
  rejected:['🔴','Rejected','#fde4e1','#8c1d18'], confirmed:['🔵','Confirmed','#dff1fb','#12506c'],
  cancelled:['⚫','Cancelled','#e6e9ee','#444']
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
const date = d => d ? new Date(d).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' }) : '—';
const badge = st => { const b = BADGE[st] || BADGE.pending; return `<span class="lb-badge" style="background:${b[2]};color:${b[3]}">${b[0]} ${b[1]}</span>`; };
const roomName = r => r?.title || r?.name || r?.room_name || r?.room_number || 'Room';

const CSS = `
.lb-wrap{color:var(--ink);font-family:var(--sans)}
.lb-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.lb-tabs button{border:1.5px solid #cfdbe6;background:#fff;color:var(--navy);border-radius:999px;padding:8px 16px;font-weight:600;font-size:14px}
.lb-tabs button[aria-pressed="true"]{background:var(--navy);color:#fff;border-color:var(--navy)}
.lb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
.lb-card{background:var(--paper);border-radius:20px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.18);cursor:pointer;text-align:left;border:0;color:var(--ink);font:inherit}
.lb-card:hover{box-shadow:0 14px 34px rgba(0,0,0,.28)}
.lb-top{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.lb-av{width:44px;height:44px;border-radius:50%;background:#17405c center/cover;color:#fff;display:grid;place-items:center;font-weight:700;flex-shrink:0}
.lb-card h3{font-size:16px} .lb-card small{color:var(--muted)}
.lb-card dl{grid-template-columns:auto 1fr;font-size:13px;gap:5px 12px;margin:10px 0 0;padding-top:10px}
.lb-badge{display:inline-block;border-radius:999px;padding:4px 11px;font-size:12.5px;font-weight:700;margin-left:auto;white-space:nowrap}
.lb-empty{color:rgba(255,255,255,.75);text-align:center;padding:40px 0}
#lbDetail{border:0;border-radius:24px;padding:0;width:min(720px,calc(100vw - 24px));max-height:92vh;background:var(--paper);color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden;font-family:var(--sans)}
#lbDetail::backdrop,#lbAsk::backdrop{background:rgba(5,12,40,.65);backdrop-filter:blur(4px)}
.lb-dbody{overflow-y:auto;max-height:calc(92vh - 150px);padding:6px 24px 18px}
.lb-dbody h3{font-family:var(--serif);font-size:18px;color:var(--navy);margin:18px 0 8px}
.lb-dbody dl{margin:0;padding-top:0;border:0}
.lb-quote{background:#eef4f8;border-radius:14px;padding:14px;line-height:1.6;white-space:pre-wrap}
.lb-reason{background:#fde4e1;color:#8c1d18;border-radius:12px;padding:12px;margin-top:10px}
.lb-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;padding:14px 24px;border-top:1px solid #dfe7ee}
.lb-actions .btn{flex:0 1 auto;padding:12px 20px}
.btn-reject{background:#b3261e;color:#fff}
#lbAsk{border:0;border-radius:20px;padding:24px;width:min(440px,calc(100vw - 24px));background:var(--paper);color:var(--ink);font-family:var(--sans)}
#lbAsk h3{font-family:var(--serif);font-size:20px;margin-bottom:8px}
#lbAsk textarea{width:100%;min-height:90px;font:inherit;border:1.5px solid #cfdbe6;border-radius:12px;padding:10px;margin:8px 0 6px}
#lbErr{color:#b3261e;font-size:13px;min-height:18px;margin-bottom:10px}
`;

let rows = [], filter = 'all', root;

export async function initLandlordBookings(selector = '#bookingRequests') {
  root = document.querySelector(selector);
  if (!root) return;
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="lbDetail"></dialog>
    <dialog id="lbAsk"><h3 id="lbAskT"></h3><p id="lbAskP" style="color:#34435c"></p>
      <textarea id="lbReason" placeholder="Reason for rejecting"></textarea><div id="lbErr"></div>
      <div class="actions" style="justify-content:flex-end">
        <button type="button" class="btn btn-skip" id="lbAskNo" style="flex:0 1 auto">Cancel</button>
        <button type="button" class="btn btn-book" id="lbAskYes" style="flex:0 1 auto">Confirm</button></div></dialog>`);
  root.innerHTML = '<p class="lb-empty"><i class="fas fa-spinner fa-spin"></i> Loading booking requests…</p>';
  await load();
}

async function load() {
  // RLS already limits this to rooms the signed-in landlord owns
  const { data, error } = await supabase.from('booking_requests')
    .select('*, rooms(*), properties(*)').order('created_at', { ascending: false });
  if (error) { root.innerHTML = `<p class="lb-empty">Couldn’t load requests: ${esc(error.message)}</p>`; return; }
  rows = data || [];
  const ids = [...new Set(rows.map(r => r.tenant_id))];
  if (ids.length) {
    const { data: ps } = await supabase.from('profiles').select('id, avatar_url').in('id', ids);
    const map = Object.fromEntries((ps || []).map(p => [p.id, p.avatar_url]));
    rows.forEach(r => r._avatar = map[r.tenant_id]);
  }
  render();
}

function render() {
  const tabs = ['all','pending','approved','rejected','confirmed','cancelled'];
  const list = rows.filter(r => filter === 'all' || r.status === filter);
  root.innerHTML = `<div class="lb-wrap">
    <div class="lb-tabs">${tabs.map(t => `<button type="button" data-f="${t}" aria-pressed="${t===filter}">${t[0].toUpperCase()+t.slice(1)}${t==='pending'?` (${rows.filter(r=>r.status==='pending').length})`:''}</button>`).join('')}</div>
    ${list.length ? `<div class="lb-grid">${list.map(card).join('')}</div>` : '<p class="lb-empty">No booking requests here yet.</p>'}</div>`;
  root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });
  root.querySelectorAll('[data-id]').forEach(b => b.onclick = () => openDetail(b.dataset.id));
}

function card(r) {
  const av = r._avatar ? `style="background-image:url('${esc(r._avatar)}')"` : '';
  return `<button class="lb-card" data-id="${r.id}">
    <div class="lb-top"><div class="lb-av" ${av}>${r._avatar ? '' : esc(r.full_name[0]?.toUpperCase())}</div>
      <div><h3>${esc(r.full_name)}</h3><small>${esc(roomName(r.rooms))}</small></div>${badge(r.status)}</div>
    <dl><dt>Property</dt><dd>${esc(r.properties?.name || r.properties?.title || '—')}</dd>
      <dt>Rent</dt><dd>${peso(r.rooms?.price ?? r.rooms?.rent)}</dd>
      <dt>Move-in</dt><dd>${date(r.move_in_date)}</dd><dt>Stay</dt><dd>${esc(r.stay_duration)}</dd>
      <dt>Occupants</dt><dd>${r.occupants_count}</dd><dt>Requested</dt><dd>${date(r.created_at)}</dd></dl></button>`;
}

const sec = (t, pairs) => `<h3>${t}</h3><dl>${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

async function openDetail(id) {
  const r = rows.find(x => x.id === id), d = document.getElementById('lbDetail');
  const { data: signed } = await supabase.storage.from('valid-ids').createSignedUrl(r.valid_id_url, 3600);
  const idLink = signed?.signedUrl ? `<a href="${signed.signedUrl}" target="_blank" rel="noopener">View uploaded ID</a>` : 'Unavailable';
  d.innerHTML = `
    <div class="bk-head" style="display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid #dfe7ee">
      <div><h2 style="font-family:var(--serif);font-size:22px">${esc(r.full_name)}</h2>
        <small style="color:var(--muted)">Requested ${date(r.created_at)}</small></div>
      ${badge(r.status)}</div>
    <div class="lb-dbody">
      ${sec('Tenant information', [['Email', esc(r.email)], ['Phone', esc(r.phone)], ['Address', esc(r.current_address)],
        ['Date of birth', date(r.date_of_birth)], ['ID type', esc(r.valid_id_type)], ['ID number', esc(r.valid_id_number)], ['Valid ID', idLink]])}
      ${sec('Rental information', [['Room', esc(roomName(r.rooms))], ['Property', esc(r.properties?.name || r.properties?.title || '—')],
        ['Monthly rent', peso(r.rooms?.price ?? r.rooms?.rent)], ['Move-in', date(r.move_in_date)], ['Length of stay', esc(r.stay_duration)],
        ['Occupants', r.occupants_count], ['Additional occupants', esc(r.additional_occupants || '—')],
        ['Purpose', esc(r.rental_purpose)], ['Employment / school', esc(r.employment_school)], ['Monthly income', peso(r.monthly_income)]])}
      ${sec('Emergency contact', [['Name', esc(r.emergency_contact_name)], ['Relationship', esc(r.emergency_contact_relationship)], ['Phone', esc(r.emergency_contact_phone)]])}
      <h3>Tenant message</h3><div class="lb-quote">${esc(r.tenant_message || 'No message.')}</div>
      ${r.rejection_reason ? `<div class="lb-reason"><strong>Rejection reason:</strong> ${esc(r.rejection_reason)}</div>` : ''}
    </div>
    <div class="lb-actions"><button class="btn btn-skip" data-a="close" style="flex:0 1 auto;padding:12px 20px">Close</button>
      <a class="btn btn-browse" href="mailto:${esc(r.email)}" style="flex:0 1 auto;padding:12px 20px;text-decoration:none">Message tenant</a>
      ${r.status === 'pending' ? `<button class="btn btn-reject" data-a="reject">Reject request</button><button class="btn btn-book" data-a="approve">Approve request</button>` : ''}</div>`;
  d.querySelector('[data-a=close]').onclick = () => d.close();
  d.querySelector('[data-a=approve]')?.addEventListener('click', () => ask(r, 'approved'));
  d.querySelector('[data-a=reject]')?.addEventListener('click', () => ask(r, 'rejected'));
  d.showModal();
}

function ask(r, status) {
  const a = document.getElementById('lbAsk'), reject = status === 'rejected';
  document.getElementById('lbAskT').textContent = reject ? 'Reject this request?' : 'Approve this booking request?';
  document.getElementById('lbAskP').textContent = reject ? 'Please provide a reason for rejecting this request.' : 'The tenant will be asked to confirm the booking.';
  const reason = document.getElementById('lbReason'); reason.hidden = !reject; reason.value = '';
  const err = document.getElementById('lbErr'), yes = document.getElementById('lbAskYes'); err.textContent = '';
  document.getElementById('lbAskNo').onclick = () => a.close();
  yes.onclick = async () => {
    if (reject && !reason.value.trim()) { err.textContent = 'A reason is required.'; return; }
    yes.disabled = true; yes.textContent = 'Saving…';
    const { error } = await supabase.rpc('set_booking_status', { b: r.id, new_status: status, reason: reason.value.trim() || null });
    yes.disabled = false; yes.textContent = 'Confirm';
    if (error) { err.textContent = /idx|duplicate|unique/i.test(error.message) ? 'Another request for this room was already approved.' : error.message; return; }
    a.close(); document.getElementById('lbDetail').close(); await load();
  };
  a.showModal();
}
