// ── app.js — oPLUS LMS v20.05 ────────────────────────────────────────────
// PIN, auth state, routing, inactivity, dashboard — loads AFTER main script

async function hashPin(pin) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}
function isHashed(val) { return typeof val === 'string' && val.length === 64; }

function toggleEye(id, btn) {
  var el = document.getElementById(id);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.style.opacity = el.type === 'text' ? '1' : '0.4';
}

function goBack() {
  var cur = stack[stack.length-1];
  // If mid-order, swipe/back navigates between steps — never discards
  if (cur === 's-order') {
    if (_curStep === 3)  { showStep(2); return; }
    if (_curStep === 2)  { showStep('1b'); return; }
    if (_curStep === '1b') { showStep(1); return; }
    // Step 1: confirm discard only when truly leaving the order
    if (curOrder.patientName || selTests.length > 0) {
      if (!confirm('Discard this order? All entered data will be lost.')) return;
    }
  }
  if (stack.length > 1) stack.pop();
  var prev = stack[stack.length-1] || 's-dash';
  showScreen(prev);
  // After going back, push a fresh sentinel so the NEXT back press
  // is also caught — without this, back would exit after one goBack().
  history.pushState({appNav: true}, '', '');
}
// Seed initial sentinel state
history.replaceState({appNav: true}, '', '');

// Intercept Android hardware back button / browser back gesture
var _popstateBusy = false;
window.addEventListener('popstate', function(e) {
  // Debounce — Android sometimes fires twice on a single swipe
  if (_popstateBusy) { history.pushState({appNav: true}, '', ''); return; }
  _popstateBusy = true;
  setTimeout(function(){ _popstateBusy = false; }, 350);

  // Always re-push sentinel immediately
  history.pushState({appNav: true}, '', '');

  // Close any open modal first before navigating back
  var editBg = document.getElementById('edit-modal-bg');
  if (editBg && editBg.style.display !== 'none') { closeEditModal(); return; }
  var fieldBg = document.getElementById('field-modal-bg');
  if (fieldBg && fieldBg.style.display !== 'none') { closeFieldModal(); return; }
  var transferBg = document.getElementById('field-transfer-bg');
  if (transferBg && transferBg.style.display !== 'none') { closeTransferModal(); return; }
  var timeReassignBg = document.getElementById('time-reassign-bg');
  if (timeReassignBg && timeReassignBg.style.display !== 'none') { closeTimeReassign(); return; }

  if (stack.length > 1) {
    goBack();
  }
  // If at root (stack.length === 1) just swallow — app stays open.
});

// ── AUTH STATE ──
var loadTO = setTimeout(function(){
  document.getElementById('load-txt').textContent = 'Taking too long...';
  document.getElementById('load-retry').style.display = 'block';
}, 10000);

// Global error safety net
window.addEventListener('error', function(e) {
  var loading = document.getElementById('loading');
  if (loading && loading.style.display !== 'none') {
    document.getElementById('load-txt').textContent = 'Error: ' + (e.message || 'Unknown error');
    document.getElementById('load-retry').style.display = 'block';
  }
  console.error('Global error:', e.message, e.filename, e.lineno);
});

// ── AUTH TABS ──
function switchTab(t) {
  document.getElementById('tab-login').className = 'auth-tab' + (t==='login'?' active':'');
  document.getElementById('tab-reg').className = 'auth-tab' + (t==='reg'?' active':'');
  document.getElementById('form-login').style.display = t==='login'?'block':'none';
  document.getElementById('form-reg').style.display = t==='reg'?'block':'none';
}

function setRole(r) {
  selRole = r;
  ['reception','lab','admin','pathologist','phlebotomist'].forEach(function(x){
    var btn = document.getElementById('role-'+x);
    if (x===r) {
      btn.style.background='rgba(255,255,255,0.22)';
      btn.style.borderColor='rgba(255,255,255,0.6)';
      btn.style.color='#fff';
    } else {
      btn.style.background='rgba(255,255,255,0.06)';
      btn.style.borderColor='rgba(255,255,255,0.2)';
      btn.style.color='rgba(255,255,255,0.6)';
    }
  });
}


function doLogin() {
  var email = document.getElementById('a-email').value.trim();
  var pass = document.getElementById('a-pass').value;
  var err = document.getElementById('login-err');
  var btn = document.getElementById('login-btn');
  if (!email||!pass) { err.textContent='Enter email and password'; return; }
  btn.disabled=true; btn.textContent='Signing in...';
  auth.signInWithEmailAndPassword(email, pass).catch(function(e){
    err.textContent = authErr(e.code);
    btn.disabled=false; btn.textContent='Sign In';
  });
}

