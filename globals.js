// ── globals.js — oPLUS LMS v20.02 ───────────────────────────────────────
// Firebase init, db, auth, app state, navigation — loads FIRST

// ── app.js — oPLUS LMS v20.00 ────────────────────────────────────────────
// Bootstrap, auth, routing, Firebase init, PIN, inactivity, navigation

// ── ROLE-BASED ROUTING + MANAGER + PHLEBOTOMIST HOME ──────────────────────
function routeAfterPin(role) {
  var vspan = document.getElementById('app-version-p');
  if (vspan) vspan.textContent = APP_VERSION;

  if (role === 'phlebotomist') {
    goTo('s-dash', false); stack=['s-dash'];
    loadDash();
    var fieldBtnP = document.getElementById('field-btn');
    var adminBtnP = document.getElementById('admin-btn');
    var reviewBtnP = document.getElementById('review-btn');
    if (fieldBtnP) fieldBtnP.style.display = 'block';
    if (adminBtnP) adminBtnP.style.display = 'none';
    if (reviewBtnP) reviewBtnP.style.display = 'none';
    goTo('s-phlebo', false); stack=['s-phlebo']; startPhleboDash();
  } else if (role === 'senior_lab') {
    goTo('s-dash', false); stack=['s-dash'];
    loadDash();
    // senior_lab: show field tasks, hide admin/review/eod
    var slField = document.getElementById('field-btn');
    var slAdmin = document.getElementById('admin-btn');
    var slReview = document.getElementById('review-btn');
    var slEod = document.getElementById('eod-btn');
    if (slField)  slField.style.display  = 'block';
    if (slAdmin)  slAdmin.style.display  = 'none';
    if (slReview) slReview.style.display = 'none';
    if (slEod)    slEod.style.display    = 'none';
    startSeniorLabDash();
  } else {
    goTo('s-dash', false); stack=['s-dash'];
    loadDash();
    // Show/hide buttons
    var adminBtn = document.getElementById('admin-btn');
    var reviewBtn = document.getElementById('review-btn');
    var fieldBtn = document.getElementById('field-btn');
    if (adminBtn) adminBtn.style.display = (role==='admin'||role==='pathologist') ? 'block' : 'none';
    var assignBtn=document.getElementById('assign-btn'); if(assignBtn) assignBtn.style.display=(role==='admin'||role==='pathologist'||role==='manager')?'block':'none';
    if (reviewBtn) reviewBtn.style.display = (role==='admin'||role==='manager'||role==='pathologist') ? 'block' : 'none';
    if (fieldBtn) fieldBtn.style.display = 'block'; // all roles see field tasks
    var eodBtn=document.getElementById('eod-btn'); if(eodBtn) eodBtn.style.display=(role==='admin'||role==='manager'||role==='pathologist')?'block':'none';
    // Manager sees staff list (read-only) via admin screen but no add/edit buttons
  }
}


