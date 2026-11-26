/**
 * tenants.js — Rental Management System
 * Full CRUD: add, edit, delete, search, filter, sort.
 * Tenant status and next due dates are kept in sync with Firestore billing records.
 */

// ── Firebase / Firestore Setup ───────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyAGd7Aaiu_d-VIokG16gapCZOlpGheb9tY",
    authDomain:        "rentalmangemnetsystem.firebaseapp.com",
    projectId:         "rentalmangemnetsystem",
    storageBucket:     "rentalmangemnetsystem.firebasestorage.app",
    messagingSenderId: "143952534193",
    appId:             "1:143952534193:web:1a0dc97e5e0f10fde16090",
    measurementId:     "G-8HXJE3259V"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const TENANTS_COLLECTION = "tenants";
const RECEIPTS_COLLECTION = "receipts";

// ── Avatar colour pairs ──────────────────────────────────────────────────────
const AVATAR_PALETTES = [
    { bg: '#E6F1FB', text: '#0C447C' },
    { bg: '#E1F5EE', text: '#0F6E56' },
    { bg: '#EEEDFE', text: '#3C3489' },
    { bg: '#FAECE7', text: '#993C1D' },
    { bg: '#FBEAF0', text: '#993556' },
    { bg: '#EAF3DE', text: '#3B6D11' },
    { bg: '#FAEEDA', text: '#854F0B' },
];

// ── State ────────────────────────────────────────────────────────────────────
let tenants    = [];   // each item: { id (Firestore doc ID), ...fields }
let receipts   = [];
let receiptsLoaded = false;
let tenantLoadFailed = false;
let editingId  = null;
let deletingId = null;

// ── Firestore helpers ────────────────────────────────────────────────────────

/** Fetch all tenants from Firestore and refresh the table. */
async function loadTenants() {
    try {
        showTableLoading(true);
        const snap = await getDocs(collection(db, TENANTS_COLLECTION));
        tenants = snap.docs.map(d => normalizeTenant({ id: d.id, ...d.data() }));
        tenantLoadFailed = false;
    } catch (err) {
        console.error("Firestore load error:", err);
        tenants = [];
        tenantLoadFailed = true;
    }

    try {
        const snap = await getDocs(collection(db, RECEIPTS_COLLECTION));
        receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        receiptsLoaded = true;
    } catch (err) {
        console.error("Firestore billing load error:", err);
        receipts = [];
        receiptsLoaded = false;
    } finally {
        showTableLoading(false);
        renderTable();
    }
}

/** Add a new tenant document and return the generated Firestore ID. */
async function addTenantToFirestore(data) {
    const docRef = await addDoc(collection(db, TENANTS_COLLECTION), data);
    return docRef.id;
}

/** Update an existing tenant document by Firestore document ID. */
async function updateTenantInFirestore(id, data) {
    const ref = doc(db, TENANTS_COLLECTION, id);
    await updateDoc(ref, data);
}

/** Delete a tenant document by Firestore document ID. */
async function deleteTenantFromFirestore(id) {
    const ref = doc(db, TENANTS_COLLECTION, id);
    await deleteDoc(ref);
}

