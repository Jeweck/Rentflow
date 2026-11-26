// booking.js — Book Room request form for RentFlow (room-ads page)
// Usage in room-ads.js:
//   import { openBookingForm } from './booking.js';
//   bookBtn.addEventListener('click', () => openBookingForm({
//     id: room.id, name: room.title, propertyName: room.property_name, rent: room.price }));
import { supabase } from './supabase.js';   // <-- change to your existing client file

const SIGNIN_PAGE = 'login.html';   // <-- your sign-in page

const CSS = `
#bk,#bkConfirm{border:0;border-radius:24px;padding:0;background:var(--paper);color:var(--ink);box-shadow:0 30px 80px rgba(0,0,0,.5);font-family:var(--sans)}
#bk{width:min(720px,calc(100vw - 24px));max-height:92vh;overflow:hidden}
#bkConfirm{width:min(420px,calc(100vw - 24px));padding:26px}
#bk::backdrop,#bkConfirm::backdrop{background:rgba(5,12,40,.65);backdrop-filter:blur(4px)}
#bk[open],#bkConfirm[open]{animation:infoIn .3s ease both}
#bk form{display:flex;flex-direction:column;max-height:92vh}
.bk-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:20px 24px;border-bottom:1px solid #dfe7ee}
.bk-head h2{font-family:var(--serif);font-size:24px}
.bk-head p{color:var(--muted);font-size:14px;margin-top:4px}
.bk-body{overflow-y:auto;padding:8px 24px 20px}
.bk-body fieldset{border:0;padding:0;margin:18px 0 0}
.bk-body legend{font-family:var(--serif);font-weight:600;font-size:18px;color:var(--navy);margin-bottom:10px}
.bk-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.bk-grid .full{grid-column:1/-1}
.bk-f label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:5px}
.bk-f input,.bk-f select,.bk-f textarea{width:100%;font:inherit;font-size:15px;color:var(--ink);background:#fff;border:1.5px solid #cfdbe6;border-radius:12px;padding:11px 13px}
.bk-f textarea{min-height:90px;resize:vertical}
.bk-f input[readonly]{background:#eef4f8;color:#34435c}
.bk-f .err{display:none;color:#b3261e;font-size:12.5px;margin-top:4px}
.bk-f.bad input,.bk-f.bad select,.bk-f.bad textarea{border-color:#b3261e}
.bk-f.bad .err{display:block}
.bk-agree{display:flex;gap:10px;align-items:flex-start;margin-top:18px;font-size:14px;line-height:1.5}
.bk-agree input{margin-top:3px;width:18px;height:18px;flex-shrink:0}
.bk-msg{margin-top:14px;padding:12px 14px;border-radius:12px;font-size:14px;font-weight:600;display:none}
.bk-msg.error{display:block;background:#fdecea;color:#8c1d18}
.bk-msg.ok{display:block;background:#e7f6d5;color:#2d5a0a}
.bk-foot{display:flex;gap:12px;justify-content:flex-end;padding:16px 24px;border-top:1px solid #dfe7ee}
.bk-foot .btn{flex:0 1 auto}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none!important;box-shadow:none!important}
#bkConfirm h3{font-family:var(--serif);font-size:21px;margin-bottom:8px}
#bkConfirm p{color:#34435c;line-height:1.55;margin-bottom:20px}
@media(max-width:560px){.bk-grid{grid-template-columns:1fr}}
`;

