// ======= CONFIG =======
const API_BASE = 'https://script.google.com/macros/s/AKfycbzkn8Y8hgBXJzRf4hlZcyZKywaGZFzEvoBn6j-eONEtk7hQwbLWyiat9H3N_qGqlUy0/exec';

// ======= Helpers =======
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function showAlert(msg, type='info', timeout=2400){
  const wrap = $('#alerts');
  const el = document.createElement('div');
  el.className = `alert alert-${type} alert-dismissible fade show`;
  el.role = 'alert';
  el.innerHTML = `${msg}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
  wrap.appendChild(el);
  if (timeout) setTimeout(()=> bootstrap.Alert.getOrCreateInstance(el).close(), timeout);
}
function toHHMM(ts){
  if (!ts) return '—';
  const s=String(ts);
  if (s.length>=16 && /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(s)) return s.substring(11,16);
  const d=new Date(s);
  if (!isNaN(d)) return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  return '—';
}
function todayYYYYMMDD(){
  const d = new Date();
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
function debounce(fn, ms=300){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}

// CSV helper
function toCSV(rows, header){
  const esc = (v) => {
    let s = v==null ? '' : String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) s = `"${s.replace(/"/g,'""')}"`;
    return s;
  };
  const lines = [];
  if (header && header.length) lines.push(header.map(esc).join(','));
  rows.forEach(r => lines.push(header.map(h => esc(r[h])).join(',')));
  const csv = lines.join('\n');
  return new Blob(["\ufeff", csv], { type: 'text/csv;charset=utf-8;' });
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ======= Loading Overlay =======
let _loadingCount = 0;
function showLoading(msg='Memuat…'){
  _loadingCount++;
  $('#loadingMsg').textContent = msg;
  $('#loadingOverlay').classList.remove('d-none');
}
function hideLoading(){
  _loadingCount = Math.max(0, _loadingCount - 1);
  if (_loadingCount === 0) $('#loadingOverlay').classList.add('d-none');
}
function labelFor(action){
  switch(action){
    case 'login': return 'Memverifikasi admin…';
    case 'divisions': return 'Memuat divisi…';
    case 'attendance': return 'Memuat data presensi…';
    case 'set-status': return 'Menyimpan status…';
    case 'set-holiday-today': return 'Menandai hari libur…';
    case 'materialize-alpha': return 'Menulis baris alpha…';
    default: return 'Memuat…';
  }
}

// ======= API =======
async function apiGet(params, token){
  const url = new URL(API_BASE);
  url.searchParams.set('action', params.action);
  Object.entries(params).forEach(([k,v])=>{ if(k!=='action') url.searchParams.set(k,v); });
  if (token) url.searchParams.set('token', token);
  showLoading(labelFor(params.action));
  try{
    const r = await fetch(url, { method:'GET', cache:'no-store' });
    return await r.json();
  } finally { hideLoading(); }
}
async function apiPost(action, body){
  const url = new URL(API_BASE);
  url.searchParams.set('action', action);
  const form = new URLSearchParams();
  Object.entries(body||{}).forEach(([k,v])=> form.append(k, v));
  showLoading(labelFor(action));
  try{
    const r = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString(),
      cache:'no-store'
    });
    return await r.json();
  } finally { hideLoading(); }
}

// ======= State & Elements =======
let TOKEN = '';
let DIVISIONS = [];
let ROWS = [];          // data asli
let VIEW = [];          // hasil filter & sort
let PAGE = 1;
let PAGE_SIZE = 10;
let SORT_KEY = 'name';
let SORT_DIR = 'asc';   // 'asc' | 'desc'
let SEARCH = '';

const loginCard = $('#loginCard');
const dashWrap  = $('#dashWrap');

const inpAdminId  = $('#adminId');
const inpAdminKey = $('#adminKey');
const btnLogin    = $('#btnLogin');

const datePick  = $('#datePick');
const divFilter = $('#divFilter');