function doRegister() {
  var name = document.getElementById('r-name').value.trim();
  var email = document.getElementById('r-email').value.trim();
  var pass = document.getElementById('r-pass').value;
  var pin = document.getElementById('r-pin').value;
  var err = document.getElementById('reg-err');
  var btn = document.getElementById('reg-btn');
  if (!name||!email||!pass) { err.textContent='Fill all fields'; return; }
  if (!/^[0-9]{4}$/.test(pin)) { err.textContent='PIN must be 4 digits'; return; }
  btn.disabled=true; btn.textContent='Creating...';
  hashPin(pin).then(function(pinHash){
  var _adminEmail1 = curUser.email;
  auth.createUserWithEmailAndPassword(email, pass).then(function(cred){
    return db.collection('staff').doc(cred.user.uid).set({
      name:name, email:email, role:selRole, pin:pinHash, uid:cred.user.uid,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(), active:true
    });
  }).then(function(){
    return auth.signInWithEmailAndPassword(_adminEmail1, pass);
  }).then(function(){ toast('Account created!','ok'); })
  .catch(function(e){ err.textContent=authErr(e.code); btn.disabled=false; btn.textContent='Create Account'; });
  });
}

function authErr(code) {
  var map = {
    'auth/user-not-found':'No account with that email',
    'auth/wrong-password':'Incorrect password',
    'auth/email-already-in-use':'Email already registered',
    'auth/weak-password':'Password too short (min 6)',
    'auth/invalid-email':'Invalid email',
    'auth/too-many-requests':'Too many attempts, try later',
    'auth/network-request-failed':'No internet connection'
  };
  return map[code] || 'Error: ' + code;
}

function doSignOut() {
  logActivity('logout', 'Signed out');
  // Teardown timers and listeners before signout
  clearTimeout(_inactivityTimer); _inactivityTimer = null;
  if (seniorLabUnsub)     { seniorLabUnsub();     seniorLabUnsub = null; }
  if (hoUnsubscribe)      { hoUnsubscribe();      hoUnsubscribe = null; }
  if (fieldUnsubscribe)   { fieldUnsubscribe();   fieldUnsubscribe = null; }
  if (phleboDashUnsub)    { phleboDashUnsub();    phleboDashUnsub = null; }
  if (assignUnsub)        { assignUnsub();        assignUnsub = null; }
  if (fieldDashUnsub)     { fieldDashUnsub();     fieldDashUnsub = null; }
  // Clear all session state
  curDetailOrder = null;
  curOrder = {};
  selTests = [];
  allOrders = [];
  _pendingDuesForReminder = [];
  allDoctorsCache = null;
  editSelTests = [];
  curHistory = {};
  selDiagnoses = [];
  selMeds = [];
  auth.signOut().then(function(){
    curUser=null; curProfile=null; pinBuf=''; lastOrder=null;
    stack=[];
    var _lb = document.getElementById('login-btn');
    if (_lb) { _lb.disabled=false; _lb.textContent='Sign In'; }
    var _le = document.getElementById('login-err'); if (_le) _le.textContent='';
    document.getElementById('a-email').value='';
    document.getElementById('a-pass').value='';
    goTo('s-auth', false); stack=['s-auth'];
  });
}

// ── RESET PASSWORD ──
function showReset() {
  var email = document.getElementById('a-email');
  if (email) document.getElementById('reset-email').value = email.value||'';
  document.getElementById('reset-err').textContent='';
  document.getElementById('reset-btn').disabled=false;
  document.getElementById('reset-btn').textContent='Send Link';
  document.getElementById('reset-modal').classList.add('open');
}
function closeReset() { document.getElementById('reset-modal').classList.remove('open'); }
function sendReset() {
  var email = document.getElementById('reset-email').value.trim();
  var err = document.getElementById('reset-err');
  var btn = document.getElementById('reset-btn');
  if (!email) { err.textContent='Enter your email'; return; }
  btn.disabled=true; btn.textContent='Sending...';
  auth.sendPasswordResetEmail(email).then(function(){
    closeReset();
    toast('Reset link sent to '+email,'ok');
  }).catch(function(e){ err.textContent=authErr(e.code); btn.disabled=false; btn.textContent='Send Link'; });
}