const ID_TYPES = ['Passport','Driver’s License','UMID','PhilSys National ID','Voter’s ID','PRC ID','Other government ID'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');

function field(id, label, opts = {}) {
  const { type = 'text', req = true, full = false, ro = false, attrs = '', tag = 'input', options } = opts;
  let control;
  if (tag === 'select') control = `<select id="${id}" name="${id}" ${req ? 'required' : ''}><option value="">Select…</option>${options.map(o => `<option>${o}</option>`).join('')}</select>`;
  else if (tag === 'textarea') control = `<textarea id="${id}" name="${id}" ${req ? 'required' : ''} ${attrs}></textarea>`;
  else control = `<input id="${id}" name="${id}" type="${type}" ${req ? 'required' : ''} ${ro ? 'readonly' : ''} ${attrs}>`;
  return `<div class="bk-f ${full ? 'full' : ''}"><label for="${id}">${label}${req && !ro ? ' *' : ''}</label>${control}<div class="err"></div></div>`;
}

function build() {
  if (document.getElementById('bk')) return;
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  document.body.insertAdjacentHTML('beforeend', `
<dialog id="bk" aria-labelledby="bkTitle"><form id="bkForm" novalidate>
  <div class="bk-head"><div><h2 id="bkTitle">Request to book</h2><p id="bkSub"></p></div>
    <button type="button" class="pk-close" id="bkX" aria-label="Close"><i class="fas fa-xmark"></i></button></div>
  <div class="bk-body">
    <fieldset><legend>Your information</legend><div class="bk-grid">
      ${field('full_name','Full name')}${field('email','Email address',{type:'email'})}
      ${field('phone','Phone number',{type:'tel'})}${field('date_of_birth','Date of birth',{type:'date'})}
      ${field('current_address','Current address',{full:true})}
      ${field('valid_id_type','Valid ID type',{tag:'select',options:ID_TYPES})}${field('valid_id_number','Valid ID number')}
      ${field('valid_id_file','Upload valid ID (image or PDF, max 5 MB)',{type:'file',full:true,attrs:'accept="image/*,.pdf"'})}
    </div></fieldset>
    <fieldset><legend>Rental details</legend><div class="bk-grid">
      ${field('room_name','Room',{ro:true,req:false})}${field('property_name','Property',{ro:true,req:false})}
      ${field('rent','Monthly rent',{ro:true,req:false})}${field('move_in_date','Desired move-in date',{type:'date'})}
      ${field('stay_duration','Expected length of stay',{tag:'select',options:['Less than 3 months','3–6 months','6–12 months','1–2 years','More than 2 years']})}
      ${field('occupants_count','Number of occupants',{type:'number',attrs:'min="1" max="20" value="1"'})}
      ${field('additional_occupants','Names of additional occupants',{tag:'textarea',req:false,full:true,attrs:'placeholder="Leave blank if you’ll live alone" style="min-height:60px"'})}
      ${field('rental_purpose','Purpose of renting',{tag:'select',options:['Residence','Study','Work','Other']})}
      ${field('monthly_income','Monthly income (₱)',{type:'number',attrs:'min="0" step="0.01"'})}
      ${field('employment_school','Employment / school information',{full:true,attrs:'placeholder="Employer or school name and position/course"'})}
    </div></fieldset>
    <fieldset><legend>Emergency contact</legend><div class="bk-grid">
      ${field('emergency_contact_name','Full name',{full:true})}
      ${field('emergency_contact_relationship','Relationship')}${field('emergency_contact_phone','Phone number',{type:'tel'})}
    </div></fieldset>
    <fieldset><legend>Message to landlord</legend>
      ${field('tenant_message','Message to Landlord',{tag:'textarea',req:false,attrs:'placeholder="Questions, requests, or anything else the landlord should know"'})}
    </fieldset>
    <label class="bk-agree"><input type="checkbox" id="agree">
      <span>I confirm that the information I provided is accurate and I agree to the rental terms and conditions.</span></label>
    <div class="bk-msg" id="bkMsg" role="alert"></div>
  </div>
  <div class="bk-foot">
    <button type="button" class="btn btn-skip" id="bkCancel">Cancel</button>
    <button type="submit" class="btn btn-book" id="bkSend" disabled>Send booking request</button>
  </div>
</form></dialog>
<dialog id="bkConfirm"><h3>Send this request?</h3>
  <p>Are you sure you want to send this booking request to the landlord?</p>
  <div class="actions" style="justify-content:flex-end">
    <button type="button" class="btn btn-skip" id="bkNo" style="flex:0 1 auto">Go back</button>
    <button type="button" class="btn btn-book" id="bkYes" style="flex:0 1 auto">Yes, send it</button></div></dialog>`);
}

let room = null;
const $ = id => document.getElementById(id);
const REQUIRED = () => [...$('bkForm').querySelectorAll('[required]')];

function validity() {
  const form = $('bkForm');
  const missing = REQUIRED().some(el => !el.value || (el.type === 'file' && !el.files.length));
  const dob = $('date_of_birth').value;
  const adult = !dob || (Date.now() - new Date(dob)) / 3.156e10 >= 18;
  $('bkSend').disabled = missing || !adult || !$('agree').checked || !form.checkValidity();
}

function showErrors() {
  REQUIRED().forEach(el => {
    const wrap = el.closest('.bk-f'); let m = '';
    if (!el.value || (el.type === 'file' && !el.files.length)) m = 'This field is required.';
    else if (!el.checkValidity()) m = 'Please enter a valid value.';
    else if (el.id === 'date_of_birth' && (Date.now() - new Date(el.value)) / 3.156e10 < 18) m = 'You must be at least 18.';
    else if (el.id === 'move_in_date' && el.value < new Date().toISOString().slice(0, 10)) m = 'Move-in date can’t be in the past.';
    else if (el.type === 'file' && el.files[0].size > 5 * 1024 * 1024) m = 'File must be 5 MB or smaller.';
    wrap.classList.toggle('bad', !!m); wrap.querySelector('.err').textContent = m;
  });
  return !document.querySelector('#bkForm .bk-f.bad');
}

async function prefill() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  $('email').value = user.email || '';
  // Reuse existing profile data instead of asking again (adjust table/columns if yours differ)
  const { data: p } = await supabase.from('profiles').select('full_name, phone, address, date_of_birth').eq('id', user.id).maybeSingle();
  if (p) {
    if (p.full_name) $('full_name').value = p.full_name;
    if (p.phone) $('phone').value = p.phone;
    if (p.address) $('current_address').value = p.address;
    if (p.date_of_birth) $('date_of_birth').value = p.date_of_birth;
  }
  return user;
}