// ── UI loading state ─────────────────────────────────────────────────────────
function showTableLoading(on) {
    const tbody = el('tenantsTableBody');
    const empty = el('tenantsEmptyState');
    if (!tbody) return;
    if (on) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:36px;color:#aaa;font-size:13px;">
                    <i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Loading tenants…
                </td>
            </tr>`;
        if (empty) empty.style.display = 'none';
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(t) {
    const parts = tenantName(t).trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function getPalette(t) {
    const name = tenantName(t);
    const idx = (name.charCodeAt(0) || 0) % AVATAR_PALETTES.length;
    return AVATAR_PALETTES[idx];
}

function badgeClass(status) {
    if (status === 'Active') return 'badge-active';
    if (status === 'Overdue') return 'badge-overdue';
    return 'badge-pending';
}

function formatRent(val) {
    const amount = Number(val);
    if (val === '' || val === null || val === undefined || !Number.isFinite(amount)) return '—';
    return '&#8369;' + amount.toLocaleString('en-PH');
}

function tenantName(t) {
    const storedName = [t.firstName, t.lastName].filter(Boolean).join(' ').trim();
    return String(storedName || t.name || t.fullName || t.tenantName || 'Unnamed tenant');
}

function normalizeTenant(t) {
    if (t.firstName || t.lastName) return t;
    const fullName = String(t.name || t.fullName || t.tenantName || '').trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    return {
        ...t,
        firstName: parts.shift() || '',
        lastName: parts.join(' ')
    };
}

function parseDate(value) {
    if (!value) return null;
    if (value && typeof value.toDate === 'function') value = value.toDate();
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const text = String(value).trim();
    const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = isoDate
        ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
        : new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextMonthlyDueDate(day, today = new Date()) {
    const dueDay = Number(day);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;
    const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let year = currentDay.getFullYear();
    let month = currentDay.getMonth();
    let date = new Date(year, month, Math.min(dueDay, new Date(year, month + 1, 0).getDate()));
    if (date < currentDay) {
        month += 1;
        if (month > 11) { month = 0; year += 1; }
        date = new Date(year, month, Math.min(dueDay, new Date(year, month + 1, 0).getDate()));
    }
    return date;
}

function billsForTenant(tenant) {
    const fullName = tenantName(tenant).trim().replace(/\s+/g, ' ').toLowerCase();
    return receipts.filter(receipt => receipt.tenantId
        ? receipt.tenantId === tenant.id
        : String(receipt.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === fullName);
}

function isUnpaid(receipt) {
    if (String(receipt.status || '').toLowerCase() === 'paid') return false;
    const amount = Number(receipt.amount);
    const paidAmount = Number(receipt.paidAmount) || 0;
    return Number.isFinite(amount) && amount > 0
        ? amount - paidAmount > 0.005
        : true;
}

function getTenantStatus(tenant) {
    const storedStatus = String(tenant.status || '').trim().toLowerCase();
    if (!receiptsLoaded) {
        return ({ active: 'Active', pending: 'Pending', overdue: 'Overdue' })[storedStatus] || 'Active';
    }
    if (storedStatus === 'pending') return 'Pending';
    const today = new Date();
    const overdue = billsForTenant(tenant).some(receipt => {
        if (!isUnpaid(receipt)) return false;
        if (String(receipt.status || '').toLowerCase() === 'overdue') return true;
        const dueDate = parseDate(receipt.dueDate);
        return dueDate && dueDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    });
    return overdue ? 'Overdue' : 'Active';
}

function getTenantDueDate(tenant) {
    const nextUnpaidDueDate = billsForTenant(tenant)
        .filter(isUnpaid)
        .map(receipt => parseDate(receipt.dueDate))
        .filter(Boolean)
        .sort((a, b) => a - b)[0];
    return nextUnpaidDueDate || nextMonthlyDueDate(tenant.dueDay);
}

function formatDue(tenant) {
    const date = getTenantDueDate(tenant);
    return date ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function el(id) { return document.getElementById(id); }

// ── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id)  { const m = el(id); if (m) m.classList.add('open');    }
function closeModal(id) { const m = el(id); if (m) m.classList.remove('open'); }

// ── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
    const total   = tenants.length;
    const active  = tenants.filter(t => getTenantStatus(t) === 'Active').length;
    const overdue = tenants.filter(t => getTenantStatus(t) === 'Overdue').length;
    const pending = tenants.filter(t => getTenantStatus(t) === 'Pending').length;

    if (el('statTotal'))         el('statTotal').textContent         = total;
    if (el('statActive'))        el('statActive').textContent        = active;
    if (el('statOverdue'))       el('statOverdue').textContent       = overdue;
    if (el('statPending'))       el('statPending').textContent       = pending;
    if (el('tenantsCountBadge')) el('tenantsCountBadge').textContent =
        total + ' tenant' + (total !== 1 ? 's' : '');
}

// ── Table render ─────────────────────────────────────────────────────────────
function renderTable() {
    const search  = el('tenantSearchInput')  ? el('tenantSearchInput').value.toLowerCase().trim() : '';
    const status  = el('tenantStatusFilter') ? el('tenantStatusFilter').value : '';
    const sortKey = el('tenantSortBy')       ? el('tenantSortBy').value       : 'name';

    let list = tenants.filter(t => {
        const searchable = [tenantName(t), t.room, t.roomNumber, t.contact, t.email]
            .filter(Boolean).join(' ').toLowerCase();
        const okSearch = !search || searchable.includes(search);
        const okStatus = !status || getTenantStatus(t) === status;
        return okSearch && okStatus;
    });

    list.sort((a, b) => {
        switch (sortKey) {
            case 'name': return tenantName(a).localeCompare(tenantName(b));
            case 'room': return String(a.room || a.roomNumber || '').localeCompare(String(b.room || b.roomNumber || ''), undefined, { numeric: true });
            case 'rent': return (parseFloat(b.rent) || 0) - (parseFloat(a.rent) || 0);
            case 'due': {
                const aDue = getTenantDueDate(a);
                const bDue = getTenantDueDate(b);
                if (!aDue) return bDue ? 1 : 0;
                if (!bDue) return -1;
                return aDue - bDue;
            }
            default:     return 0;
        }
    });

    const tbody = el('tenantsTableBody');
    const empty = el('tenantsEmptyState');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '';
        if (empty) {
            empty.style.display = tenantLoadFailed ? 'none' : 'block';
            empty.innerHTML = tenants.length
                ? '<i class="fas fa-search" style="font-size:30px;margin-bottom:10px;display:block;"></i>No tenants match your search or filters.'
                : '<i class="fas fa-users" style="font-size:30px;margin-bottom:10px;display:block;"></i>No tenants yet. Click <strong>+ Add Tenant</strong> to get started.';
        }
    } else {
        if (empty) empty.style.display = 'none';
        tbody.innerHTML = list.map(buildRow).join('');

        tbody.querySelectorAll('.btn-edit').forEach(btn =>
            btn.addEventListener('click', () => openEdit(btn.dataset.id)));
        tbody.querySelectorAll('.btn-del').forEach(btn =>
            btn.addEventListener('click', () => openDeleteConfirm(btn.dataset.id)));
    }

    const notice = el('tenantDataNotice');
    if (notice) {
        if (tenantLoadFailed) {
            notice.textContent = 'Could not load tenant records. Check your connection and refresh the page.';
            notice.style.display = 'block';
        } else if (!receiptsLoaded) {
            notice.textContent = 'Billing records could not be loaded. Tenant statuses and due dates may be outdated.';
            notice.style.display = 'block';
        } else {
            notice.textContent = '';
            notice.style.display = 'none';
        }
    }

    updateStats();
}

function buildRow(t) {
    const pal = getPalette(t);
    const status = getTenantStatus(t);
    const room = t.room || t.roomNumber;
    return `
        <tr>
            <td>
                <div class="tenant-name-cell">
                    <div class="tenant-avatar-circle"
                         style="background:${pal.bg};color:${pal.text};">
                        ${getInitials(t)}
                    </div>
                    <div>
                        <div class="tenant-name-text">${esc(tenantName(t))}</div>
                        <div class="tenant-contact-sub">${esc(t.contact || t.email || '')}</div>
                    </div>
                </div>
            </td>
            <td>${room ? 'Room ' + esc(room) : '—'}</td>
            <td>${formatRent(t.rent)}</td>
            <td>${formatDue(t)}</td>
            <td><span class="status-badge ${badgeClass(status)}" title="${status === 'Overdue' ? 'Unpaid billing has passed its due date' : ''}">${esc(status)}</span></td>
            <td>
                <div class="tenant-action-btns">
                    <button class="t-icon-btn btn-edit" data-id="${esc(t.id)}" title="Edit" aria-label="Edit ${esc(tenantName(t))}">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="t-icon-btn btn-del" data-id="${esc(t.id)}" title="Delete" aria-label="Delete ${esc(tenantName(t))}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>`;
}