const btnReload        = $('#btnReload');
const btnHolidayToday  = $('#btnHolidayToday');
const btnMaterialize   = $('#btnMaterialize');

const searchInput = $('#searchInput');
const pageSizeSel = $('#pageSize');
const resultInfo  = $('#resultInfo');
const pageInfo    = $('#pageInfo');
const firstPageBtn= $('#firstPage');
const prevPageBtn = $('#prevPage');
const nextPageBtn = $('#nextPage');
const lastPageBtn = $('#lastPage');

const btnExportFiltered = $('#btnExportFiltered');
const btnExportAll      = $('#btnExportAll');

const tbody = $('#tbody');

const sumTotal   = $('#sumTotal');
const sumMasuk   = $('#sumMasuk');
const sumSelesai = $('#sumSelesai');
const sumIzin    = $('#sumIzin');
const sumLibur   = $('#sumLibur');
const sumAlpha   = $('#sumAlpha');

// Modal
const editModalEl = $('#editModal');
const modal = new bootstrap.Modal(editModalEl);
const modalEmpName = $('#modalEmpName');
const modalEmpId   = $('#modalEmpId');
const modalStatus  = $('#modalStatus');
const modalNote    = $('#modalNote');
const modalSave    = $('#modalSave');
let MODAL_EMP_ID   = '';

// ======= Render =======
function badgeFor(status){
  const s = String(status||'').toLowerCase();
  let cls='text-bg-secondary';
  if (s==='masuk') cls='text-bg-success';
  else if (s==='alpha') cls='text-bg-danger';
  else if (s==='izin') cls='text-bg-warning';
  else if (s==='libur') cls='text-bg-secondary';
  else if (s==='selesai') cls='text-bg-secondary';
  return `<span class="badge ${cls}">${s||'—'}</span>`;
}
function renderSummary(rows){
  const t = rows.length;
  const c = (k) => rows.filter(r => String(r.status_view||'').toLowerCase()===k).length;
  sumTotal.textContent   = t;
  sumMasuk.textContent   = c('masuk');
  sumSelesai.textContent = c('selesai');
  sumIzin.textContent    = c('izin');
  sumLibur.textContent   = c('libur');
  sumAlpha.textContent   = c('alpha');
}

function renderRowsPage(){
  const total = VIEW.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  PAGE = Math.min(Math.max(1, PAGE), totalPages);
  const start = (PAGE-1) * PAGE_SIZE;
  const pageRows = VIEW.slice(start, start + PAGE_SIZE);

  resultInfo.textContent = `Menampilkan ${pageRows.length} dari ${total} baris`;
  pageInfo.textContent = `Halaman ${PAGE} / ${totalPages}`;
  firstPageBtn.disabled = PAGE<=1;
  prevPageBtn.disabled  = PAGE<=1;
  nextPageBtn.disabled  = PAGE>=totalPages;
  lastPageBtn.disabled  = PAGE>=totalPages;

  tbody.innerHTML = pageRows.map((r)=>`
    <tr>
      <td>
        <div class="fw-semibold">${r.name||'-'}</div>
        <div class="small text-muted d-sm-none">${r.division||'-'}</div>
      </td>
      <td class="d-none d-sm-table-cell">${r.division||'-'}</td>
      <td>${toHHMM(r.check_in)}</td>
      <td>${toHHMM(r.check_out)}</td>
      <td>${badgeFor(r.status_view)}</td>
      <td class="d-none d-md-table-cell">${(r.note || '').replace(/</g,'&lt;')}</td>
      <td class="text-center">
        ${r.derived ? '<span class="badge text-bg-light">virtual</span>' : ''}
      </td>
      <td>
        <button class="btn btn-sm btn-outline-primary w-100 w-md-auto" data-action="edit" data-id="${r.employee_id}">Edit</button>
      </td>
    </tr>
  `).join('');

  $$( 'button[data-action="edit"]' ).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-id');
      const row = ROWS.find(x => x.employee_id === id);
      if (!row) return;
      MODAL_EMP_ID = id;
      modalEmpName.textContent = row.name || '-';
      modalEmpId.textContent   = row.employee_id || '-';
      modalStatus.value = ['masuk','izin','alpha','libur'].includes(String(row.status_view||'').toLowerCase())
        ? String(row.status_view).toLowerCase() : 'masuk';
      modalNote.value = row.note || '';
      modal.show();
    });
  });
}