// ── PIN ──
function setupPin() {
  var h = new Date().getHours();
  var g = h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  var name = curProfile && curProfile.name ? curProfile.name.split(' ')[0] : 'Doctor';
  document.getElementById('pin-name').textContent = g + ', ' + name;
  document.getElementById('pin-role').textContent = (curProfile&&curProfile.role||'staff').toUpperCase() + ' - Enter PIN';
  pinBuf=''; renderDots();
}
function pk(k) {
  document.getElementById('pin-err').textContent='';
  if (k==='back') pinBuf=pinBuf.slice(0,-1);
  else if (k==='clear') pinBuf='';
  else if (pinBuf.length<4) pinBuf+=k;
  renderDots();
  if (pinBuf.length===4) setTimeout(checkPin,150);
}
function renderDots() {
  for (var i=0;i<4;i++) {
    document.getElementById('pd'+i).className='pin-dot'+(i<pinBuf.length?' filled':'');
  }
}
// ── PIN LOCKOUT STATE ──
var _pinWrongCount = 0;       // wrong attempts this lock session
var _pinLockedUntil = 0;      // timestamp ms — 0 = not locked
var PIN_MAX_ATTEMPTS = 5;     // lock after this many wrong attempts
var PIN_LOCKOUT_MS   = 60000; // 60-second cooldown

async function checkPin() {
  var errEl = document.getElementById('pin-err');

  // Lockout active?
  var now = Date.now();
  if (_pinLockedUntil > now) {
    var secs = Math.ceil((_pinLockedUntil - now) / 1000);
    errEl.textContent = 'Too many attempts — wait ' + secs + 's';
    pinBuf = ''; renderDots();
    // Countdown refresh so the message updates every second
    setTimeout(function(){ if (Date.now() < _pinLockedUntil) { errEl.textContent = 'Too many attempts — wait ' + Math.ceil((_pinLockedUntil - Date.now()) / 1000) + 's'; } else { errEl.textContent = ''; _pinWrongCount = 0; } }, 1000);
    return;
  }

  var stored = curProfile && curProfile.pin ? curProfile.pin : '';
  if (!stored) { _pinWrongCount = 0; unlock(); return; }

  // Force reset if PIN is still plain text (not hashed)
  if (!isHashed(stored)) {
    pinBuf = '';
    renderDots();
    errEl.textContent = 'Security upgrade: please set a new PIN below';
    setTimeout(function(){ showSelfPinReset(); }, 300);
    return;
  }

  var hashed = await hashPin(pinBuf);
  if (hashed === stored) {
    _pinWrongCount = 0; _pinLockedUntil = 0;
    unlock();
  } else {
    _pinWrongCount++;
    pinBuf = ''; renderDots();
    if (_pinWrongCount >= PIN_MAX_ATTEMPTS) {
      _pinLockedUntil = Date.now() + PIN_LOCKOUT_MS;
      errEl.textContent = 'Too many attempts — locked for 60s';
      logActivity('pin_lockout', 'PIN lockout triggered after ' + _pinWrongCount + ' failed attempts');
      // Auto-clear message after lockout expires
      setTimeout(function(){ errEl.textContent = ''; _pinWrongCount = 0; }, PIN_LOCKOUT_MS);
    } else {
      var remaining = PIN_MAX_ATTEMPTS - _pinWrongCount;
      errEl.textContent = 'Incorrect PIN — ' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining';
    }
  }
}

// ── INACTIVITY AUTO-LOCK ──────────────────────────────────────────────────
var _inactivityTimer = null;
var INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function resetInactivityTimer() {
  if (!curUser || !curProfile) return; // not logged in
  clearTimeout(_inactivityTimer);
  _inactivityTimer = setTimeout(function() {
    // Only lock if user is on a screen past the PIN screen
    var current = stack[stack.length - 1];
    if (!current || current === 's-auth' || current === 's-pin') return;
    pinBuf = ''; renderDots();
    setupPin();
    goTo('s-pin', false);
    stack = ['s-pin'];
    toast('Locked due to inactivity', 'warn');
  }, INACTIVITY_TIMEOUT_MS);
}

function initInactivityWatcher() {
  ['touchstart', 'touchend', 'click', 'keydown', 'scroll'].forEach(function(evt) {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });
  resetInactivityTimer();
}
// ─────────────────────────────────────────────────────────────────────────