// ── Open Add modal ───────────────────────────────────────────────────────────
function openAddTenant() {
    editingId = null;
    clearForm();
    if (el('tenantModalTitle')) el('tenantModalTitle').textContent = 'Add Tenant';
    openModal('tenantFormModal');
    setTimeout(() => { if (el('tFirstName')) el('tFirstName').focus(); }, 50);
}

// ── Open Edit modal ──────────────────────────────────────────────────────────
function openEdit(id) {
    const t = tenants.find(x => x.id === id);
    if (!t) return;
    editingId = id;

    if (el('tFirstName')) el('tFirstName').value = t.firstName || '';
    if (el('tLastName'))  el('tLastName').value  = t.lastName  || '';
    if (el('tRoom'))      el('tRoom').value      = t.room || t.roomNumber || '';
    if (el('tRent'))      el('tRent').value      = t.rent || t.monthlyRent || '';
    if (el('tDueDay'))    el('tDueDay').value    = t.dueDay    || '';
    if (el('tMoveIn'))    el('tMoveIn').value    = t.moveIn    || '';
    if (el('tContact'))   el('tContact').value   = t.contact || t.phone || '';
    if (el('tEmail'))     el('tEmail').value     = t.email || '';
    if (el('tStatus'))    el('tStatus').value    = getTenantStatus(t) === 'Pending' ? 'Pending' : 'Active';

    if (el('tenantModalTitle')) el('tenantModalTitle').textContent = 'Edit Tenant';
    openModal('tenantFormModal');
    setTimeout(() => { if (el('tFirstName')) el('tFirstName').focus(); }, 50);
}