function setSortIndicator(){
  $$('th[data-sort-key] .sort-indicator').forEach(s => s.textContent = '');
  const th = $(`th[data-sort-key="${SORT_KEY}"] .sort-indicator`);
  if (th) th.textContent = SORT_DIR === 'asc' ? '↑' : '↓';
}

// Robust comparator: kosong di-akhir, waktu diparse, stabil
function cmp(a,b){
  if (a===b) return 0;
  if (a==='' || a==null) return 1;
  if (b==='' || b==null) return -1;
  return a < b ? -1 : (a > b ? 1 : 0);
}
function compareVal(a,b,key, idxA, idxB){
  const A = a[key] ?? '';
  const B = b[key] ?? '';

  if (key==='check_in' || key==='check_out'){
    const ta = Date.parse(A) || 0;
    const tb = Date.parse(B) || 0;
    const c = cmp(ta, tb);
    return c !== 0 ? c : cmp(idxA, idxB);
  }
  const c = cmp(String(A).toLowerCase(), String(B).toLowerCase());
  return c !== 0 ? c : cmp(idxA, idxB); // stabil
}

function applySearchSort(){
  const q = (SEARCH||'').trim().toLowerCase();
  if (!q) VIEW = ROWS.map((r,i)=>({__i:i, ...r}));
  else {
    VIEW = ROWS.map((r,i)=>({__i:i, ...r})).filter(r=>{
      return (r.name||'').toLowerCase().includes(q) ||
             (r.employee_id||'').toLowerCase().includes(q) ||
             (r.division||'').toLowerCase().includes(q) ||
             (r.status_view||'').toLowerCase().includes(q) ||
             (r.note||'').toLowerCase().includes(q);
    });
  }

  VIEW.sort((a,b)=>{
    const dir = (SORT_DIR==='asc') ? 1 : -1;
    return compareVal(a,b,SORT_KEY,a.__i,b.__i) * dir;
  });

  renderSummary(VIEW);
  setSortIndicator();
  renderRowsPage();
}

// ======= Actions =======
async function loadDivisions(){
  const res = await apiGet({ action:'divisions' });
  if (!res.ok){ showAlert(res.error||'Gagal memuat divisi','danger'); return; }
  DIVISIONS = res.data || [];
  divFilter.innerHTML = `<option value="All">All</option>` + DIVISIONS.map(d=>`<option value="${d}">${d}</option>`).join('');
}
async function loadAttendance(){
  const date = datePick.value || todayYYYYMMDD();
  const div  = divFilter.value || 'All';
  const res = await apiGet({ action:'attendance', date, division: div }, TOKEN);
  if (!res.ok){ showAlert(res.error||'Gagal memuat data','danger'); return; }
  ROWS = res.data || [];

  PAGE = 1;
  applySearchSort();
}

// ======= Export CSV =======
function exportRows(rows, filename){
  const header = ['date','employee_id','name','division','check_in','check_out','status_view','note','derived'];
  const mapped = rows.map(r => ({
    date: r.date || '',
    employee_id: r.employee_id || '',
    name: r.name || '',
    division: r.division || '',
    check_in: r.check_in || '',
    check_out: r.check_out || '',
    status_view: r.status_view || '',
    note: r.note || '',
    derived: r.derived ? 'virtual' : ''
  }));
  const blob = toCSV(mapped, header);
  downloadBlob(blob, filename);
}