// ── MANAGER ROLE: hide Add Staff button in admin screen ──────────────────
function applyManagerRestrictions(role) {
  if (role !== 'manager') return;
  // Hide add/edit/delete staff buttons — show read-only staff list
  var addBtn = document.querySelector('#s-admin .topbar button:not(.back-btn)');
  if (addBtn) addBtn.style.display = 'none';
  // Hide temp role, temp doctor, doctor upload sections
  ['temp-role-section','temp-doctor-section','doctor-upload-section'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ── ASYNC DATA LOADER ──────────────────────────────────────────────────
// Loads heavy JSON files after login so login screen renders instantly
var _dataLoaded = false;
var _dataLoadCallbacks = [];

function onDataReady(fn) {
  if (_dataLoaded) { fn(); } else { _dataLoadCallbacks.push(fn); }
}

function loadAppData() {
  if (_dataLoaded) return;
  var base = '/oplus-lms/';
  Promise.all([
    fetch(base + 'catalogue.json').then(function(r){ return r.json(); }),
    fetch(base + 'panels.json').then(function(r){ return r.json(); }),
    fetch(base + 'preanalytical.json').then(function(r){ return r.json(); })
  ]).then(function(results) {
    CATALOGUE = results[0];
    PANELS    = results[1];
    PA_DATA   = results[2].PA_DATA;
    loadPAOverrides(); // load Firestore pa_overrides into paOverridesCache
    PA_ERRORS = results[2].PA_ERRORS;
    PA_PREP   = results[2].PA_PREP;
    _dataLoaded = true;
    _dataLoadCallbacks.forEach(function(fn){ fn(); });
    _dataLoadCallbacks = [];
    console.log('App data loaded: ' + CATALOGUE.length + ' tests, ' + Object.keys(PANELS).length + ' panel rates');
  }).catch(function(err) {
    console.error('Failed to load app data:', err);
    // Retry once after 2s
    setTimeout(loadAppData, 2000);
  });
}


// Changes in v18:
//   - Split payment (new + edit orders)
//   - Offline persistence + service worker
//   - Phone-first order form, phone-only repeat detection
//   - Order sources: Walk-in, Home Collection, Doctor Clinic, Hospital Collection
//   - Default doctor per staff + temp doctor assignment
//   - Dashboard date picker, test row expand
//   - EOD collection charges breakdown + Send to Admin WA
//   - Edit restricted to Admin/Pathologist only
//   - Payment diff prompt after edit (refund / additional)
//   - Reverse handover (refund) mode
//   - Staff: reactivate, delete, password reset, dashboard access toggle
//   - Auto email sync from Firebase Auth on login
//   - Firebase SDK load guard
//   - Step1b toggle reset on new order
//   - Direct WA patient link, URGENT in WA TRF
//   - Patient details in handover cards
//   - Double-accept transaction guard, over-transfer guard
//   - Collection charges report by user (daily/weekly)

// ── FIREBASE ──
var FB_CONFIG = {
  apiKey: "AIzaSyCZ_Hu56lCVoZezJux4tnARahP6t3r3C90",
  authDomain: "oneplus-lms-dev.firebaseapp.com",
  projectId: "oneplus-lms-dev",
  storageBucket: "oneplus-lms-dev.firebasestorage.app",
  messagingSenderId: "290972087596",
  appId: "1:290972087596:web:b51ab559740296c0692889"
};
firebase.initializeApp(FB_CONFIG);
var auth = firebase.auth();
var db = firebase.firestore();
// Explicit LOCAL persistence — required for Safari/iOS ITP compatibility
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){});

// Enable offline persistence — queues writes locally, syncs on reconnect
db.enablePersistence({ synchronizeTabs: true })
  .catch(function(err) {
    if (err.code === 'failed-precondition') {
      console.warn('Offline persistence unavailable: multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Offline persistence not supported in this browser');
    }
  });

// Register service worker for app shell caching (offline load)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/oplus-lms/sw.js')
    .then(function(reg) {
      console.log('SW registered');
      // Check for updates when app becomes visible (user switches back)
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') reg.update();
      });
      // Also check every 4 hours as fallback
      setInterval(function() { reg.update(); }, 4 * 60 * 60 * 1000);
      // When a new SW is waiting — prompt user to update
      reg.addEventListener('updatefound', function() {
        var newWorker = reg.installing;
        newWorker.addEventListener('statechange', function() {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version ready — show update banner
            var banner = document.getElementById('update-banner');
            if (banner) banner.style.display = 'flex';
          }
        });
      });
    })
    .catch(function(err) { console.warn('SW registration failed:', err); });
  // When SW activates after skipWaiting — reload to get fresh app
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    window.location.reload();
  });
}