function setMsg(kind, text) { const m = $('bkMsg'); m.className = 'bk-msg ' + (kind || ''); m.textContent = text || ''; }

async function submit() {
  const btn = $('bkYes'), send = $('bkSend');
  btn.disabled = send.disabled = true; btn.textContent = 'Sending…';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const file = $('valid_id_file').files[0];
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const up = await supabase.storage.from('valid-ids').upload(path, file, { contentType: file.type });
    if (up.error) throw up.error;

    const v = id => $(id).value.trim();
    const payload = {
      room_id: room.id, full_name: v('full_name'), email: v('email'), phone: v('phone'),
      current_address: v('current_address'), date_of_birth: v('date_of_birth'),
      valid_id_type: v('valid_id_type'), valid_id_number: v('valid_id_number'), valid_id_url: path,
      move_in_date: v('move_in_date'), stay_duration: v('stay_duration'),
      occupants_count: Number(v('occupants_count')), additional_occupants: v('additional_occupants') || null,
      rental_purpose: v('rental_purpose'), employment_school: v('employment_school'),
      monthly_income: Number(v('monthly_income')),
      emergency_contact_name: v('emergency_contact_name'),
      emergency_contact_relationship: v('emergency_contact_relationship'),
      emergency_contact_phone: v('emergency_contact_phone'), tenant_message: v('tenant_message') || null
    };
    const { error } = await supabase.rpc('create_booking_request', { p: payload });
    if (error) {
      await supabase.storage.from('valid-ids').remove([path]); // don't leave orphan uploads
      throw error;
    }
    $('bkConfirm').close();
    setMsg('ok', 'Request sent! The landlord will review it. Track it under My Booking Requests.');
    $('bkForm').querySelectorAll('input,select,textarea').forEach(e => e.disabled = true);
    $('bkCancel').textContent = 'Close'; send.hidden = true;
  } catch (e) {
    $('bkConfirm').close();
    const msg = /no longer available/i.test(e.message) ? 'This room is no longer available.'
      : /duplicate|one_pending/i.test(e.message) ? 'You already have a pending request for this room.'
      : (e.message || 'Something went wrong. Please try again.');
    setMsg('error', msg);
    validity();
  } finally { btn.disabled = false; btn.textContent = 'Yes, send it'; }
}

export async function openBookingForm(r) {
  build(); room = r;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Remember the room + where to come back to, then send them to sign in
    sessionStorage.setItem('rf_pending_booking', JSON.stringify(r));
    sessionStorage.setItem('rf_return', location.pathname.split('/').pop() + location.search);
    location.href = SIGNIN_PAGE;
    return;
  }
  const form = $('bkForm'); form.reset(); setMsg();
  form.querySelectorAll('input,select,textarea').forEach(e => e.disabled = false);
  form.querySelectorAll('.bad').forEach(e => e.classList.remove('bad'));
  $('bkSend').hidden = false; $('bkCancel').textContent = 'Cancel';
  $('room_name').value = r.name; $('property_name').value = r.propertyName || '—'; $('rent').value = peso(r.rent) + ' / month';
  $('move_in_date').min = new Date().toISOString().slice(0, 10);
  $('bkSub').textContent = `${r.name} · ${peso(r.rent)} / month`;
  $('bkSend').disabled = true;
  $('bk').showModal();
  await prefill(); validity();

  if (!form.dataset.wired) {
    form.dataset.wired = '1';
    form.addEventListener('input', () => { validity(); setMsg(); });
    form.addEventListener('change', validity);
    form.addEventListener('submit', e => { e.preventDefault(); if (showErrors()) $('bkConfirm').showModal(); });
    $('bkCancel').onclick = $('bkX').onclick = () => $('bk').close();
    $('bkNo').onclick = () => $('bkConfirm').close();
    $('bkYes').onclick = submit;
  }
}

// Call once when room-ads.js loads: reopens the form after the tenant signs in.
export async function resumePendingBooking() {
  const raw = sessionStorage.getItem('rf_pending_booking');
  if (!raw) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;                       // still signed out, keep waiting
  sessionStorage.removeItem('rf_pending_booking');
  openBookingForm(JSON.parse(raw));
}