// ======= Events =======
$('#btnLogin').addEventListener('click', async ()=>{
  const admin_id = inpAdminId.value.trim();
  const admin_key = inpAdminKey.value.trim();
  if (!admin_id || !admin_key) return showAlert('Lengkapi Admin ID & Key','warning');

  const res = await apiPost('login', { admin_id, admin_key });
  if (!res.ok){ showAlert(res.error||'Login gagal','danger'); return; }

  TOKEN = res.data.token;
  loginCard.classList.add('d-none');
  dashWrap.classList.remove('d-none');

  datePick.value = todayYYYYMMDD();
  await loadDivisions();
  await loadAttendance();
});

btnReload.addEventListener('click', async ()=>{ await loadAttendance(); });

btnHolidayToday.addEventListener('click', async ()=>{
  if (!TOKEN) return showAlert('Login terlebih dahulu','warning');
  const res = await apiPost('set-holiday-today', { token: TOKEN, description: 'Libur' });
  if (!res.ok){ showAlert(res.error||'Gagal set libur','danger'); return; }
  showAlert('Hari ini diset libur','success');
  await loadAttendance();
});

btnMaterialize.addEventListener('click', async ()=>{
  if (!TOKEN) return showAlert('Login terlebih dahulu','warning');
  const date = datePick.value || todayYYYYMMDD();
  const div  = divFilter.value || 'All';
  const res = await apiPost('materialize-alpha', { token: TOKEN, date, division: div });
  if (!res.ok){ showAlert(res.error||'Gagal materialize','danger'); return; }
  showAlert(`Alpha dibuat: ${res.data.inserted}`, 'success');
  await loadAttendance();
});

divFilter.addEventListener('change', async ()=>{ await loadAttendance(); });

searchInput.addEventListener('input', debounce(()=>{
  SEARCH = searchInput.value || '';
  PAGE = 1;
  applySearchSort();
}, 250));

pageSizeSel.addEventListener('change', ()=>{
  PAGE_SIZE = parseInt(pageSizeSel.value,10) || 10;
  PAGE = 1;
  renderRowsPage();
});

firstPageBtn.addEventListener('click', ()=>{ PAGE=1; renderRowsPage(); });
prevPageBtn.addEventListener('click',  ()=>{ PAGE=Math.max(1,PAGE-1); renderRowsPage(); });
nextPageBtn.addEventListener('click',  ()=>{
  const totalPages = Math.max(1, Math.ceil(VIEW.length / PAGE_SIZE));
  PAGE=Math.min(totalPages,PAGE+1);
  renderRowsPage();
});
lastPageBtn.addEventListener('click',  ()=>{
  const totalPages = Math.max(1, Math.ceil(VIEW.length / PAGE_SIZE));
  PAGE=totalPages; renderRowsPage();
});

// Sorting via header (indikator dinamis)
$$('th[data-sort-key]').forEach(th=>{
  th.addEventListener('click', ()=>{
    const key = th.getAttribute('data-sort-key');
    if (SORT_KEY === key){ SORT_DIR = (SORT_DIR === 'asc') ? 'desc' : 'asc'; }
    else { SORT_KEY = key; SORT_DIR = 'asc'; }
    applySearchSort();
  });
});

btnExportFiltered.addEventListener('click', ()=>{
  if (!VIEW.length){ showAlert('Tidak ada data untuk diekspor','warning'); return; }
  const date = datePick.value || todayYYYYMMDD();
  // VIEW berisi __i → hilangkan sebelum export
  const viewClean = VIEW.map(({__i, ...r}) => r);
  exportRows(viewClean, `presensi_${date}_${(divFilter.value||'All')}_FILTER.csv`);
});

btnExportAll.addEventListener('click', ()=>{
  if (!ROWS.length){ showAlert('Tidak ada data untuk diekspor','warning'); return; }
  const date = datePick.value || todayYYYYMMDD();
  exportRows(ROWS, `presensi_${date}_${(divFilter.value||'All')}_ALL.csv`);
});

// Init
(function init(){
  try{
    pageSizeSel.value = '10';
    PAGE_SIZE = 10;
    datePick.value = todayYYYYMMDD();
  }catch(_){}
})();