// ── Save (add or update) ─────────────────────────────────────────────────────
async function handleSave() {
    const firstName = el('tFirstName') ? el('tFirstName').value.trim() : '';
    const lastName  = el('tLastName')  ? el('tLastName').value.trim()  : '';

    if (!firstName) {
        alert("Please enter the tenant's first name.");
        return;
    }

    const rentInput = el('tRent') ? el('tRent').value.trim() : '';
    const rent = rentInput === '' ? '' : Number(rentInput);
    if (rentInput !== '' && (!Number.isFinite(rent) || rent < 0)) {
        alert('Enter a valid non-negative monthly rent.');
        return;
    }

    const dueDayInput = el('tDueDay') ? el('tDueDay').value.trim() : '';
    const dueDay = dueDayInput === '' ? '' : Number(dueDayInput);
    if (dueDayInput !== '' && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)) {
        alert('Enter a monthly due day from 1 to 28.');
        return;
    }

    const email = el('tEmail') ? el('tEmail').value.trim().toLowerCase() : '';
    if (email && !el('tEmail').checkValidity()) {
        alert('Enter a valid tenant account email.');
        return;
    }

    const saveBtn = el('saveTenantBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const data = {
        firstName,
        lastName,
        name:    fullName,
        room:    el('tRoom')    ? el('tRoom').value.trim()    : '',
        rent,
        dueDay,
        moveIn:  el('tMoveIn')  ? el('tMoveIn').value          : '',
        contact: el('tContact') ? el('tContact').value.trim() : '',
        email,
        status:  el('tStatus')  ? el('tStatus').value          : 'Active',
        updatedAt: new Date().toISOString(),
    };

    try {
        if (editingId) {
            // ── UPDATE ──
            await updateTenantInFirestore(editingId, data);
            tenants = tenants.map(t => t.id === editingId ? normalizeTenant({ ...t, ...data }) : t);
        } else {
            // ── ADD ──
            data.createdAt = new Date().toISOString();
            const newId = await addTenantToFirestore(data);
            tenants.push({ id: newId, ...data });
        }

        closeModal('tenantFormModal');
        renderTable();
    } catch (err) {
        console.error("Firestore save error:", err);
        alert("Failed to save tenant. Please check your connection and try again.");
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Tenant'; }
    }
}