function unlock() {
  // Check if admin has queued an email change for this user
  if (curUser && curProfile && curProfile.pendingEmail && curProfile.pendingEmail !== curUser.email) {
    var newEmail = curProfile.pendingEmail;
    curUser.updateEmail(newEmail).then(function() {
      return db.collection('staff').doc(curUser.uid).update({
        email: newEmail,
        pendingEmail: firebase.firestore.FieldValue.delete()
      });
    }).then(function() {
      toast('Your login email has been updated to ' + newEmail, 'ok');
      curProfile.email = newEmail;
      delete curProfile.pendingEmail;
    }).catch(function(e) {
      console.warn('pendingEmail update failed:', e.message);
    });
  }
  // Check for temp doctor assignment for today
  db.collection('temp_roles')
    .where('staffId','==',curUser.uid)
    .where('date','==',todayStr())
    .where('active','==',true)
    .where('type','==','doctor')
    .get().then(function(snap) {
      if (!snap.empty) {
        var td = snap.docs[0].data().tempDoctor;
        curProfile.effectiveDoctor = td;
        toast('⚔ Today assigned to: ' + td, 'ok');
      } else {
        curProfile.effectiveDoctor = curProfile.defaultDoctor || '';
        if (!curProfile.defaultDoctors) curProfile.defaultDoctors = curProfile.defaultDoctor ? [curProfile.defaultDoctor] : [];
      }
    }).catch(function() {
      curProfile.effectiveDoctor = curProfile.defaultDoctor || '';
    });
  var role = curProfile && curProfile.role || '';
  lastOrder = null; // clear any stale order from previous user/session
  routeAfterPin(role);
  applyManagerRestrictions(role);
  logActivity('login', 'Logged in');
  initInactivityWatcher(); // start inactivity timer after successful login
}

// ── SELF-SERVICE PIN RESET (all roles) ──────────────────────────────────
function showSelfPinReset() {
  var existing = document.getElementById('pin-reset-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'pin-reset-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--accent);z-index:9999;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;padding:40px 28px;overflow-y:auto';
  overlay.innerHTML =
    '<div style="font-family:var(--serif);font-size:28px;font-weight:300;color:#fff;margin-bottom:6px">Set New PIN</div>'
    + '<div style="font-size:13px;color:rgba(255,255,255,0.55);font-family:var(--mono);margin-bottom:32px">Security upgrade &#8212; choose a new 4-digit PIN</div>'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.5);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">New PIN</div>'
    + '<input id="prs-pin1" type="password" maxlength="4" inputmode="numeric" placeholder="Enter 4-digit PIN" style="width:100%;padding:12px 14px;border:0.5px solid rgba(255,255,255,0.25);border-radius:10px;background:rgba(255,255,255,0.1);color:#fff;font-size:18px;letter-spacing:6px;font-family:var(--mono);margin-bottom:16px">'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.5);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Confirm PIN</div>'
    + '<input id="prs-pin2" type="password" maxlength="4" inputmode="numeric" placeholder="Re-enter PIN" style="width:100%;padding:12px 14px;border:0.5px solid rgba(255,255,255,0.25);border-radius:10px;background:rgba(255,255,255,0.1);color:#fff;font-size:18px;letter-spacing:6px;font-family:var(--mono);margin-bottom:20px">'
    + '<div id="prs-err" style="color:rgba(255,180,160,1);font-size:13px;font-family:var(--mono);min-height:18px;margin-bottom:14px"></div>'
    + '<button onclick="saveSelfPin()" style="width:100%;padding:13px;background:#fff;color:var(--accent);border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:12px">Save PIN</button>'
    + '<button onclick="doSignOut()" style="width:100%;padding:13px;background:transparent;color:rgba(255,255,255,0.5);border:0.5px solid rgba(255,255,255,0.2);border-radius:10px;font-size:13px;cursor:pointer">Sign out instead</button>';
  document.getElementById('app').appendChild(overlay);
}

async function saveSelfPin() {
  var pin1 = (document.getElementById('prs-pin1').value || '').trim();
  var pin2 = (document.getElementById('prs-pin2').value || '').trim();
  var errEl = document.getElementById('prs-err');
  errEl.textContent = '';
  if (!/^[0-9]{4}$/.test(pin1)) { errEl.textContent = 'PIN must be exactly 4 digits'; return; }
  if (pin1 !== pin2) { errEl.textContent = 'PINs do not match'; return; }
  var saveBtn = document.querySelector('#pin-reset-overlay button[onclick="saveSelfPin()"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  try {
    var pinHash = await hashPin(pin1);
    await db.collection('staff').doc(curUser.uid).update({ pin: pinHash });
    curProfile.pin = pinHash;
    document.getElementById('pin-reset-overlay').remove();
    toast('PIN updated \u2713 \u2014 enter your new PIN to continue', 'ok');
    logActivity('pin_change', 'PIN changed successfully');
    pinBuf = ''; renderDots();
    document.getElementById('pin-err').textContent = '';
  } catch(e) {
    errEl.textContent = 'Save failed: ' + e.message;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save PIN'; }
  }
}


