// app.js — lightweight frontend logic (ES module)
const API_BASE = ''; // set to backend base URL, e.g. 'https://api.example.com'
const MOCK = true;    // set true to force using mock-data.json when developing

const selectors = {
  apptsList: document.getElementById('appointments-list'),
  services: document.getElementById('service-select'),
  dentists: document.getElementById('dentist-select'),
  bookingForm: document.getElementById('booking-form'),
  formMsg: document.getElementById('form-msg'),
  openBookingBtn: document.getElementById('open-booking'),
  resetBtn: document.getElementById('reset-form'),
  bookingCard: document.getElementById('booking-card'),
  yearEl: document.getElementById('year')
};

selectors.yearEl.textContent = new Date().getFullYear();

// minimal fetch helper
async function fetchJson(path, opts = {}) {
  try {
    const res = await fetch((API_BASE || '') + path, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Fetch failed for', path, err.message);
    throw err;
  }
}

// Load initial data: services, dentists, appointments
async function loadInitialData() {
  try {
    const [services, dentists, appointments] = await Promise.all([
      loadResource('/api/services', '/mock-data.json', 'services'),
      loadResource('/api/dentists', '/mock-data.json', 'dentists'),
      loadResource('/api/appointments', '/mock-data.json', 'appointments')
    ]);
    populateServices(services);
    populateDentists(dentists);
    renderAppointments(appointments);
  } catch (err) {
    selectors.apptsList.textContent = 'Unable to load data — check console or fall back to mock-data.json';
  }
}

// Generic loader: try API then fallback to local mock data (mockKey is property name in mock file)
async function loadResource(apiPath, mockPath, mockKey) {
  if (!MOCK && API_BASE) {
    try { return await fetchJson(apiPath); } catch {}
  }
  // fallback: read mock file then pick key
  const mock = await (await fetch(mockPath)).json();
  return mock[mockKey] || [];
}

function populateServices(list = []) {
  selectors.services.innerHTML = `<option value="">Select a service</option>`;
  list.forEach(s => {
    const o = document.createElement('option');
    o.value = s.serviceId ?? s.id ?? '';
    o.textContent = `${s.name} (${s.durationMinutes ?? s.duration ?? '?'} min) - ₱${s.price ?? s.cost ?? '0'}`;
    selectors.services.appendChild(o);
  });
}

function populateDentists(list = []) {
  selectors.dentists.innerHTML = `<option value="">Select a dentist</option>`;
  list.forEach(d => {
    const o = document.createElement('option');
    o.value = d.dentistId ?? d.id ?? '';
    o.textContent = `${d.firstName} ${d.lastName} ${d.specialization ? '— ' + d.specialization : ''}`;
    selectors.dentists.appendChild(o);
  });
}

function renderAppointments(list = []) {
  if (!list || list.length === 0) {
    selectors.apptsList.innerHTML = `<div class="list-placeholder">No upcoming appointments</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  list.sort((a,b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));
  list.forEach(a => {
    const el = document.createElement('div');
    el.className = 'appointment';
    const name = `${a.patient?.firstName ?? a.firstName ?? 'Unknown'} ${a.patient?.lastName ?? a.lastName ?? ''}`;
    const dentist = a.dentist ? `${a.dentist.firstName} ${a.dentist.lastName}` : (a.dentistName || 'TBD');
    const start = new Date(a.scheduledStart);
    el.innerHTML = `
      <div class="appt-info">
        <div class="avatar">${(a.patient?.firstName ?? a.firstName ?? 'U').slice(0,1)}</div>
        <div class="appt-meta">
          <strong>${name}</strong>
          <small>${dentist} • ${start.toLocaleString()}</small>
        </div>
      </div>
      <div>
        <small style="color:var(--muted)">${a.status ?? 'Pending'}</small>
      </div>
    `;
    frag.appendChild(el);
  });
  selectors.apptsList.innerHTML = '';
  selectors.apptsList.appendChild(frag);
}

// Form handling
selectors.bookingForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  selectors.formMsg.textContent = '';
  const f = new FormData(selectors.bookingForm);

  // simple client-side validation & payload
  const payload = {
    firstName: f.get('firstName')?.trim(),
    lastName: f.get('lastName')?.trim(),
    email: f.get('email')?.trim(),
    serviceId: Number(f.get('serviceId')),
    dentistId: Number(f.get('dentistId')),
    notes: f.get('notes')?.trim()
  };
  const date = f.get('date');
  const time = f.get('time');
  if (!payload.firstName || !payload.lastName || !payload.email || !payload.serviceId || !payload.dentistId || !date || !time) {
    selectors.formMsg.textContent = 'Please fill all required fields.';
    return;
  }

  // compose ISO times (local)
  const start = new Date(`${date}T${time}`);
  // assume service duration from select option text, but backend should calculate exact end
  const durationMinutes = 30;
  const end = new Date(start.getTime() + durationMinutes * 60000);

  const appt = {
    patientFirstName: payload.firstName,
    patientLastName: payload.lastName,
    patientEmail: payload.email,
    patientPhone: '', // optional
    serviceId: payload.serviceId,
    dentistId: payload.dentistId,
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    notes: payload.notes,
    status: 'Pending'
  };

  try {
    // Try to post to backend; if not available, write to console and update UI with optimistic add.
    if (API_BASE && !MOCK) {
      const res = await fetchJson('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appt)
      });
      selectors.formMsg.textContent = 'Appointment created successfully.';
    } else {
      console.info('MOCK POST appointment', appt);
      selectors.formMsg.textContent = 'Mock booking recorded locally (backend offline).';
    }
    // optimistic UI: add to list
    renderAppointments([{
      patient: { firstName: payload.firstName, lastName: payload.lastName },
      dentist: { firstName: 'TBD', lastName: '' },
      scheduledStart: start.toISOString(),
      status: 'Pending'
    }, ...Array.from(selectors.apptsList.querySelectorAll('.appointment')).map(()=>{}) /* no-op */]);

    selectors.bookingForm.reset();
  } catch (err) {
    console.error(err);
    selectors.formMsg.textContent = 'Failed to create appointment — try again.';
  }
});

selectors.openBookingBtn.addEventListener('click', () => {
  selectors.bookingCard.scrollIntoView({behavior:'smooth', block:'center'});
  document.getElementById('patient-first').focus();
});
selectors.resetBtn.addEventListener('click', () => selectors.bookingForm.reset());

// initialize
loadInitialData();