// ── Delete confirm modal ─────────────────────────────────────────────────────
function openDeleteConfirm(id) {
    deletingId = id;
    const t    = tenants.find(x => x.id === id);
    const name = t ? `${t.firstName} ${t.lastName}` : 'this tenant';
    if (el('tenantConfirmMsg'))
        el('tenantConfirmMsg').textContent =
            `Are you sure you want to remove ${name}? This cannot be undone.`;
    openModal('tenantConfirmModal');
}

async function handleDelete() {
    if (!deletingId) return;

    const delBtn = el('confirmTenantDelete');
    if (delBtn) { delBtn.disabled = true; delBtn.textContent = 'Removing…'; }

    try {
        await deleteTenantFromFirestore(deletingId);
        tenants = tenants.filter(t => t.id !== deletingId);
        closeModal('tenantConfirmModal');
        renderTable();
    } catch (err) {
        console.error("Firestore delete error:", err);
        alert("Failed to remove tenant. Please check your connection and try again.");
    } finally {
        if (delBtn) { delBtn.disabled = false; delBtn.textContent = 'Remove'; }
        deletingId = null;
    }
}

// ── Clear form ───────────────────────────────────────────────────────────────
function clearForm() {
    ['tFirstName', 'tLastName', 'tRoom', 'tContact', 'tEmail'].forEach(id => {
        if (el(id)) el(id).value = '';
    });
    if (el('tRent'))   el('tRent').value   = '';
    if (el('tDueDay')) el('tDueDay').value = '';
    if (el('tMoveIn')) el('tMoveIn').value = '';
    if (el('tStatus')) el('tStatus').value = 'Active';
}

// ── Bind events ──────────────────────────────────────────────────────────────
function bindEvents() {
    if (el('addTenantBtn'))
        el('addTenantBtn').addEventListener('click', openAddTenant);

    if (el('closeTenantFormModal'))
        el('closeTenantFormModal').addEventListener('click', () => closeModal('tenantFormModal'));
    if (el('cancelTenantForm'))
        el('cancelTenantForm').addEventListener('click', () => closeModal('tenantFormModal'));

    if (el('saveTenantBtn'))
        el('saveTenantBtn').addEventListener('click', handleSave);

    if (el('cancelTenantDelete'))
        el('cancelTenantDelete').addEventListener('click', () => closeModal('tenantConfirmModal'));
    if (el('confirmTenantDelete'))
        el('confirmTenantDelete').addEventListener('click', handleDelete);

    if (el('tenantFormModal'))
        el('tenantFormModal').addEventListener('click', function (e) {
            if (e.target === this) closeModal('tenantFormModal');
        });
    if (el('tenantConfirmModal'))
        el('tenantConfirmModal').addEventListener('click', function (e) {
            if (e.target === this) closeModal('tenantConfirmModal');
        });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeModal('tenantFormModal');
            closeModal('tenantConfirmModal');
        }
    });

    if (el('tenantFormModal'))
        el('tenantFormModal').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
                handleSave();
            }
        });

    if (el('tenantSearchInput'))
        el('tenantSearchInput').addEventListener('input', renderTable);
    if (el('tenantStatusFilter'))
        el('tenantStatusFilter').addEventListener('change', renderTable);
    if (el('tenantSortBy'))
        el('tenantSortBy').addEventListener('change', renderTable);
}

// ── Init ─────────────────────────────────────────────────────────────────────
function init() {
    bindEvents();
    loadTenants();   // async — shows spinner, then renders
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}