// Dynamic online/offline indicator
function applyUpdate() {
  navigator.serviceWorker.getRegistration().then(function(reg) {
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}

function updateConnectivityUI() {
  var dot = document.getElementById('sync-dot');
  var banner = document.getElementById('offline-banner');
  if (navigator.onLine) {
    if (dot) { dot.textContent = '● Live'; dot.style.color = 'var(--green,#10B981)'; }
    var vspan = document.getElementById('app-version'); if (vspan) vspan.textContent = APP_VERSION;
    if (banner) banner.style.display = 'none';
  } else {
    if (dot) { dot.textContent = '● Offline'; dot.style.color = '#F59E0B'; }
    var vspan2 = document.getElementById('app-version'); if (vspan2) vspan2.textContent = APP_VERSION;
    if (banner) banner.style.display = 'block';
  }
}
window.addEventListener('online',  updateConnectivityUI);
window.addEventListener('offline', updateConnectivityUI);
updateConnectivityUI(); // set version badge immediately on load

// ── STATE ──
var curUser = null;
var curProfile = null;
var pinBuf = '';
var curOrder = {};
var selTests = [];
var payMode = 'cash';
var allOrders = [];
var selRole = 'reception';
var stack = [];
var lastOrder = null;

// ── NAVIGATION ──
function showScreen(id) {
  // Clean up HO real-time listener when leaving handover screen
  if (id !== 's-ho' && hoUnsubscribe) { hoUnsubscribe(); hoUnsubscribe=null; }
  if (id !== 's-field' && fieldUnsubscribe) { fieldUnsubscribe(); fieldUnsubscribe=null; }
  if (id !== 's-assign' && assignUnsub) { assignUnsub(); assignUnsub=null; }
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  if (id === 's-orders') { ordersDateOffset=0; loadOrders(); }
  if (id === 's-order-detail') {} // loaded by openOrderDetail()
  if (id === 's-ho') loadHO();
  if (id === 's-eod') {
    var _eodRole = curProfile && curProfile.role || '';
    if (_eodRole !== 'admin' && _eodRole !== 'manager' && _eodRole !== 'pathologist') {
      toast('EOD Report is restricted to Admin, Manager and Pathologist', 'warn');
      goBack(); return;
    }
    loadEOD();
    loadEODAutoSettings();
  }
  if (id === 's-admin') loadAdminScreen();
  if (id === 's-field') loadField();
  if (id === 's-order' && !_fromEstimate) {
    curOrder={}; selTests=[]; curPanel='standard'; _orderInProgress=false;
    // Clear ALL DOM input fields — same as newOrder() but without re-calling goTo
    ['pt-name','pt-age','pt-phone','pt-ref','pt-address','bill-notes'].forEach(function(id2){
      var el=document.getElementById(id2); if(el) el.value='';
    });
    var _sx=document.getElementById('pt-sex'); if(_sx) _sx.value='';
    var _src=document.getElementById('pt-source'); if(_src) _src.value='Walk-in';
    var _ml=document.getElementById('pt-maps-link'); if(_ml) _ml.value=''; var _vtc=document.getElementById('pt-visit-time'); if(_vtc) _vtc.value='';
    var _rpb=document.getElementById('repeat-patient-banner'); if(_rpb) _rpb.style.display='none';
    var _hcf=document.getElementById('home-collection-fields'); if(_hcf) _hcf.style.display='none';
    // Auto-set doctor clinic if staff has default doctor
    var _ed = curProfile && (curProfile.effectiveDoctor || curProfile.defaultDoctor);
    if (_ed) { var _src2=document.getElementById('pt-source'); if(_src2) _src2.value='Doctor Clinic'; var _ref=document.getElementById('pt-ref'); if(_ref) _ref.value=_ed; }
    showStep(1); renderTests(); setPanelButtons();
  }
  if (id === 's-estimate') { initEstimateScreen(); }
  if (id === 's-review') { loadReview(); }
  if (id === 's-assign') { loadAssignScreen(); }
  if (id === 's-activity') {
    var _actRole = curProfile && curProfile.role || '';
    if (_actRole !== 'admin' && _actRole !== 'pathologist') {
      toast('Activity Log is restricted to Admin and Pathologist', 'warn');
      goBack(); return;
    }
    initActivityScreen();
  }
  if (id === 's-pa-editor') { initPAEditor(); }
  if (id === 's-phlebo') { startPhleboDash(); }
}
function goTo(id, push) {
  // Prevent duplicate consecutive stack entries
  if (push !== false && stack[stack.length-1] === id) {
    showScreen(id); return;
  }
  if (push !== false) stack.push(id);
  showScreen(id);
  if (push === false) {
    history.replaceState({appNav: true}, '', '');
  } else {
    history.pushState({appNav: true}, '', '');
  }
}

// ── PIN HASHING (SHA-256 via Web Crypto) ──