// ── DASHBOARD ──
var fieldDashUnsub = null;

function loadDash() {
  var h = new Date().getHours();
  var g = h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  var name = curProfile && curProfile.name ? curProfile.name.split(' ')[0] : 'Doctor';
  document.getElementById('dash-greet').textContent = g + ', ' + name;
  document.getElementById('dash-role').textContent = (curProfile&&curProfile.role||'staff').toUpperCase() + ' - oPLUS Pitampura';
  updateConnectivityUI();
  loadStats();
  loadRecent();
  loadDues();
  checkDuesReminder();
  checkEODAutoSend();
  startFieldDashWidget();
}

function startFieldDashWidget() {
  if (fieldDashUnsub) { fieldDashUnsub(); fieldDashUnsub = null; }
  var role = curProfile && curProfile.role || '';
  // Only show for roles that manage field work — hide for phlebotomist (they have their own dash)
  if (role === 'phlebotomist') return;
  var today = todayStr();
  var card = document.getElementById('dash-field-card');
  fieldDashUnsub = db.collection('orders')
    .where('date', '==', today)
    .where('source', 'in', ['Home Collection', 'Hospital Collection'])
    .onSnapshot(function(snap) {
      var pending=0, collected=0, delivered=0, urgentPending=[];
      snap.forEach(function(d) {
        var o = d.data();
        if (o.status === 'draft' && !o.fieldStatus) { pending++; if (o.urgent) urgentPending.push(o.patientName||'Unknown'); return; }
        if (o.fieldStatus === 'delivered') { delivered++; }
        else if (o.fieldStatus === 'collected') { collected++; }
        else { pending++; if (o.urgent) urgentPending.push(o.patientName||'Unknown'); }
      });
      var total = pending + collected + delivered;
      if (!total) { if (card) card.style.display = 'none'; return; }
      if (card) card.style.display = 'block';
      var dfP = document.getElementById('df-pending');
      var dfC = document.getElementById('df-collected');
      var dfD = document.getElementById('df-delivered');
      var dfU = document.getElementById('dash-field-urgent');
      if (dfP) dfP.textContent = pending;
      if (dfC) dfC.textContent = collected;
      if (dfD) dfD.textContent = delivered;
      if (dfU) {
        if (urgentPending.length) {
          dfU.style.display = 'block';
          dfU.textContent = '🚨 ' + urgentPending.length + ' urgent pending: ' + urgentPending.join(', ');
        } else {
          dfU.style.display = 'none';
        }
      }
    }, function() { /* silent — widget is non-critical */ });
}


auth.onAuthStateChanged(function(user) {
  clearTimeout(loadTO);
  document.getElementById('loading').style.display = 'none';
  if (!user) {
    var _lb2 = document.getElementById('login-btn');
    if (_lb2) { _lb2.disabled=false; _lb2.textContent='Sign In'; }
    goTo('s-auth', false); stack = ['s-auth'];
    return;
  }
  curUser = user;
  db.collection('staff').doc(user.uid).get().then(function(snap) {
    if (snap.exists) {
      curProfile = snap.data();
      // Auto-correct email in Firestore if it doesn't match Firebase Auth
      if (curProfile.email !== user.email) {
        db.collection('staff').doc(user.uid).update({ email: user.email });
        curProfile.email = user.email;
      }
    } else {
      curProfile = { name: user.email, role: 'admin', pin: '' };
    }
    loadAppData();        // load catalogue, panels, preanalytical data async
    prewarmDoctorCache(); // start loading 5,914 doctors in background before PIN entry
    setupPin();
    stack = ['s-pin'];
    goTo('s-pin', false);
  }).catch(function(e) {
    // Firestore unavailable — do NOT grant admin access silently
    // Show error and sign out to force re-authentication when back online
    console.error('Staff profile fetch failed:', e);
    auth.signOut().then(function() {
      curUser = null; curProfile = null;
      goTo('s-auth', false); stack = ['s-auth'];
      document.getElementById('a-err').textContent = 'Cannot load staff profile. Check your connection and try again.';
    });
  });
});
