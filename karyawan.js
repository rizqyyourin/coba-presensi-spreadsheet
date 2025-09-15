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

function todayLocal(){
  const d=new Date();
  return d.toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
}
function toHHMM(ts){
  if (!ts) return '—';
  const s=String(ts);
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(s)) return s.substring(11,16);
  const d=new Date(s);
  if (!isNaN(d)) return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  return '—';
}
function setBadge(status){
  const b = $('#statusBadge');
  const s = String(status||'—').toLowerCase();
  b.className = 'badge fs-6'; // reset
  if (s==='masuk') b.classList.add('text-bg-success');
  else if (s==='selesai') b.classList.add('text-bg-secondary');
  else if (s==='alpha') b.classList.add('text-bg-danger');
  else if (s==='izin') b.classList.add('text-bg-warning');
  else if (s==='libur') b.classList.add('text-bg-secondary');
  else b.classList.add('text-bg-secondary');
  b.textContent = status || '—';
}

// ======= Loading Overlay (queue) =======
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
    case 'divisions': return 'Memuat divisi…';
    case 'employees': return 'Memuat karyawan…';
    case 'my-status': return 'Membaca status…';
    case 'checkin':   return 'Mengirim presensi (Hadir)…';
    case 'checkout':  return 'Mengirim presensi (Keluar)…';
    default:          return 'Memuat…';
  }
}

// ======= API helpers =======
async function apiGet(params){
  const url = new URL(API_BASE);
  url.searchParams.set('action', params.action);
  Object.entries(params).forEach(([k,v])=>{ if(k!=='action') url.searchParams.set(k,v); });
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
let EMPLOYEES = []; // filtered by selected division
let SELECTED_ID = '';

const selDiv   = $('#division');
const selEmp   = $('#employeeSelect');
const btnCheck = $('#btnCheck');
const btnIn    = $('#btnIn');
const btnOut   = $('#btnOut');

const stDate   = $('#today');
const stIn     = $('#in');
const stOut    = $('#out');

// init date text
stDate.textContent = todayLocal();

// ======= UI helpers =======
function resetStatusCard(){
  setBadge('—');
  stIn.value = '—';
  stOut.value = '—';
}
function setButtons({check=false, inBtn=false, outBtn=false}={}){
  btnCheck.disabled = !check;
  btnIn.disabled    = !inBtn;
  btnOut.disabled   = !outBtn;
}
function onSelectEmployee(){
  SELECTED_ID = selEmp.value || '';
  resetStatusCard();
  // hanya tombol "Cek Status" yang aktif setelah pilih karyawan
  setButtons({check: !!SELECTED_ID, inBtn:false, outBtn:false});
}
function fillEmployees(list){
  selEmp.innerHTML = `<option value="" selected disabled>Pilih karyawan…</option>` +
    list.map(e=>`<option value="${e.employee_id}">${e.name} — ${e.employee_id}</option>`).join('');
  selEmp.disabled = false;
  onSelectEmployee();
}
function applyStateFrom(att){
  // att: { status_view, check_in, check_out, is_holiday }
  const status = att.status_view || '—';
  setBadge(status);
  stIn.value  = toHHMM(att.check_in);
  stOut.value = toHHMM(att.check_out);

  // Tombol aktif sesuai status
  // libur/izin → off semua; selesai → off; masuk → hanya Keluar; alpha/belum → hanya Hadir
  const s = String(status).toLowerCase();
  if (s==='libur' || s==='izin' || s==='selesai'){
    setButtons({check:true, inBtn:false, outBtn:false});
  } else if (s==='masuk'){
    setButtons({check:true, inBtn:false, outBtn:true});
  } else {
    // alpha / belum / unknown
    setButtons({check:true, inBtn:true, outBtn:false});
  }
}

// ======= Events =======
selDiv.addEventListener('change', async ()=>{
  const div = selDiv.value;
  selEmp.disabled = true;
  selEmp.innerHTML = `<option value="" selected>Memuat karyawan…</option>`;
  SELECTED_ID = '';
  setButtons({check:false, inBtn:false, outBtn:false});
  resetStatusCard();

  const j = await apiGet({ action:'employees', division: div });
  if (!j.ok){ showAlert(j.error || 'Gagal memuat karyawan','danger'); return; }
  EMPLOYEES = j.data || [];
  fillEmployees(EMPLOYEES);
});

selEmp.addEventListener('change', onSelectEmployee);

btnCheck.addEventListener('click', async ()=>{
  if (!SELECTED_ID) return showAlert('Pilih karyawan dulu','warning');
  const j = await apiGet({ action:'my-status', employee_id: SELECTED_ID });
  if (!j.ok){ showAlert(j.error || 'Gagal membaca status','danger'); return; }
  applyStateFrom(j.data || {});
  showAlert('Status diperbarui','info', 1500);
});

btnIn.addEventListener('click', async ()=>{
  if (!SELECTED_ID) return showAlert('Pilih karyawan dulu','warning');
  const j = await apiPost('checkin', { employee_id: SELECTED_ID });
  if (!j.ok){ showAlert(j.error || 'Gagal check-in','danger'); return; }
  applyStateFrom(j.data || {});
  showAlert('Check-in tercatat','success');
});

btnOut.addEventListener('click', async ()=>{
  if (!SELECTED_ID) return showAlert('Pilih karyawan dulu','warning');
  const j = await apiPost('checkout', { employee_id: SELECTED_ID });
  if (!j.ok){ showAlert(j.error || 'Gagal check-out','danger'); return; }
  applyStateFrom(j.data || {});
  showAlert('Check-out tercatat','success');
});

// ======= Init =======
(async function init(){
  try{
    // load divisions
    const divRes = await apiGet({ action:'divisions' });
    if (divRes.ok){
      const divisions = divRes.data || [];
      selDiv.innerHTML = `<option value="" selected disabled>Pilih divisi…</option>` +
        divisions.map(d=>`<option value="${d}">${d}</option>`).join('');
    }
    // tombol default mati
    setButtons({check:false, inBtn:false, outBtn:false});
  }catch(_){
    showAlert('Gagal memuat data awal','danger', 4000);
  }
})();
