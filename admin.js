// ── admin.js — oPLUS LMS v20.04 ─────────────────────────────────────────
// Staff management, roles, doctor registry, activity log, assign tasks

// ── TASK ASSIGNMENT SCREEN ─────────────────────────────────────────────────
var assignUnsub = null;

function loadAssignScreen() {
  var today = todayStr();
  document.getElementById('assign-date').textContent = today;
  var el = document.getElementById('assign-list');
  el.innerHTML = '<div class="empty">Loading...</div>';
  if (assignUnsub) { assignUnsub(); assignUnsub = null; }
  db.collection('staff').where('active','==',true).get().then(function(staffSnap) {
    var phlebos = [];
    staffSnap.forEach(function(d) {
      var s = d.data();
      if (s.role === 'phlebotomist') phlebos.push({uid:d.id, name:s.name});
    });
    assignUnsub = db.collection('orders').where('date','==',today)
      .onSnapshot(function(snap) {
        var orders = [];
        snap.forEach(function(d) {
          var o = d.data();
          if (o.source === 'Home Collection' || o.source === 'Hospital Collection') {
            orders.push(Object.assign({id:d.id}, o));
          }
        });
        orders.sort(function(a,b){ return (a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0)-(b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0); });
        if (!orders.length) { el.innerHTML = '<div class="empty">No field collection orders today</div>'; return; }
        el.innerHTML = orders.map(function(o) {
          var isCollected = o.fieldStatus === 'collected';
          var isDelivered = o.fieldStatus === 'delivered';
          var statusColor = isDelivered ? '#059669' : isCollected ? '#1D4ED8' : o.urgent ? '#DC2626' : 'var(--gold)';
          var statusLabel = isDelivered ? '✓ Delivered' : isCollected ? '⬆ Collected' : o.urgent ? '🚨 URGENT' : 'Pending';
          var updatedBy = o.fieldUpdatedBy ? '<div style="font-size:10px;font-family:var(--mono);color:var(--text3);margin-top:2px">Last update: '+esc(o.fieldUpdatedBy)+' · '+esc(o.fieldUpdatedAt||'')+'</div>' : '';
          var assignedTo = o.fieldAssignedToName ? '<div style="font-size:11px;color:var(--text2);margin-bottom:4px">Assigned to: <b>'+esc(o.fieldAssignedToName)+'</b></div>' : '';
          var mapsBtn = o.gps ? '<a href="https://maps.google.com/?q='+o.gps.lat+','+o.gps.lng+'" target="_blank" style="font-size:11px;color:#1D4ED8">&#128205; GPS</a>'
            : (o.mapsLink ? '<a href="'+o.mapsLink+'" target="_blank" style="font-size:11px;color:#1D4ED8">&#128205; Maps</a>' : '');
          var payBadge = o.status==='paid'
            ? '<span style="font-size:10px;font-family:var(--mono);background:var(--accent-light);color:var(--accent);padding:2px 7px;border-radius:20px;margin-left:6px">PAID</span>'
            : (o.status==='draft' ? '<span style="font-size:10px;font-family:var(--mono);background:#EFF6FF;color:#1D4ED8;padding:2px 7px;border-radius:20px;margin-left:6px">DISPATCH</span>'
            : '<span style="font-size:10px;font-family:var(--mono);background:var(--gold-light);color:var(--gold);padding:2px 7px;border-radius:20px;margin-left:6px">CREDIT</span>');
          var phleboOpts = '<option value="">Unassigned</option>' + phlebos.map(function(p){
            return '<option value="'+p.uid+'" data-name="'+esc(p.name)+'"'+(o.fieldAssignedToUid===p.uid?' selected':'')+'>'+esc(p.name)+'</option>';
          }).join('');
          var cardBorder = o.urgent && !isCollected && !isDelivered ? 'border-color:#FCA5A5;background:#FFF5F5' : '';
          return '<div class="card" style="margin-bottom:10px;'+cardBorder+'">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
            + '<div style="font-size:15px;font-weight:500">'+esc(o.patientName||'-')+'</div>'
            + '<span style="font-size:10px;font-family:var(--mono);background:'+statusColor+'22;color:'+statusColor+';padding:2px 8px;border-radius:20px;font-weight:600">'+statusLabel+'</span>'
            + '</div>'
            + '<div style="font-size:12px;color:var(--text2);margin-bottom:2px">'+(o.age||'-')+'yr &middot; '+esc(o.phone||'-')+'</div>'
            + '<div style="font-size:12px;color:var(--text2);margin-bottom:4px">'+esc(o.address||'No address')+' '+mapsBtn+payBadge+'</div>'
            + assignedTo
            + updatedBy
            + (isDelivered ? '' : '<select onchange="assignPhlebo(\''+o.id+'\',this)" style="width:100%;padding:8px 10px;border:0.5px solid var(--border-strong);border-radius:var(--radius);background:var(--surface);color:var(--text);font-size:13px;margin-top:6px">'+phleboOpts+'</select>')
            + '</div>';
        }).join('');
      }, function(e) { el.innerHTML = '<div class="empty">Error: '+e.message+'</div>'; });
  }).catch(function(){ el.innerHTML = '<div class="empty">Error loading staff</div>'; });
}

function assignPhlebo(orderId, selectEl) {
  var uid = selectEl.value;
  var name = uid ? (selectEl.options[selectEl.selectedIndex].dataset.name||'') : '';
  db.collection('orders').doc(orderId).update({
    fieldAssignedToUid: uid||null,
    fieldAssignedToName: name||null,
    fieldAssignedAt: uid ? firebase.firestore.FieldValue.serverTimestamp() : null
  }).then(function(){ toast(uid ? name+' assigned' : 'Unassigned','ok'); })
   .catch(function(e){ toast('Failed: '+e.message,'err'); });
}

function loadReview() {
  var today = todayStr();
  var from, to;
  if (reviewPeriod === 'week') {
    var d = new Date(); var mon = new Date(d);
    mon.setDate(d.getDate()-((d.getDay()+6)%7));
    from = mon.getFullYear()+'-'+String(mon.getMonth()+1).padStart(2,'0')+'-'+String(mon.getDate()).padStart(2,'0');
    to = today;
    set('review-period-lbl','This Week ('+from+' → '+to+')');
  } else if (reviewPeriod === 'month') {
    from = today.slice(0,8)+'01'; to = today;
    set('review-period-lbl','This Month ('+from+' → '+to+')');
  } else {
    from = document.getElementById('rev-from').value;
    to   = document.getElementById('rev-to').value;
    if (!from||!to) { toast('Select date range','warn'); return; }
    set('review-period-lbl',from+' → '+to);
  }
  var el = document.getElementById('review-list');
  if (el) el.innerHTML = '<div class="empty">Loading...</div>';
  db.collection('orders')
    .where('date','>=',from).where('date','<=',to)
    .where('source','in',['Home Collection','Hospital Collection'])
    .get().then(function(snap) {
      var byPhlebo = {};
      snap.forEach(function(d) {
        var o = d.data();
        var uid   = o.fieldAssignedToUid || o.createdBy || 'unassigned';
        var uname = o.fieldAssignedToName || o.createdByName || 'Unassigned';
        if (!byPhlebo[uid]) byPhlebo[uid] = {name:uname, total:0, collected:0, delivered:0, urgent:0, lateUrgent:0, collectMins:[], deliverMins:[]};
        var b = byPhlebo[uid]; b.total++;
        if (o.fieldStatus==='collected'||o.fieldStatus==='delivered') b.collected++;
        if (o.fieldStatus==='delivered') b.delivered++;
        if (o.urgent) {
          b.urgent++;
          // Check if late (assigned → collected > 30 min)
          if (o.fieldAssignedAt && o.collectedAt) {
            var at = o.fieldAssignedAt.toMillis ? o.fieldAssignedAt.toMillis() : 0;
            var ct = o.collectedAt.toMillis ? o.collectedAt.toMillis() : 0;
            var mins = (ct-at)/60000;
            if (mins > URGENT_LATE_MINS) b.lateUrgent++;
          } else if (!o.collectedAt) {
            b.lateUrgent++; // never collected = late
          }
        }
        // Collect-to-deliver time
        if (o.collectedAt && o.deliveredAt) {
          var cm = (o.deliveredAt.toMillis()-o.collectedAt.toMillis())/60000;
          b.deliverMins.push(cm);
        }
        // Assign-to-collect time
        if (o.fieldAssignedAt && o.collectedAt) {
          var am2 = (o.collectedAt.toMillis()-o.fieldAssignedAt.toMillis())/60000;
          b.collectMins.push(am2);
        }
      });
      renderReview(byPhlebo);
    }).catch(function(e) {
      var el = document.getElementById('review-list');
      if (!el) return;
      if (e.message && e.message.toLowerCase().indexOf('index') >= 0) {
        el.innerHTML = '<div class="empty">Index still building — please wait 2 minutes and try again.<br><small style="color:var(--text3)">'+esc(e.message)+'</small></div>';
      } else {
        el.innerHTML = '<div class="empty">Error: '+esc(e.message)+'</div>';
      }
    });
}

function avg(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce(function(s,v){return s+v;},0)/arr.length);
}

function renderReview(byPhlebo) {
  var el = document.getElementById('review-list');
  if (!el) return;
  var keys = Object.keys(byPhlebo);
  if (!keys.length) { el.innerHTML='<div class="empty">No home collection orders in this period</div>'; return; }
  el.innerHTML = keys.map(function(uid) {
    var b = byPhlebo[uid];
    var collectAvg = avg(b.collectMins);
    var deliverAvg = avg(b.deliverMins);
    var urgentLate = b.lateUrgent;
    var urgentOnTime = b.urgent - b.lateUrgent;
    return '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:12px">'
      +'<div style="font-size:15px;font-weight:600;margin-bottom:10px">'+esc(b.name)+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      +'<div style="background:var(--surface2);border-radius:8px;padding:8px 10px"><div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;margin-bottom:2px">Assigned</div><div style="font-size:18px;font-family:var(--serif);font-weight:500">'+b.total+'</div></div>'
      +'<div style="background:var(--surface2);border-radius:8px;padding:8px 10px"><div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;margin-bottom:2px">Completed</div><div style="font-size:18px;font-family:var(--serif);font-weight:500;color:#059669">'+b.delivered+'</div></div>'
      +'<div style="background:var(--surface2);border-radius:8px;padding:8px 10px"><div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;margin-bottom:2px">Avg Collect Time</div><div style="font-size:15px;font-family:var(--mono);font-weight:500">'+(collectAvg!==null?collectAvg+'m':'—')+'</div></div>'
      +'<div style="background:var(--surface2);border-radius:8px;padding:8px 10px"><div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;margin-bottom:2px">Avg Deliver Time</div><div style="font-size:15px;font-family:var(--mono);font-weight:500">'+(deliverAvg!==null?deliverAvg+'m':'—')+'</div></div>'
      +'</div>'
      +(b.urgent?'<div style="margin-top:10px;font-size:12px">Urgent: '
        +'<span style="font-family:var(--mono);background:#D1FAE5;color:#065F46;border-radius:10px;padding:2px 8px;margin-right:4px">'+urgentOnTime+' on time</span>'
        +(urgentLate?'<span style="font-family:var(--mono);background:#FEE2E2;color:#991B1B;border-radius:10px;padding:2px 8px">'+urgentLate+' late</span>':'')
        +'</div>':'')
      +'</div>';
  }).join('');
}

function set(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }


var APP_VERSION = 'v20.04';
// [moved to app.js]
// ── ACTIVITY LOGGING ─────────────────────────────────────────────────────
var ACT_ICONS = {
  login:        '🔐', logout:       '🚪',
  order_create: '🧾', order_edit:   '✏️',
  due_collect:  '💰', handover_out: '↑',
  handover_in:  '↓',  handover_rej: '✗',
  pin_change:   '🔑', staff_create: '👤',
  staff_edit:   '⚙️', eod_save:     '📋'
};

function logActivity(action, detail) {
  try {
    if (!curUser || !curUser.uid) return;
    var now = new Date();
    db.collection('activity_logs').add({
      uid:       curUser.uid,
      name:      (curProfile && curProfile.name) || curUser.email || '',
      role:      (curProfile && curProfile.role) || '',
      action:    action,
      detail:    detail || '',
      date:      todayStr(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      timeStr:   now.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})
    });
  } catch(e) { /* never block user action on log failure */ }
}

function initActivityScreen() {
  var today = todayStr();
  var fromEl = document.getElementById('act-from');
  var toEl   = document.getElementById('act-to');
  if (!fromEl.value) fromEl.value = today;
  if (!toEl.value)   toEl.value   = today;
  var sel = document.getElementById('act-staff-filter');
  if (sel.options.length <= 1) {
    db.collection('staff').where('active','==',true).get().then(function(snap) {
      snap.forEach(function(d) {
        var s = d.data();
        var opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = s.name + ' (' + (s.role||'staff') + ')';
        sel.appendChild(opt);
      });
    });
  }
  loadActivityLog();
}

function loadActivityLog() {
  var fromVal  = document.getElementById('act-from').value;
  var toVal    = document.getElementById('act-to').value;
  var staffUid = document.getElementById('act-staff-filter').value;
  var el       = document.getElementById('activity-list');
  if (!fromVal || !toVal) { el.innerHTML = '<div class="empty">Select both dates</div>'; return; }
  var diffDays = Math.floor((new Date(toVal) - new Date(fromVal)) / 86400000);
  if (diffDays < 0)  { el.innerHTML = '<div class="empty">From date must be before To date</div>'; return; }
  if (diffDays > 30) { el.innerHTML = '<div class="empty">Max range is 30 days</div>'; return; }
  el.innerHTML = '<div class="empty">Loading...</div>';
  var q = db.collection('activity_logs').where('date','>=',fromVal).where('date','<=',toVal);
  if (staffUid) q = q.where('uid','==',staffUid);
  q.orderBy('date','desc').get().then(function(snap) {
    document.getElementById('activity-sub').textContent = snap.size + ' events';
    if (snap.empty) { el.innerHTML = '<div class="empty">No activity in this range</div>'; return; }
    var rows = [];
    snap.forEach(function(d) { rows.push(d.data()); });
    rows.sort(function(a,b) {
      var ta = a.timestamp ? a.timestamp.toMillis() : 0;
      var tb = b.timestamp ? b.timestamp.toMillis() : 0;
      return tb - ta;
    });
    var byDate = {};
    rows.forEach(function(r) {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });
    var html = '';
    Object.keys(byDate).sort(function(a,b){ return b.localeCompare(a); }).forEach(function(date) {
      var parts = date.split('-');
      html += '<div style="font-size:11px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;'
            + 'letter-spacing:0.06em;margin:12px 0 6px">'
            + parts[2]+'/'+parts[1]+'/'+parts[0]+'</div>';
      byDate[date].forEach(function(r) {
        var icon = ACT_ICONS[r.action] || '•';
        var roleChip = '<span style="font-size:9px;font-family:var(--mono);background:var(--border);'
                     + 'color:var(--text3);padding:1px 5px;border-radius:3px;text-transform:uppercase;'
                     + 'margin-left:4px">'+(r.role||'')+'</span>';
        html += '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:0.5px solid var(--border)">'
              + '<div style="font-size:16px;flex-shrink:0;width:22px;text-align:center;margin-top:1px">'+icon+'</div>'
              + '<div style="flex:1;min-width:0">'
              +   '<div style="font-size:13px;font-weight:500">'+esc(r.name||'-')+roleChip+'</div>'
              +   '<div style="font-size:12px;color:var(--text2);margin-top:1px">'+esc(r.detail||r.action)+'</div>'
              + '</div>'
              + '<div style="font-size:11px;font-family:var(--mono);color:var(--text3);flex-shrink:0;margin-top:2px">'+esc(r.timeStr||'')+'</div>'
              + '</div>';
      });
    });
    el.innerHTML = html;
  }).catch(function(e) { el.innerHTML = '<div class="empty">Error: '+e.message+'</div>'; });
}
// ── DOCTOR REGISTRY UPLOAD (Admin panel) ──
async function checkDoctorRegistry() {
  var statusEl = document.getElementById('dr-upload-status');
  statusEl.textContent = 'Checking...';
  try {
    var snap = await db.collection('doctors').limit(1).get();
    if (snap.empty) {
      statusEl.textContent = 'Registry is empty — ready to upload';
      statusEl.style.color = 'var(--text3)';
    } else {
      var countSnap = await db.collection('doctors').get();
      statusEl.textContent = '✓ ' + countSnap.size.toLocaleString('en-IN') + ' doctors already in registry';
      statusEl.style.color = 'var(--accent)';
      document.getElementById('dr-clear-row').style.display = 'block';
    }
  } catch(e) { statusEl.textContent = 'Error: ' + e.message; }
}

function handleDrFile(input) {
  if (!_xlsxLoaded) { loadXLSX(function(){ handleDrFile(input); }); return; }
  var file = input.files[0];
  if (!file) return;
  var statusEl = document.getElementById('dr-upload-status');
  statusEl.textContent = 'Reading ' + file.name + '...';
  statusEl.style.color = 'var(--text3)';
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var wb = XLSX.read(ev.target.result, {type:'binary'});
      var ws = wb.Sheets['Doctors'] || wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      var doctors = rows.map(function(r) {
        return {
          name: (r['Name']||'').toString().trim(),
          specialization: (r['Specialization']||'').toString().trim(),
          legacyId: (r['Doctor_ID']||'').toString().trim(),
          source: 'imported', active: true
        };
      }).filter(function(d){ return d.name && d.name !== 'nan' && d.name.length > 1; });
      statusEl.textContent = 'Read ' + doctors.length + ' doctors — uploading...';
      uploadDoctors(doctors);
    } catch(e) { statusEl.textContent = 'Read error: ' + e.message; }
  };
  reader.readAsBinaryString(file);
}

async function uploadDoctors(doctors) {
  var statusEl = document.getElementById('dr-upload-status');
  var progressBar = document.getElementById('dr-progress-bar');
  var progressFill = document.getElementById('dr-progress-fill');
  progressBar.style.display = 'block';

  var BATCH = 400;
  var total = doctors.length;
  var uploaded = 0;

  for (var i = 0; i < total; i += BATCH) {
    var chunk = doctors.slice(i, i + BATCH);
    var batch = db.batch();
    var _batchTs = firebase.firestore.FieldValue.serverTimestamp();
    chunk.forEach(function(d) {
      var docId = d.name.replace(/[^a-zA-Z0-9\s\(\)]/g,'').replace(/\s+/g,'-').toLowerCase().slice(0,100);
      batch.set(db.collection('doctors').doc(docId), Object.assign({}, d, {updatedAt: _batchTs}), {merge:true});
    });
    try {
      await batch.commit();
      uploaded += chunk.length;
      var pct = Math.round(uploaded/total*100);
      progressFill.style.width = pct + '%';
      statusEl.textContent = 'Uploading... ' + uploaded + '/' + total + ' (' + pct + '%)';
    } catch(e) {
      statusEl.textContent = 'Batch error at ' + i + ': ' + e.message;
    }
    await new Promise(function(r){ setTimeout(r, 150); });
  }

  statusEl.textContent = '✓ Done — ' + uploaded + ' doctors uploaded to registry';
  statusEl.style.color = 'var(--accent)';
  allDoctorsCache = null; // invalidate picker cache
  toast('Doctor registry uploaded ✓ — ' + uploaded + ' doctors', 'ok');
}


// ── DOCTOR EDITOR ─────────────────────────────────────────────────────────
var _drEditDocId   = null; // Firestore doc ID of selected doctor
var _drEditCurrent = null; // current doctor object

function drEditorSearch(q) {
  var el = document.getElementById('dr-editor-results');
  drEditorCancel();
  if (!q || q.trim().length < 2) { el.innerHTML = ''; return; }
  var lq = q.toLowerCase().trim();

  // Use allDoctorsCache if available — already has all 5,914 doctors
  if (allDoctorsCache && allDoctorsCache.length > 0) {
    var results = allDoctorsCache
      .filter(function(d) { return d.name && d.name.toLowerCase().indexOf(lq) >= 0; })
      .slice(0, 10)
      .map(function(d) {
        var docId = (d.name||'').replace(/[^a-zA-Z0-9\s\(\)]/g,'').replace(/\s+/g,'-').toLowerCase().slice(0,100);
        return { id: docId, data: d };
      });
    _drRenderResults(results, el);
    return;
  }

  // Cache not loaded — fetch all doctors once into editor cache
  el.innerHTML = '<div class="empty" style="padding:8px 0">Loading...</div>';
  db.collection('doctors').get().then(function(snap) {
    var all = [];
    snap.forEach(function(d) { all.push({ id: d.id, data: d.data() }); });
    // Filter for query
    var results = all.filter(function(r) {
      return r.data.name && r.data.name.toLowerCase().indexOf(lq) >= 0;
    }).slice(0, 10);
    _drRenderResults(results, el);
  }).catch(function(e) {
    el.innerHTML = '<div class="empty">Search error: ' + esc(e.message) + '</div>';
  });
}

function _drRenderResults(results, el) {
  if (!results.length) {
    el.innerHTML = '<div class="empty" style="padding:8px 0">No doctors found</div>';
    return;
  }
  // Store for index lookup — avoids quote issues in onclick
  _drEditorResults = results;
  el.innerHTML = results.map(function(r, ri) {
    var d = r.data;
    var inactive = d.active === false;
    return '<div data-dridx="' + ri + '" onclick="_drEditorSelectIdx(this)" '
      + 'style="padding:9px 10px;cursor:pointer;border:0.5px solid var(--border);border-radius:var(--radius);'
      + 'margin-bottom:6px;background:var(--surface);opacity:' + (inactive ? '0.5' : '1') + '">'
      + '<div style="font-size:13px;font-weight:500;color:' + (inactive ? 'var(--text3)' : 'var(--text)') + '">'
      + esc(d.name || '-')
      + (inactive ? ' <span style="font-size:10px;font-family:var(--mono);color:var(--red)">[INACTIVE]</span>' : '')
      + '</div>'
      + (d.specialization ? '<div style="font-size:11px;color:var(--text3)">' + esc(d.specialization) + '</div>' : '')
      + '</div>';
  }).join('');
}

var _drEditorResults = []; // last search results for index-based selection

function _drEditorSelectIdx(el) {
  var idx = parseInt(el.getAttribute('data-dridx'), 10);
  var r = _drEditorResults[idx];
  if (r) _drEditorSelect(r.id);
}

function _drEditorSelect(docId) {
  db.collection('doctors').doc(docId).get().then(function(snap) {
    if (!snap.exists) { toast('Doctor not found', 'err'); return; }
    _drEditDocId   = docId;
    _drEditCurrent = snap.data();
    var d = _drEditCurrent;

    document.getElementById('dr-edit-original').textContent = d.name || '-';
    document.getElementById('dr-edit-name').value = d.name || '';
    document.getElementById('dr-edit-meta').textContent =
      'ID: ' + (d.doctor_id || docId) +
      (d.mobile ? ' · Mobile: ' + d.mobile : '') +
      (d.active === false ? ' · INACTIVE' : ' · Active');
    document.getElementById('dr-editor-results').innerHTML = '';
    document.getElementById('dr-edit-form').style.display = 'block';
  }).catch(function(e) { toast('Load error: ' + e.message, 'err'); });
}

function drEditorSave() {
  var newName = (document.getElementById('dr-edit-name').value || '').trim();
  if (!newName || newName.length < 2) { toast('Name cannot be empty', 'warn'); return; }
  if (!_drEditDocId) return;

  var ts = firebase.firestore.FieldValue.serverTimestamp();

  // Strategy: deactivate old doc, create new doc with correct name
  // This handles doc ID mismatch (old ID was based on wrong name)
  var oldDocId = _drEditDocId;
  var newDocId = newName.replace(/[^a-zA-Z0-9\s\(\)]/g,'').replace(/\s+/g,'-').toLowerCase().slice(0,100);

  var batch = db.batch();

  // Deactivate old if ID will change
  if (oldDocId !== newDocId) {
    batch.update(db.collection('doctors').doc(oldDocId), {
      active: false, updatedAt: ts, mergedInto: newDocId
    });
  }

  // Set new (or update same) doc with correct name
  batch.set(db.collection('doctors').doc(newDocId), Object.assign(
    {}, _drEditCurrent,
    { name: newName, active: true, updatedAt: ts, source: _drEditCurrent.source || 'manual' }
  ), { merge: true });

  batch.commit().then(function() {
    toast('Doctor updated ✓', 'ok');
    // Invalidate cache so new name appears immediately
    allDoctorsCache = null;
    localStorage.removeItem(DOCTOR_SYNC_KEY);
    drEditorCancel();
    document.getElementById('dr-edit-search').value = '';
  }).catch(function(e) { toast('Save failed: ' + e.message, 'err'); });
}

function drEditorDeactivate() {
  if (!_drEditDocId || !_drEditCurrent) return;
  var name = _drEditCurrent.name || _drEditDocId;
  if (!confirm('Deactivate "' + name + '"? It will no longer appear in doctor search. Orders using this name are unaffected.')) return;

  db.collection('doctors').doc(_drEditDocId).update({
    active: false,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    toast('Doctor deactivated ✓', 'ok');
    allDoctorsCache = null;
    localStorage.removeItem(DOCTOR_SYNC_KEY);
    drEditorCancel();
    document.getElementById('dr-edit-search').value = '';
  }).catch(function(e) { toast('Deactivate failed: ' + e.message, 'err'); });
}

function drEditorCancel() {
  _drEditDocId   = null;
  _drEditCurrent = null;
  document.getElementById('dr-edit-form').style.display  = 'none';
  document.getElementById('dr-editor-results').innerHTML = '';
}
// ── DOCTOR INLINE SEARCH ──
var allDoctorsCache = null;
var doctorCacheLoading = false;
var doctorPickerTargetId = null;
var DOCTOR_SYNC_KEY = 'doctor_last_sync'; // localStorage key — ISO timestamp

function prewarmDoctorCache() {
  if (allDoctorsCache || doctorCacheLoading) return;
  doctorCacheLoading = true;
  var base = '/oplus-lms-dev/';
  // Tier 1: load bundled doctors.json (cached by SW — works offline)
  fetch(base + 'doctors.json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allDoctorsCache = Array.isArray(data) ? data : (data.doctors || []);
      doctorCacheLoading = false;
      console.log('Doctors loaded from JSON: ' + allDoctorsCache.length);
      // Tier 2: delta sync from Firestore — only new/changed since last sync
      _doctorDeltaSync();
    })
    .catch(function(e) {
      // doctors.json not yet available — fall back to full Firestore fetch
      console.warn('doctors.json not found, falling back to Firestore:', e.message);
      _doctorFullFetch();
    });
}

function _doctorDeltaSync() {
  // Only run when online
  if (!navigator.onLine) return;
  var lastSync = localStorage.getItem(DOCTOR_SYNC_KEY);
  var query = lastSync
    ? db.collection('doctors').where('updatedAt', '>', new Date(lastSync))
    : db.collection('doctors').orderBy('updatedAt', 'desc').limit(100);
  query.get().then(function(snap) {
    if (snap.empty) { localStorage.setItem(DOCTOR_SYNC_KEY, new Date().toISOString()); return; }
    var updated = 0;
    snap.forEach(function(d) {
      var doc = d.data();
      if (!doc.name) return;
      // Merge into cache — replace existing or add new
      var idx = allDoctorsCache.findIndex(function(x) { return x.name === doc.name; });
      if (idx >= 0) { allDoctorsCache[idx] = doc; } else { allDoctorsCache.push(doc); }
      updated++;
    });
    if (updated > 0) console.log('Doctor delta sync: ' + updated + ' updated');
    localStorage.setItem(DOCTOR_SYNC_KEY, new Date().toISOString());
  }).catch(function(e) {
    console.warn('Doctor delta sync failed:', e.message);
  });
}

function _doctorFullFetch() {
  // Fallback: fetch all from Firestore (used when doctors.json not yet deployed)
  db.collection('doctors').orderBy('name').get().then(function(snap) {
    allDoctorsCache = [];
    snap.forEach(function(d) { allDoctorsCache.push(d.data()); });
    doctorCacheLoading = false;
    localStorage.setItem(DOCTOR_SYNC_KEY, new Date().toISOString());
    console.log('Doctors loaded from Firestore: ' + allDoctorsCache.length);
  }).catch(function(e) {
    console.warn('Doctor full fetch failed:', e.message);
    doctorCacheLoading = false;
    allDoctorsCache = [];
  });
}

var _drSearchTimer = null;

function showDefaultDoctorPicker(doctors, refField) {
  // Show a small floating picker near the ref field so user picks which alias
  var existing = document.getElementById('defdr-picker');
  if (existing) existing.remove();
  var picker = document.createElement('div');
  picker.id = 'defdr-picker';
  picker.style.cssText = 'position:absolute;left:0;right:0;background:var(--surface);border:1.5px solid var(--accent);border-radius:var(--radius);box-shadow:0 6px 20px rgba(0,0,0,0.15);z-index:400;overflow:hidden;margin-top:2px';
  var header = '<div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;padding:7px 12px 4px">Select referring doctor</div>';
  var items = doctors.map(function(name) {
    var safeAttr = name.replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    return '<div onmousedown="pickDefaultDoctor(this)" ontouchstart="pickDefaultDoctor(this)" data-drname="' + safeAttr + '" style="padding:10px 12px;cursor:pointer;border-top:0.5px solid var(--border);font-size:13px;font-weight:500;-webkit-tap-highlight-color:rgba(0,0,0,0.05)">' + esc(name) + '</div>';
  }).join('');
  picker.innerHTML = header + items;
  // Position relative to the ref field container
  var container = refField.parentNode;
  container.style.position = 'relative';
  container.appendChild(picker);
  // Auto-dismiss on outside click
  setTimeout(function() {
    document.addEventListener('click', function removePicker(e) {
      if (!picker.contains(e.target) && e.target !== refField) {
        picker.remove();
        document.removeEventListener('click', removePicker);
      }
    });
  }, 100);
}

function pickDefaultDoctor(el) {
  var name = el.dataset ? el.dataset.drname : el;
  // decode HTML entities back to plain text
  var txt = document.createElement('textarea'); txt.innerHTML = name; name = txt.value;
  var refField = document.getElementById('pt-ref');
  if (refField) refField.value = name;
  var picker = document.getElementById('defdr-picker');
  if (picker) picker.remove();
  validateDoctorForPanel(name);
}

function inlineDoctorSearch(val, inputId, listId) {
  var input = document.getElementById(inputId);
  var corrected = val.replace(/\bDr\.\s*/gi,'Dr ').replace(/([A-Za-z])\.([A-Za-z])/g,'$1 $2').replace(/\s{2,}/g,' ');
  if (corrected !== val) {
    var pos = input.selectionStart;
    input.value = corrected;
    try { input.setSelectionRange(pos, pos); } catch(e){}
    val = corrected;
  }
  var el = document.getElementById(listId);
  if (!val || val.trim().length < 1) { el.style.display = 'none'; return; }

  if (allDoctorsCache) {
    renderInlineList(val, el, inputId, listId);
  } else if (doctorCacheLoading) {
    el.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text3)">Loading doctors...</div>';
    el.style.display = 'block';
    var t = setInterval(function() {
      if (allDoctorsCache) { clearInterval(t); renderInlineList(val, el, inputId, listId); }
    }, 200);
    setTimeout(function(){ clearInterval(t); }, 8000);
  } else {
    // Cache not loaded yet — trigger prewarm and show loading state
    el.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text3)">Loading doctors...</div>';
    el.style.display = 'block';
    prewarmDoctorCache();
    // Poll until cache is ready
    var t = setInterval(function() {
      if (allDoctorsCache && !doctorCacheLoading) {
        clearInterval(t);
        renderInlineList(val, el, inputId, listId);
      }
    }, 200);
    setTimeout(function(){ clearInterval(t); }, 10000);
  }
}

function renderInlineList(val, el, inputId, listId) {
  var q = val.toLowerCase().trim();
  var qStripped = q.replace(/^dr\.?\s*/i,'').trim();
  var results = !qStripped ? [] : allDoctorsCache.filter(function(d) {
    if (!d.name) return false;
    if (d.active === false) return false; // exclude deactivated
    var n = d.name.toLowerCase();
    var nClean = n.replace(/([a-z])\.([a-z])/g,'$1 $2').replace(/([a-z])\./g,'$1').replace(/\s{2,}/g,' ');
    return n.indexOf(qStripped) >= 0 || n.indexOf(q) >= 0 || nClean.indexOf(qStripped) >= 0;
  });
  if (!results.length) { el.style.display = 'none'; return; }
  var shown = results.slice(0, 80);
  el.innerHTML = shown.map(function(d) {
    var safe = esc(d.name).replace(/'/g,"&#39;");
    return '<div onmousedown="pickInlineDoctor(\'' + safe + '\',\'' + inputId + '\',\'' + listId + '\')" ontouchstart="pickInlineDoctor(\'' + safe + '\',\'' + inputId + '\',\'' + listId + '\')"'
      + ' style="padding:10px 14px;cursor:pointer;border-bottom:0.5px solid var(--border);-webkit-tap-highlight-color:rgba(0,0,0,0.05)">'
      + '<div style="font-size:13px;font-weight:500">' + esc(d.name) + '</div>'
      + (d.specialization && d.specialization !== 'nan' ? '<div style="font-size:11px;color:var(--text3)">' + esc(d.specialization) + '</div>' : '')
      + '</div>';
  }).join('');
  if (results.length > 80) {
    el.innerHTML += '<div style="padding:8px 14px;font-size:11px;color:var(--text3);font-family:var(--mono)">' + (results.length-80) + ' more — keep typing</div>';
  }
  el.style.display = 'block';
}

function normaliseDrName(name) {
  return name
    .replace(/\bDr\.\s*/gi, 'Dr ')
    .replace(/([A-Za-z])\.([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])\.[\s]*/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function pickInlineDoctor(name, inputId, listId) {
  var clean = normaliseDrName(name);
  // Staff modal default doctor — add to tag list instead of setting input value
  if (inputId === 'sm-defdr') { addDefDr(clean); return; }
  document.getElementById(inputId).value = clean;
  hideDrList(listId);
  if (clean !== name) addDoctorToRegistry(clean);
  // Validate doctor against active panel restriction
  if (inputId === 'pt-ref') validateDoctorForPanel(clean);
}

function hideDrList(listId) {
  var el = document.getElementById(listId); if (el) el.style.display = 'none';
}

function addDoctorToRegistry(name) {
  if (!name || name.length < 3) return;
  var docId = name.replace(/[^a-zA-Z0-9\s\(\)]/g,'').replace(/\s+/g,'-').toLowerCase().slice(0,100);
  var _drNow = firebase.firestore.FieldValue.serverTimestamp();
  db.collection('doctors').doc(docId).set({name:name,source:'manual',active:true,updatedAt:_drNow},{merge:true})
    .then(function(){
    // Update cache in-place instead of nuking it
    if (allDoctorsCache) { var exists=allDoctorsCache.some(function(d){return d.name===name;}); if(!exists) allDoctorsCache.push({name:name,source:'manual',active:true}); }
  }).catch(function(){});
}

function registerDoctorFromOrder(refBy) {
  if (refBy && refBy.length > 2) addDoctorToRegistry(refBy);
}

function openDoctorPicker(){}
function closeDoctorPicker(){ var bg=document.getElementById('doctor-picker-bg'); if(bg) bg.classList.remove('open'); }
function filterDoctorPicker(){}
function pickDoctor(){}


var isUrgent = false;
function toggleUrgent() {
  isUrgent = !isUrgent;
  var toggle = document.getElementById('urgent-toggle');
  var label = document.getElementById('urgent-label');
  var sub = document.getElementById('urgent-sub');
  var check = document.getElementById('urgent-check');
  if (!toggle) return;
  if (isUrgent) {
    toggle.classList.add('on'); label.classList.add('on');
    label.textContent = 'URGENT — Priority Processing';
    sub.classList.add('on'); sub.textContent = 'Lab will be notified immediately';
    check.classList.add('on'); check.textContent = '✓';
  } else {
    toggle.classList.remove('on'); label.classList.remove('on');
    label.textContent = 'Mark as Urgent';
    sub.classList.remove('on'); sub.textContent = 'Tap to flag for priority processing';
    check.classList.remove('on'); check.textContent = '';
  }
}


function step2Next() {
  if (!selTests.length) { toast('Select at least one test','warn'); return; }
  curOrder.tests=selTests;
  curOrder.panel=curPanel;
  var testTotal=selTests.reduce(function(s,t){ return s+(t.rate||0); },0);
  curOrder.testTotal=testTotal;
  // Show collection charge strip for home collection
  var isExternal = curOrder.source !== 'Walk-in';
  var ccStrip = document.getElementById('collection-charge-strip');
  if (ccStrip) ccStrip.style.display = isExternal ? 'block' : 'none';
  // Reset split payment state BEFORE updateBillTotal so pre-fill isn't wiped
  creditMode = false; splitPay = {cash:0, upi:0, card:0};
  ['pm-amt-cash','pm-amt-upi','pm-amt-card'].forEach(function(id){
    var el=document.getElementById(id); if(el){el.disabled=false;el.style.opacity='1';el.value='';}
  });
  document.getElementById('split-pay-section').style.opacity='1';
  document.getElementById('pm-credit').style.display='block';
  document.getElementById('credit-active-note').style.display='none';
  document.getElementById('split-pay-status').style.display='none';
  // Clear collection charge field — restore from curOrder if navigating back, else 0
  var ccField = document.getElementById('collection-charge');
  if (ccField) ccField.value = curOrder.collectionCharge > 0 ? curOrder.collectionCharge : '';
  updateBillTotal();
  document.getElementById('discount').value='';
  document.getElementById('bill-note').textContent='';
  showStep(3);
}

function updateBillTotal() {
  var testTotal = curOrder.testTotal || 0;
  var isExternal = curOrder.source !== 'Walk-in';
  var cc = isExternal ? parseFloat(document.getElementById('collection-charge').value||0) : 0;
  curOrder.collectionCharge = cc;
  var total = testTotal + cc;
  curOrder.totalAmount = total;
  document.getElementById('bill-amt').textContent = 'Rs.' + total.toLocaleString('en-IN')
    + (cc > 0 ? ' (incl. Rs.' + cc + ' collection)' : '');
  document.getElementById('paid-amt').value = total;
  document.getElementById('paid-amt').dataset.net = total;
  // Pre-fill cash field with full amount as default
  if (!creditMode) {
    document.getElementById('pm-amt-cash').value = total;
    splitPay = {cash: total, upi: 0, card: 0};
    document.getElementById('split-pay-status').style.display='none';
  }
  // Re-apply discount if any
  var discVal = parseFloat(document.getElementById('discount').value||0);
  if (discVal > 0) applyDiscount();
}
// splitPay = {cash:0, upi:0, card:0}  — live amounts
var splitPay = {cash:0, upi:0, card:0};
var creditMode = false;

function setPay(m) {
  // Only 'credit' is handled here now; split inputs handle cash/upi/card
  if (m === 'credit' || m === 'due') {
    creditMode = true;
    splitPay = {cash:0, upi:0, card:0};
    ['pm-amt-cash','pm-amt-upi','pm-amt-card'].forEach(function(id){
      var el=document.getElementById(id); if(el){el.value='';el.disabled=true;el.style.opacity='0.4';}
    });
    document.getElementById('split-pay-section').style.opacity='0.4';
    document.getElementById('pm-credit').className='pay-mode-btn on-credit';
    document.getElementById('pm-credit').style.display='none';
    document.getElementById('pm-due').style.display='none';
    document.getElementById('credit-active-note').style.display='block';
    var cnt = document.getElementById('credit-note-text');
    if (cnt) cnt.textContent = m === 'due' ? 'Patient owes — collect payment ASAP' : 'Full amount on credit — payment collected later';
    document.getElementById('split-pay-status').style.display='none';
    document.getElementById('bill-note').textContent = m === 'due' ? 'Patient owes — collect ASAP' : 'Amount on credit — collect later';
    document.getElementById('paid-amt').value='0';
    var ps=document.getElementById('payment-proof-section');
    if(ps) ps.style.display='none';
  }
}

function clearCredit() {
  creditMode = false;
  ['pm-amt-cash','pm-amt-upi','pm-amt-card'].forEach(function(id){
    var el=document.getElementById(id); if(el){el.disabled=false;el.style.opacity='1';}
  });
  document.getElementById('split-pay-section').style.opacity='1';
  document.getElementById('pm-credit').style.display='block';
  var _pmDue=document.getElementById('pm-due'); if(_pmDue) _pmDue.style.display='block';
  document.getElementById('credit-active-note').style.display='none';
  document.getElementById('bill-note').textContent='';
  onSplitInput();
}

function onSplitInput() {
  if (creditMode) return;
  splitPay.cash  = Math.max(0, parseFloat(document.getElementById('pm-amt-cash').value)||0);
  splitPay.upi   = Math.max(0, parseFloat(document.getElementById('pm-amt-upi').value)||0);
  splitPay.card  = Math.max(0, parseFloat(document.getElementById('pm-amt-card').value)||0);
  var total = splitPay.cash + splitPay.upi + splitPay.card;
  var net = parseFloat(document.getElementById('paid-amt').dataset.net||0) || (curOrder.totalAmount||0);
  var due = Math.round((net - total)*100)/100;
  var status = document.getElementById('split-pay-status');
  status.style.display = 'block';
  if (Math.abs(due) < 0.5) {
    status.textContent = '✓ Fully paid — Rs.' + net.toLocaleString('en-IN');
    status.style.background='rgba(16,185,129,0.1)'; status.style.color='var(--green,#10B981)';
  } else if (due > 0) {
    status.textContent = 'Balance due: Rs.' + due.toLocaleString('en-IN');
    status.style.background='rgba(245,158,11,0.1)'; status.style.color='var(--amber,#D97706)';
  } else {
    status.textContent = 'Overpaid by Rs.' + Math.abs(due).toLocaleString('en-IN') + ' — check amounts';
    status.style.background='rgba(239,68,68,0.1)'; status.style.color='var(--red,#EF4444)';
  }
  // Show payment proof if UPI or card > 0
  var ps=document.getElementById('payment-proof-section');
  if(ps) ps.style.display=(splitPay.upi>0||splitPay.card>0)?'block':'none';
  document.getElementById('bill-note').textContent='';
}
var discType = 'amt';
var rxPhotos = []; // array of base64 strings, up to 4 pages
var proofPhotoB64 = '';

function setDiscType(type) {
  discType = type;
  var amtBtn = document.getElementById('disc-type-amt');
  var pctBtn = document.getElementById('disc-type-pct');
  if (amtBtn) { amtBtn.style.background = type==='amt'?'var(--accent)':'var(--surface)'; amtBtn.style.color = type==='amt'?'#fff':'var(--text2)'; }
  if (pctBtn) { pctBtn.style.background = type==='pct'?'var(--accent)':'var(--surface)'; pctBtn.style.color = type==='pct'?'#fff':'var(--text2)'; }
  var inp = document.getElementById('discount');
  if (inp) inp.placeholder = type==='pct'?'0-100':'0';
  applyDiscount();
}

var discountApproved = false;
var discountApprovalThresholdAmt = 500;
var discountApprovalThresholdPct = 20;

function applyDiscount() {
  var raw = parseFloat(document.getElementById('discount').value || 0);
  var total = curOrder.totalAmount || 0;
  var cc = curOrder.collectionCharge || 0;
  var testTotal = total - cc; // discount applies to tests only, never collection charge
  var disc = 0;
  if (discType === 'pct') {
    var pct = Math.min(100, Math.max(0, raw));
    disc = Math.round(testTotal * pct / 100); // % of tests only
    var calcEl = document.getElementById('disc-calc');
    if (calcEl) calcEl.textContent = disc > 0 ? '= Rs.' + disc.toLocaleString('en-IN') : '';
  } else {
    disc = Math.min(testTotal, Math.max(0, raw)); // Rs. discount capped at test total
    var calcEl = document.getElementById('disc-calc');
    if (calcEl) calcEl.textContent = '';
  }
  var net = Math.max(0, testTotal - disc) + cc;
  document.getElementById('bill-amt').textContent = 'Rs.' + net.toLocaleString('en-IN')
    + (cc > 0 ? ' (incl. Rs.' + cc + ' collection)' : '');
  document.getElementById('paid-amt').value = net;
  document.getElementById('paid-amt').dataset.net = net;
  if (!creditMode) {
    // Reset to full cash by default when net changes; user adjusts if needed
    document.getElementById('pm-amt-cash').value = net;
    document.getElementById('pm-amt-upi').value = '';
    document.getElementById('pm-amt-card').value = '';
    splitPay = {cash: net, upi: 0, card: 0};
    document.getElementById('split-pay-status').style.display='none';
    var ps=document.getElementById('payment-proof-section');
    if(ps) ps.style.display='none';
  }
  document.getElementById('bill-note').textContent = disc > 0 ? 'Discount Rs.' + disc.toLocaleString('en-IN') + ' on tests only' + (cc>0?' · Collection charge Rs.'+cc+' not discounted':'') : '';
  // Approval check
  var needsApproval = (disc > discountApprovalThresholdAmt || (total>0 && disc/total*100 > discountApprovalThresholdPct));
  var role = curProfile && curProfile.role || '';
  var isPriv = role==='pathologist' || role==='admin';
  var dbanner = document.getElementById('discount-approval-banner');
  if (dbanner) {
    if (disc > 0 && needsApproval && !isPriv && !discountApproved) {
      dbanner.style.display = 'block';
      document.getElementById('disc-approval-sub').textContent = 'Discount Rs.'+disc.toLocaleString('en-IN')+' exceeds threshold. Requires approval.';
      document.getElementById('disc-pin-err').textContent = '';
      document.getElementById('disc-pin-input').value = '';
    } else {
      dbanner.style.display = 'none';
    }
  }
}

function capturePhoto(type, source) {
  var input = document.getElementById(type === 'rx' ? 'rx-input' : 'proof-input');
  if (source === 'camera') {
    input.setAttribute('capture', 'environment');
  } else {
    input.removeAttribute('capture');
  }
  input.click();
}

function handlePhoto(type, input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var maxW = 600; // reduced from 800 for Firestore 1MB limit
      var scale = img.width > maxW ? maxW / img.width : 1;
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      var quality = 0.6; // reduced from 0.7
      var b64 = canvas.toDataURL('image/jpeg', quality);
      // If still > 200KB base64, compress further
      if (b64.length > 270000) {
        b64 = canvas.toDataURL('image/jpeg', 0.45);
      }
      // Warn if still large
      var kb = Math.round(b64.length * 0.75 / 1024);
      if (b64.length > 400000) {
        toast('Photo large (' + kb + 'KB) — may affect save speed', 'warn');
      }
      proofPhotoB64 = b64;
      document.getElementById('proof-img').src = b64;
      document.getElementById('proof-preview').style.display = 'block';
      toast('Payment proof added (' + kb + 'KB)', 'ok');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── ONE-TIME hasDue MIGRATION ─────────────────────────────────────────────
// Backfills hasDue on all existing orders that predate the hasDue field.
// Safe to run multiple times — skips orders that already have hasDue set.
// Runs in batches of 400 to stay within Firestore batch write limits (500).
async function runHasDueMigration() {
  var role = curProfile && curProfile.role;
  if (role !== 'admin' && role !== 'pathologist') {
    toast('Admin or Pathologist access required', 'warn'); return;
  }
  if (!confirm('This will backfill hasDue on all orders. Run migration?')) return;
  toast('Migration started — do not close the app…', 'ok');

  var BATCH_SIZE = 400;
  var fixed = 0, skipped = 0, errors = 0;

  // Helper: process one Firestore page of results
  async function processBatch(snap) {
    if (snap.empty) return;
    var batch = db.batch();
    var batchCount = 0;
    snap.forEach(function(doc) {
      var o = doc.data();
      // Skip if hasDue is already set (not undefined)
      if (typeof o.hasDue !== 'undefined') { skipped++; return; }
      var due = typeof o.dueAmount === 'number' ? o.dueAmount : 0;
      var shouldHaveDue = due > 0;
      batch.update(doc.ref, { hasDue: shouldHaveDue });
      batchCount++;
      fixed++;
    });
    if (batchCount > 0) await batch.commit();
  }

  try {
    // Page through ALL orders (no status filter — catches every order)
    var lastDoc = null;
    var pagesDone = 0;
    while (true) {
      var q = db.collection('orders').orderBy('createdAt','asc').limit(BATCH_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      var snap = await q.get();
      if (snap.empty) break;
      await processBatch(snap);
      lastDoc = snap.docs[snap.docs.length - 1];
      pagesDone++;
      if (snap.size < BATCH_SIZE) break; // last page
    }
    toast('Migration done ✓ — ' + fixed + ' updated, ' + skipped + ' already set', 'ok');
    console.log('[hasDue migration] pages=' + pagesDone + ', fixed=' + fixed + ', skipped=' + skipped);
  } catch(e) {
    toast('Migration error: ' + e.message, 'err');
    console.error('[hasDue migration] error:', e);
  }
}
// ── TIME REASSIGNMENT REQUEST ─────────────────────────────────────────────
var _trOrderId = null;
var _trPatientName = null;
var _trCurrentTime = null;

function openTimeReassign(orderId, patientName, currentTime) {
  _trOrderId = orderId;
  _trPatientName = patientName;
  _trCurrentTime = currentTime;
  var cwEl = document.getElementById('tr-current-window');
  if (cwEl) cwEl.textContent = visitWindow(currentTime);
  var timeEl = document.getElementById('tr-new-time');
  if (timeEl) timeEl.value = currentTime || '';
  var noteEl = document.getElementById('tr-note');
  if (noteEl) noteEl.value = '';
  updateTRPreview();
  var bg = document.getElementById('time-reassign-bg');
  bg.style.display = 'flex';
  setTimeout(function(){ bg.classList.add('open'); }, 10);
}

function closeTimeReassign() {
  var bg = document.getElementById('time-reassign-bg');
  bg.classList.remove('open');
  setTimeout(function(){ bg.style.display='none'; }, 280);
  _trOrderId = null;
}

function updateTRPreview() {
  var t = document.getElementById('tr-new-time').value;
  var prev = document.getElementById('tr-preview');
  if (prev) prev.textContent = t ? '⏰ ' + visitWindow(t) : '';
}

function submitTimeReassign() {
  var newTime = document.getElementById('tr-new-time').value;
  if (!newTime) { toast('Select a time', 'warn'); return; }
  var note = document.getElementById('tr-note').value.trim();
  var byName = (curProfile && curProfile.name) || (curUser && curUser.email) || 'Phlebo';

  // Save request to Firestore
  db.collection('orders').doc(_trOrderId).update({
    visitTimeRequest: {
      requestedTime: newTime,
      note: note,
      byName: byName,
      byUid: curUser && curUser.uid,
      status: 'pending',
      requestedAt: firebase.firestore.FieldValue.serverTimestamp()
    }
  }).then(function() {
    toast('Request sent ✓', 'ok');
    logActivity('time_reassign_request', 'Time change requested for ' + (_trPatientName||'patient') + ': ' + visitWindow(_trCurrentTime) + ' → ' + visitWindow(newTime));

    // Open WhatsApp to admin
    var ADMIN_WA = '919312218812';
    var msg = '⏰ *Visit Time Change Request — oplus-lms*\n\n'
      + '👤 Patient: ' + (_trPatientName||'-') + '\n'
      + '📅 Current window: ' + visitWindow(_trCurrentTime) + '\n'
      + '🔁 Requested: ' + visitWindow(newTime) + '\n'
      + (note ? '📝 Reason: ' + note + '\n' : '')
      + '👨‍⚕️ By: ' + byName + '\n\n'
      + 'Please update the visit time in the order.';
    window.open('https://wa.me/' + ADMIN_WA + '?text=' + encodeURIComponent(msg), '_blank');
    closeTimeReassign();
  }).catch(function(e) {
    toast('Failed: ' + e.message, 'err');
  });
}

function submitTransfer() {
  var sel = document.getElementById('transfer-to-select');
  var toUid = sel.value;
  var toName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].dataset.name || '' : '';
  var reason = document.getElementById('transfer-reason').value.trim();
  var errEl = document.getElementById('err-transfer-reason');

  if (!toUid) { toast('Select a phlebotomist', 'warn'); return; }
  if (!reason) { errEl.classList.add('on'); return; }
  errEl.classList.remove('on');

  var o = fieldOrders[transferTargetIdx];
  if (!o) return;

  var now = new Date();
  var timeStr = now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  var fromName = (curProfile&&curProfile.name)||curUser.email;

  var transfer = {
    fromUid: curUser.uid,
    fromName: fromName,
    toUid: toUid,
    toName: toName,
    reason: reason,
    at: timeStr,
    date: todayStr()
  };

  closeTransferModal();

  db.collection('orders').doc(o.id).update({
    fieldTransferPending: {
      toUid: toUid,
      toName: toName,
      fromUid: curUser.uid,
      fromName: fromName,
      reason: reason,
      at: timeStr,
      date: todayStr()
    },
    fieldTransfers: firebase.firestore.FieldValue.arrayUnion(transfer)
  }).then(function() {
    toast('Transfer sent — awaiting acceptance from ' + toName, 'ok');
  }).catch(function(e) {
    toast('Transfer failed — check connection', 'err');
  });
}


var fieldOrders = [];
function fieldActionIdx(idx, action) {
  var o = fieldOrders[idx];
  if (!o) return;
  var orderId = o.id; var patientName = o.patientName||"";
  fieldPendingAction = {action: action, orderId: orderId};
  var modal = document.getElementById('field-modal-bg');
  var title = document.getElementById('field-modal-title');
  var sub = document.getElementById('field-modal-sub');
  var okBtn = document.getElementById('field-modal-ok');
  document.getElementById('field-col-notes').value = '';
  _fieldGPS = null; _fieldFasting = null; _fieldMedComplied = null;
  var _fgs=document.getElementById('field-gps-status'); if(_fgs){_fgs.textContent='Optional';_fgs.style.color='var(--text3)';}
  // Reset history section
  ['fhx-yes','fhx-no','fmed-yes','fmed-no'].forEach(function(id){ var el=document.getElementById(id); if(el) el.className='tog'; });
  var fwarn=document.getElementById('fhx-warn'); if(fwarn) fwarn.style.display='none';
  // Check if any test requires fasting or has med restrictions
  var _fo = fieldOrders[idx];
  var hasFast=false, medNote='';
  if (_fo && _fo.tests && PA_DATA) {
    _fo.tests.forEach(function(t) {
      var dept = t.dept || 'BIOCHEMISTRY';
      var deptData = (PA_DATA[dept]) || (PA_DATA['BIOCHEMISTRY']) || {default:{},patterns:[]};
      var pa = Object.assign({}, deptData.default);
      var nm = (t.name||''). toLowerCase();
      if (deptData.patterns) deptData.patterns.forEach(function(p){ p.match.forEach(function(kw){ if(nm.indexOf(kw.toLowerCase())>=0) pa=Object.assign({},p.data); }); });
      if (pa.fast) hasFast = true;
      if (pa.med_avoid && !medNote) medNote = pa.med_avoid.split('.')[0];
    });
  }
  var histSec = document.getElementById('field-history-section');
  var fastRow = document.getElementById('field-fasting-row');
  var medRow  = document.getElementById('field-med-row');
  var medNoteEl = document.getElementById('field-med-note');
  // Drafts use Complete Booking — no pre-collection checklist needed
  var _isFoDraft = _fo && _fo.status === 'draft';
  if (!_isFoDraft && action === 'collect' && (hasFast || medNote)) {
    if (histSec) histSec.style.display = 'block';
    if (fastRow) fastRow.style.display = hasFast ? 'block' : 'none';
    if (medRow)  medRow.style.display  = medNote ? 'block' : 'none';
    if (medNoteEl) medNoteEl.textContent = medNote;
  } else {
    if (histSec) histSec.style.display = 'none';
  }
  var _fps=document.getElementById('field-pay-section');
  var _fo=fieldOrders[idx];
  if (_fps && action==='collect' && (_fo.status==='pending'||(_fo.dueAmount&&_fo.dueAmount>0))) {
    _fps.style.display='block';
    var _fpa=document.getElementById('field-pay-amt');
    if(_fpa){_fpa.style.display='none';_fpa.value='';_fpa.placeholder='Amount: Rs.'+(_fo.netAmount||_fo.totalAmount||0);}
    _fieldPayMode=null;
    ['fpay-cash','fpay-upi','fpay-skip'].forEach(function(b){var el=document.getElementById(b);if(el)el.className='tog';});
    fieldPendingAction.dueAmount=_fo.netAmount||_fo.totalAmount||0;
  } else if (_fps) { _fps.style.display='none'; }
  if (action === 'collect') {
    title.textContent = 'Mark Sample Collected';
    sub.textContent = 'Confirm sample collected from ' + patientName;
    okBtn.textContent = 'Mark Collected';
    okBtn.style.background = 'var(--accent)';
  } else {
    title.textContent = 'Mark Report Delivered';
    sub.textContent = 'Confirm report/sample delivered for ' + patientName;
    okBtn.textContent = 'Mark Delivered';
    okBtn.style.background = '#059669';
  }
  okBtn.onclick = fieldConfirm;
  modal.style.display = 'flex';
  setTimeout(function(){ modal.classList.add('open'); }, 10);
}

function closeFieldModal() {
  var bg = document.getElementById('field-modal-bg');
  bg.classList.remove('open');
  setTimeout(function(){ bg.style.display='none'; }, 280);
  fieldPendingAction = null;
}

var _fieldFasting = null;     // true=fasting confirmed, false=not fasting
var _fieldMedComplied = null; // true=complied, false=not complied
var _cbFasting = null;        // CB mode: fasting confirmed
var _cbMedComplied = null;    // CB mode: med complied
var _cbHasFast = false;       // CB mode: does order have fasting test
var _cbHasMed = false;        // CB mode: does order have med restriction

function setFieldFasting(val) {
  _fieldFasting = val;
  document.getElementById('fhx-yes').className = 'tog' + (val === true  ? ' on' : '');
  document.getElementById('fhx-no').className  = 'tog' + (val === false ? ' on' : '');
  var warn = document.getElementById('fhx-warn');
  if (warn) warn.style.display = val === false ? 'block' : 'none';
}

function setFieldMed(val) {
  _fieldMedComplied = val;
  document.getElementById('fmed-yes').className = 'tog' + (val === true  ? ' on' : '');
  document.getElementById('fmed-no').className  = 'tog' + (val === false ? ' on' : '');
}

function setCBFasting(val) {
  _cbFasting = val;
  document.getElementById('cb-fast-yes').className = 'tog' + (val === true  ? ' on' : '');
  document.getElementById('cb-fast-no').className  = 'tog' + (val === false ? ' on' : '');
  var warn = document.getElementById('cb-fast-warn');
  if (warn) warn.style.display = val === false ? 'block' : 'none';
}

function setCBMed(val) {
  _cbMedComplied = val;
  document.getElementById('cb-med-yes').className = 'tog' + (val === true  ? ' on' : '');
  document.getElementById('cb-med-no').className  = 'tog' + (val === false ? ' on' : '');
}

function fieldConfirm() {
  if (!fieldPendingAction) return;
  var action = fieldPendingAction.action;
  var orderId = fieldPendingAction.orderId;
  var notes = document.getElementById('field-col-notes').value.trim();
  var now = new Date();
  var timeStr = now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  var byName = (curProfile&&curProfile.name)||curUser.email;
  var update = {
    fieldStatus: action === 'collect' ? 'collected' : 'delivered',
    fieldUpdatedBy: byName,
    fieldUpdatedAt: timeStr
  };
  if (notes) update.fieldNotes = notes;
  // Save confirmed history from phlebotomist at collection point
  if (action === 'collect') {
    if (_fieldFasting !== null) update['history.fastingConfirmed'] = _fieldFasting;
    if (_fieldMedComplied !== null) update['history.medComplied'] = _fieldMedComplied;
    update['history.collectionTime'] = timeStr;
    update['history.collectedBy'] = byName;
    // If not fasting on a fasting test — flag it
    if (_fieldFasting === false) {
      var existingNotes = notes ? notes + ' | ' : '';
      update.fieldNotes = existingNotes + 'NON-FASTING — result may be invalid';
    }
  }
  closeFieldModal();
  var _urgentOrder = fieldOrders && fieldOrders.find(function(o){ return o.id === orderId; });
  db.collection('orders').doc(orderId).update(update)
    .then(function(){
      toast(action==='collect' ? 'Sample marked collected ✓' : 'Report marked delivered ✓', 'ok');
      if (_urgentOrder && _urgentOrder.urgent) sendUrgentFieldWA(_urgentOrder, action);
    })
    .catch(function(){ toast('Update failed — check connection', 'err'); });
}


// [moved to reports.js]
// ── ADMIN / STAFF MANAGEMENT ──
var editingStaffId = null;
var smRole = 'reception';
var selTempRole = '';

async function loadAdminScreen() {
  await loadAdminStaff();
  await loadTempRoles();
  await loadTempDoctor();
  await loadAbsences();
  // Set default absence dates to today
  var todayVal = todayStr();
  var abFromEl = document.getElementById('absence-from');
  var abToEl   = document.getElementById('absence-to');
  if (abFromEl && !abFromEl.value) abFromEl.value = todayVal;
  if (abToEl   && !abToEl.value)   abToEl.value   = todayVal;
  // Set default dues tracking date range: last 30 days
  var toDate = new Date();
  var fromDate = new Date(); fromDate.setDate(fromDate.getDate()-30);
  var fmt = function(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  var fromEl = document.getElementById('dues-track-from');
  var toEl = document.getElementById('dues-track-to');
  if (fromEl) { fromEl.value = fmt(fromDate); fromEl.min = fmt(new Date(Date.now()-90*86400000)); fromEl.max = fmt(toDate); }
  if (toEl) { toEl.value = fmt(toDate); toEl.max = fmt(toDate); }
  // Populate temp doctor dropdowns from staff list
  var staffSnap = await db.collection('staff').where('active','==',true).get();
  var staffSel = document.getElementById('tempdr-staff');
  var doctorSel = document.getElementById('tempdr-doctor');
  if (staffSel) {
    staffSel.innerHTML = '<option value="">Select staff member...</option>';
    staffSnap.forEach(function(d) {
      var s = d.data();
      var opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = s.name + ' (' + (s.role||'staff') + ')';
      staffSel.appendChild(opt);
    });
  }
  if (doctorSel) {
    // Build unique list of doctors from staff defaultDoctor fields + existing orders
    var doctors = {};
    staffSnap.forEach(function(d) {
      var s = d.data();
      if (s.defaultDoctor) doctors[s.defaultDoctor] = true;
    });
    doctorSel.innerHTML = '<option value="">Select clinic doctor...</option>';
    Object.keys(doctors).sort().forEach(function(dr) {
      var opt = document.createElement('option');
      opt.value = dr; opt.textContent = dr;
      doctorSel.appendChild(opt);
    });
  }
  // Populate absence staff dropdown (all active staff)
  var absenceSel = document.getElementById('absence-staff');
  if (absenceSel) {
    absenceSel.innerHTML = '<option value="">Select staff member...</option>';
    var staffArr = [];
    staffSnap.forEach(function(d) { staffArr.push({ id: d.id, data: d.data() }); });
    staffArr.sort(function(a,b){ return (a.data.name||'').localeCompare(b.data.name||''); });
    staffArr.forEach(function(item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.data.name + ' (' + (item.data.role||'staff') + ')';
      absenceSel.appendChild(opt);
    });
  }
}

async function loadAdminStaff() {
  var el = document.getElementById('admin-staff-list');
  el.innerHTML = '<div class="empty">Loading...</div>';
  try {
    var today = todayStr();
    var abSnap = await db.collection('temp_roles')
      .where('type','==','absence').where('active','==',true).get();
    var absentIds = {};
    abSnap.forEach(function(d) {
      var a = d.data();
      if (a.fromDate <= today && a.toDate >= today) absentIds[a.staffId] = a.reason || 'On leave';
    });
    var snap = await db.collection('staff').orderBy('name').get();
    if (snap.empty) { el.innerHTML = '<div class="empty">No staff registered</div>'; return; }
    var html = '';
    snap.forEach(function(d) {
      var s = d.data();
      var initials = (s.name||'?').split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
      var roleColor = {admin:'var(--accent)',pathologist:'var(--blue)',lab:'var(--gold)',senior_lab:'#D97706',reception:'var(--text2)',phlebotomist:'#059669'}[s.role] || 'var(--text2)';
      var isAbsent = !!absentIds[d.id];
      html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:0.5px solid var(--border)' + (isAbsent?';background:#FFF5F5':'') + '">'
        + '<div style="width:38px;height:38px;border-radius:50%;background:' + (isAbsent?'#FEE2E2':'var(--accent-light)') + ';color:' + (isAbsent?'#EF4444':'var(--accent)') + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;flex-shrink:0">' + initials + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:13px;font-weight:500">' + esc(s.name||'-')
          + (isAbsent ? '<span style="font-size:10px;font-family:var(--mono);background:#EF4444;color:#fff;padding:1px 7px;border-radius:10px;margin-left:6px">ABSENT</span>' : '')
          + (s.active===false?'<span style="font-size:10px;color:var(--red);margin-left:6px">INACTIVE</span>':'')
          + (s.dashboardAccess?'<span style="font-size:9px;font-family:var(--mono);background:var(--accent);color:#fff;padding:1px 6px;border-radius:10px;margin-left:6px">DASH</span>':'')
        + '</div>'
        + '<div style="font-size:11px;font-family:var(--mono);color:' + roleColor + '">' + (s.role||'').toUpperCase() + '</div>'
        + (isAbsent ? '<div style="font-size:10px;color:#EF4444;margin-top:1px">' + esc(absentIds[d.id]) + '</div>' : '')
        + '<div style="font-size:11px;color:var(--text3)">' + esc(s.email||'') + '</div>'
        + (s.defaultDoctor ? '<div style="font-size:10px;font-family:var(--mono);color:var(--accent);margin-top:2px">&#128084; ' + esc(s.defaultDoctor) + '</div>' : '')
        + '</div>'
        + '<button data-id="' + d.id + '" onclick="editStaff(this.dataset.id)" style="font-size:12px;padding:6px 12px;border:0.5px solid var(--border-strong);border-radius:8px;background:none;cursor:pointer;color:var(--text2)">Edit</button>'
        + '</div>';
    });
    el.innerHTML = html;
  } catch(e) { el.innerHTML = '<div class="empty">Error: ' + e.message + '</div>'; }
}

var smDashAccess = false;
var smDefaultDoctors = []; // array of doctor names for staff modal

function renderDefDrTags() {
  var el = document.getElementById('sm-defdr-tags');
  if (!el) return;
  if (!smDefaultDoctors.length) { el.innerHTML = '<span style="font-size:11px;color:var(--text3)">No doctors added yet</span>'; return; }
  el.innerHTML = smDefaultDoctors.map(function(name, i) {
    return '<span style="display:inline-flex;align-items:center;gap:5px;background:var(--accent-light);color:var(--accent);font-size:12px;padding:4px 10px;border-radius:20px;font-family:var(--mono)">'
      + esc(name)
      + '<button type="button" onclick="removeDefDr(' + i + ')" style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:14px;line-height:1;padding:0">×</button>'
      + '</span>';
  }).join('');
}

function addDefDr(name) {
  if (!name) return;
  var clean = normaliseDrName(name);
  if (smDefaultDoctors.indexOf(clean) >= 0) { toast('Already added', 'warn'); return; }
  smDefaultDoctors.push(clean);
  renderDefDrTags();
  var inp = document.getElementById('sm-defdr');
  if (inp) inp.value = '';
  hideDrList('sm-defdr-list');
  addDoctorToRegistry(clean);
}

function removeDefDr(i) {
  smDefaultDoctors.splice(i, 1);
  renderDefDrTags();
}

function toggleDashAccess() {
  if (!editingStaffId) return;
  smDashAccess = !smDashAccess;
  var btn = document.getElementById('sm-dash-toggle');
  btn.textContent = smDashAccess ? 'ON' : 'OFF';
  btn.style.background = smDashAccess ? 'var(--accent)' : 'var(--surface)';
  btn.style.color = smDashAccess ? '#fff' : 'var(--text2)';
  btn.style.borderColor = smDashAccess ? 'var(--accent)' : 'var(--border-strong)';
  btn.disabled = true;
  // Auto-save immediately
  db.collection('staff').doc(editingStaffId).update({ dashboardAccess: smDashAccess })
    .then(function() {
      toast('Dashboard access ' + (smDashAccess ? 'granted ✓' : 'revoked'), smDashAccess ? 'ok' : 'warn');
      btn.disabled = false;
      // Clear PIN field — browser autofill may have injected text
      var pinEl = document.getElementById('sm-pin');
      if (pinEl) pinEl.value = '';
      var hint = document.getElementById('dash-toggle-hint');
      if (hint) { hint.style.display = 'block'; setTimeout(function(){ hint.style.display='none'; }, 3000); }
      loadAdminStaff();
    })
    .catch(function(e) {
      toast('Save failed — check connection', 'err');
      // Revert toggle on failure
      smDashAccess = !smDashAccess;
      btn.textContent = smDashAccess ? 'ON' : 'OFF';
      btn.style.background = smDashAccess ? 'var(--accent)' : 'var(--surface)';
      btn.style.color = smDashAccess ? '#fff' : 'var(--text2)';
      btn.style.borderColor = smDashAccess ? 'var(--accent)' : 'var(--border-strong)';
      btn.disabled = false;
    });
}

function setDashAccessUI(val) {
  smDashAccess = !!val;
  var btn = document.getElementById('sm-dash-toggle');
  if (!btn) return;
  btn.textContent = smDashAccess ? 'ON' : 'OFF';
  btn.style.background = smDashAccess ? 'var(--accent)' : 'var(--surface)';
  btn.style.color = smDashAccess ? '#fff' : 'var(--text2)';
  btn.style.borderColor = smDashAccess ? 'var(--accent)' : 'var(--border-strong)';
}

function showAddStaff() {
  editingStaffId = null;
  smRole = 'reception';
  document.getElementById('staff-modal-title').textContent = 'Add Staff';
  document.getElementById('sm-name').value = '';
  document.getElementById('sm-email').value = '';
  document.getElementById('sm-pass').value = '';
  document.getElementById('sm-pin').value = '';
  var defdr = document.getElementById('sm-defdr'); if(defdr) defdr.value = '';
  var smph = document.getElementById('sm-phone'); if(smph) smph.value = '';
  document.getElementById('sm-err').textContent = '';
  document.getElementById('sm-pass-field').style.display = 'block';
  var _apf=document.getElementById('sm-admin-pass-field'); if(_apf){_apf.style.display='block'; var _api=document.getElementById('sm-admin-pass'); if(_api) _api.value='';}
  document.getElementById('sm-email-note').textContent = 'A Firebase account will be created';
  document.getElementById('sm-deactivate-row').style.display = 'none';
  document.getElementById('sm-deactivate-btn').style.display = 'block';
  document.getElementById('sm-reactivate-btn').style.display = 'none';
  document.getElementById('sm-delete-row').style.display = 'none';
  var rb = document.getElementById('sm-reset-btn'); if(rb) rb.style.display='none';
  var _smBtn = document.getElementById('sm-save-btn');
  if (_smBtn) { _smBtn.disabled = false; _smBtn.textContent = 'Create Account'; }
  ['reception','lab','admin','pathologist','phlebotomist','manager','senior_lab'].forEach(function(r){
    document.getElementById('smr-'+r).className = 'tog';
  });
  setDashAccessUI(false);
  smDefaultDoctors = []; renderDefDrTags();
  document.getElementById('staff-modal').classList.add('open');
}

async function editStaff(id) {
  editingStaffId = id;
  var btn = document.getElementById('sm-save-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  try {
    var snap = await db.collection('staff').doc(id).get();
    var s = snap.data();
    smRole = s.role || 'reception';
    document.getElementById('staff-modal-title').textContent = 'Edit Staff';
    document.getElementById('sm-name').value = s.name || '';
    document.getElementById('sm-email').value = s.email || '';
    document.getElementById('sm-pass').value = '';
    document.getElementById('sm-pin').value = ''; // never show stored hash
    var defdr = document.getElementById('sm-defdr'); if(defdr) defdr.value = '';
    // Support legacy string and new array
    smDefaultDoctors = Array.isArray(s.defaultDoctors) ? s.defaultDoctors.slice()
      : (s.defaultDoctor ? [s.defaultDoctor] : []);
    renderDefDrTags();
    var smph = document.getElementById('sm-phone'); if(smph) smph.value = s.phone || '';
    document.getElementById('sm-err').textContent = '';
    document.getElementById('sm-pass-field').style.display = 'block';
    var _apf2=document.getElementById('sm-admin-pass-field'); if(_apf2){_apf2.style.display='none'; var _api2=document.getElementById('sm-admin-pass'); if(_api2) _api2.value='';}
    document.getElementById('sm-email-note').textContent = 'Leave password blank to keep existing';
    document.getElementById('sm-deactivate-row').style.display = 'block';
    document.getElementById('sm-deactivate-btn').style.display = s.active===false ? 'none' : 'block';
    document.getElementById('sm-reactivate-btn').style.display = s.active===false ? 'block' : 'none';
    document.getElementById('sm-delete-row').style.display = s.active===false ? 'block' : 'none';
    document.getElementById('sm-save-btn').textContent = 'Save Changes';
    ['reception','lab','admin','pathologist','phlebotomist','manager','senior_lab'].forEach(function(r){
      document.getElementById('smr-'+r).className = 'tog' + (r===smRole?' on':'');
    });
    setDashAccessUI(s.dashboardAccess || false);
    var rb = document.getElementById('sm-reset-btn'); if(rb) rb.style.display='block';
    document.getElementById('staff-modal').classList.add('open');
  } catch(e) { toast('Error loading staff: ' + e.message, 'err'); }
}

function closeStaffModal() {
  document.getElementById('staff-modal').classList.remove('open');
  editingStaffId = null;
  // Always re-enable save button — may have been disabled during save
  var btn = document.getElementById('sm-save-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
}

function setStaffRole(r) {
  smRole = r;
  ['reception','lab','admin','pathologist','phlebotomist','manager'].forEach(function(x){
    document.getElementById('smr-'+x).className = 'tog' + (x===r?' on':'');
  });
}

async function saveStaff() {
  var name = document.getElementById('sm-name').value.trim();
  var email = document.getElementById('sm-email').value.trim();
  var pass = document.getElementById('sm-pass').value;
  var pin = document.getElementById('sm-pin').value;
  var err = document.getElementById('sm-err');
  var btn = document.getElementById('sm-save-btn');

  if (!name) { err.textContent = 'Name is required'; return; }
  if (!email) { err.textContent = 'Email is required'; return; }
  if (pin && !/^[0-9]{4}$/.test(pin)) { err.textContent = 'PIN must be exactly 4 digits'; return; }

  btn.disabled = true; btn.textContent = 'Saving...';
  err.textContent = '';

  try {
    if (!editingStaffId) {
      // NEW STAFF — create Firebase Auth account
      if (!pass || pass.length < 6) { err.textContent = 'Password must be at least 6 characters'; btn.disabled=false; btn.textContent='Create Account'; return; }
      if (!pin) { err.textContent = 'PIN is required for new staff'; btn.disabled=false; btn.textContent='Create Account'; return; }
      var _adminEmail2 = curUser.email;
      var _adminPass2 = document.getElementById('sm-admin-pass') ? document.getElementById('sm-admin-pass').value : '';
      var cred = await auth.createUserWithEmailAndPassword(email, pass);
      var staffPhone = (document.getElementById('sm-phone').value||'').trim();
      var pinHash = await hashPin(pin);
      await db.collection('staff').doc(cred.user.uid).set({
        name: name, email: email, role: smRole, pin: pinHash,
        uid: cred.user.uid, active: true, phone: staffPhone,
        dashboardAccess: smDashAccess,
        defaultDoctors: smDefaultDoctors.slice(),
        defaultDoctor: smDefaultDoctors[0] || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: curUser.uid
      });
      // Re-sign admin in (Firebase auto-signs in newly created user)
      if (_adminPass2) await auth.signInWithEmailAndPassword(_adminEmail2, _adminPass2);
      toast('Staff account created ✓', 'ok');
      logActivity('staff_create', 'Created staff: ' + name + ' (' + smRole + ')');
    } else {
      // EDIT EXISTING
      var staffPhone = (document.getElementById('sm-phone').value||'').trim();
      var update = { name: name, email: email, role: smRole, dashboardAccess: smDashAccess,
        defaultDoctors: smDefaultDoctors.slice(),
        defaultDoctor: smDefaultDoctors[0] || '',
        phone: staffPhone };
      if (pin) update.pin = await hashPin(pin);

      // Password change
      if (pass && pass.length >= 6) {
        if (editingStaffId === curUser.uid) {
          await curUser.updatePassword(pass);
          toast('Password updated ✓', 'ok');
        } else {
          // Can't change another user's password client-side — send reset email
          var staffSnap2 = await db.collection('staff').doc(editingStaffId).get();
          var staffEmail2 = staffSnap2.exists ? staffSnap2.data().email : email;
          await auth.sendPasswordResetEmail(staffEmail2);
          toast('Password reset email sent to ' + staffEmail2, 'ok');
          document.getElementById('sm-pass').value = '';
        }
      }

      // Email change
      var oldSnap = await db.collection('staff').doc(editingStaffId).get();
      var oldEmail = oldSnap.exists ? oldSnap.data().email : '';
      if (email !== oldEmail) {
        if (editingStaffId === curUser.uid) {
          // Own account — update Auth directly
          await curUser.updateEmail(email);
        } else {
          // Other user — queue as pendingEmail, applied on their next login
          update.pendingEmail = email;
          toast('Email queued — will update when ' + name + ' next logs in ✓', 'ok');
        }
      }

      await db.collection('staff').doc(editingStaffId).update(update);
      toast('Staff updated ✓', 'ok');
      logActivity('staff_edit', 'Edited staff: ' + name + ' (' + smRole + ')');
    }
    closeStaffModal();
    loadAdminStaff();
  } catch(e) {
    var msgs = {
      'auth/email-already-in-use': 'Email already registered',
      'auth/weak-password': 'Password too short',
      'auth/invalid-email': 'Invalid email'
    };
    err.textContent = msgs[e.code] || e.message;
    btn.disabled = false;
    btn.textContent = editingStaffId ? 'Save Changes' : 'Create Account';
  }
}

async function deactivateStaff() {
  if (!editingStaffId) return;
  if (!confirm('Deactivate this staff account? They will not be able to log in.')) return;
  try {
    await db.collection('staff').doc(editingStaffId).update({ active: false });
    toast('Staff deactivated', 'ok');
    closeStaffModal();
    loadAdminStaff();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function reactivateStaff() {
  if (!editingStaffId) return;
  if (!confirm('Reactivate this staff account? They will be able to log in again.')) return;
  try {
    await db.collection('staff').doc(editingStaffId).update({ active: true });
    toast('Staff reactivated ✓', 'ok');
    closeStaffModal();
    loadAdminStaff();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function deleteStaff() {
  if (!editingStaffId) return;
  if (editingStaffId === curUser.uid) { toast('Cannot delete your own account', 'err'); return; }
  var name = document.getElementById('sm-name').value.trim() || 'this staff member';
  if (!confirm('Permanently delete ' + name + '?\n\nThis removes their staff profile. Their orders and activity history will remain. This cannot be undone.')) return;
  try {
    await db.collection('staff').doc(editingStaffId).delete();
    toast(name + ' deleted ✓', 'ok');
    closeStaffModal();
    loadAdminStaff();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function sendStaffPasswordReset() {
  if (!editingStaffId) return;
  var btn = document.getElementById('sm-reset-btn');
  try {
    var snap = await db.collection('staff').doc(editingStaffId).get();
    var email = snap.exists ? snap.data().email : '';
    if (!email) { toast('No email found for this staff member', 'err'); return; }
    btn.disabled = true; btn.textContent = 'Sending...';
    await auth.sendPasswordResetEmail(email);
    toast('Password reset email sent to ' + email + ' ✓', 'ok');
    btn.textContent = '✓ Reset email sent';
    setTimeout(function(){ btn.textContent = '📧 Send Password Reset Email'; btn.disabled = false; }, 4000);
  } catch(e) {
    toast('Failed: ' + e.message, 'err');
    btn.disabled = false; btn.textContent = '📧 Send Password Reset Email';
  }
}

// Temp role functions
function selectTempRole(role) {
  selTempRole = role;
  ['reception','lab','admin','pathologist','phlebotomist'].forEach(function(r){
    document.getElementById('tr-'+r).className = 'tog' + (r===role?' on':'');
  });
}

async function grantTempRole() {
  var email = document.getElementById('temp-email').value.trim();
  var reason = document.getElementById('temp-reason').value.trim();
  if (!email) { toast('Enter staff email','warn'); return; }
  if (!selTempRole) { toast('Select a role','warn'); return; }
  try {
    var snap = await db.collection('staff').where('email','==',email).get();
    if (snap.empty) { toast('Staff not found','err'); return; }
    var staffDoc = snap.docs[0];
    await db.collection('temp_roles').add({
      type: 'role',
      staffId: staffDoc.id, staffName: staffDoc.data().name, staffEmail: email,
      tempRole: selTempRole, reason: reason, date: todayStr(),
      grantedBy: curUser.uid, grantedByName: (curProfile&&curProfile.name)||curUser.email,
      grantedAt: firebase.firestore.FieldValue.serverTimestamp(), active: true
    });
    toast('Temp role granted', 'ok');
    document.getElementById('temp-email').value = '';
    document.getElementById('temp-reason').value = '';
    selTempRole = '';
    ['reception','lab','admin','pathologist'].forEach(function(r){
      document.getElementById('tr-'+r).className = 'tog';
    });
    loadTempRoles();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function loadTempRoles() {
  var el = document.getElementById('temp-roles-list');
  try {
    var snap = await db.collection('temp_roles').where('date','==',todayStr()).where('active','==',true).get();
    if (snap.empty) { el.innerHTML = '<div class="empty">No temp roles active today</div>'; return; }
    var html = '';
    snap.forEach(function(d) {
      var r = d.data();
      if (r.type === 'doctor') return; // handled separately
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid var(--border)">'
        + '<div><div style="font-size:13px;font-weight:500">' + esc(r.staffName) + '</div>'
        + '<div style="font-size:11px;color:var(--text3);font-family:var(--mono)">' + (r.tempRole||'').toUpperCase() + (r.reason?' · '+esc(r.reason):'') + '</div></div>'
        + '<button data-id="' + d.id + '" onclick="revokeTempRole(this.dataset.id)" style="font-size:12px;padding:5px 10px;border:0.5px solid var(--red);border-radius:6px;color:var(--red);background:none;cursor:pointer">Revoke</button>'
        + '</div>';
    });
    el.innerHTML = html || '<div class="empty">No temp roles active today</div>';
  } catch(e) { el.innerHTML = '<div class="empty">Error loading</div>'; }
}

async function revokeTempRole(id) {
  try {
    await db.collection('temp_roles').doc(id).update({ active: false });
    toast('Revoked', 'ok');
    loadTempRoles();
  } catch(e) { toast('Error','err'); }
}

async function grantTempDoctor() {
  var staffSel = document.getElementById('tempdr-staff');
  var doctorSel = document.getElementById('tempdr-doctor');
  var reason = document.getElementById('tempdr-reason').value.trim();
  var staffId = staffSel.value;
  var staffName = staffSel.options[staffSel.selectedIndex] ? staffSel.options[staffSel.selectedIndex].textContent.trim() : '';
  var doctor = doctorSel.value;
  if (!staffId) { toast('Select a staff member','warn'); return; }
  if (!doctor) { toast('Select a doctor','warn'); return; }
  try {
    var existing = await db.collection('temp_roles')
      .where('staffId','==',staffId).where('date','==',todayStr())
      .where('active','==',true).where('type','==','doctor').get();
    var batch = db.batch();
    existing.forEach(function(d){ batch.update(d.ref, {active:false}); });
    await batch.commit();
    await db.collection('temp_roles').add({
      type: 'doctor',
      staffId: staffId, staffName: staffName,
      tempDoctor: doctor, reason: reason,
      date: todayStr(),
      grantedBy: curUser.uid, grantedByName: (curProfile&&curProfile.name)||curUser.email,
      grantedAt: firebase.firestore.FieldValue.serverTimestamp(),
      active: true
    });
    toast('Doctor assigned to ' + staffName + ' for today ✓','ok');
    staffSel.value = ''; doctorSel.value = '';
    document.getElementById('tempdr-reason').value = '';
    loadTempDoctor();
  } catch(e) { toast('Error: ' + e.message,'err'); }
}

async function loadTempDoctor() {
  var el = document.getElementById('temp-doctor-list');
  if (!el) return;
  try {
    var snap = await db.collection('temp_roles')
      .where('date','==',todayStr()).where('active','==',true).where('type','==','doctor').get();
    if (snap.empty) { el.innerHTML = '<div class="empty">No temp assignments today</div>'; return; }
    var html = '';
    snap.forEach(function(d) {
      var r = d.data();
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid var(--border)">'
        + '<div><div style="font-size:13px;font-weight:500">' + esc(r.staffName) + '</div>'
        + '<div style="font-size:12px;color:var(--accent);font-family:var(--mono)">⚔ ' + esc(r.tempDoctor) + '</div>'
        + (r.reason ? '<div style="font-size:11px;color:var(--text3)">' + esc(r.reason) + '</div>' : '')
        + '</div>'
        + '<button data-id="' + d.id + '" onclick="revokeTempDoctor(this.dataset.id)" style="font-size:12px;padding:5px 10px;border:0.5px solid var(--red);border-radius:6px;color:var(--red);background:none;cursor:pointer">Remove</button>'
        + '</div>';
    });
    el.innerHTML = html;
  } catch(e) { el.innerHTML = '<div class="empty">Error loading</div>'; }
}

async function revokeTempDoctor(id) {
  try {
    await db.collection('temp_roles').doc(id).update({ active: false });
    toast('Assignment removed ✓','ok');
    loadTempDoctor();
  } catch(e) { toast('Error','err'); }
}

// ── STAFF ABSENCE ─────────────────────────────────────────────────────────────
async function markAbsent() {
  var staffSel = document.getElementById('absence-staff');
  var fromEl   = document.getElementById('absence-from');
  var toEl     = document.getElementById('absence-to');
  var reasonEl = document.getElementById('absence-reason');
  var staffId  = staffSel.value;
  var fromDate = fromEl.value;
  var toDate   = toEl.value;
  var reason   = reasonEl.value.trim();
  if (!staffId)   { toast('Select a staff member', 'warn'); return; }
  if (!fromDate)  { toast('Select a from date', 'warn'); return; }
  if (!toDate)    { toast('Select a to date', 'warn'); return; }
  if (toDate < fromDate) { toast('To date must be on or after from date', 'warn'); return; }
  var staffName = staffSel.options[staffSel.selectedIndex].text.split(' (')[0];
  try {
    await db.collection('temp_roles').add({
      type: 'absence',
      staffId: staffId, staffName: staffName,
      fromDate: fromDate, toDate: toDate,
      reason: reason,
      markedBy: curUser.uid,
      markedByName: (curProfile && curProfile.name) || curUser.email,
      markedAt: firebase.firestore.FieldValue.serverTimestamp(),
      active: true
    });
    toast(staffName + ' marked absent ✓', 'ok');
    logActivity('staff_absence', 'Marked ' + staffName + ' absent ' + fromDate + ' to ' + toDate + (reason ? ' — ' + reason : ''));
    staffSel.value = '';
    fromEl.value = '';
    toEl.value = '';
    reasonEl.value = '';
    loadAbsences();
    loadAdminStaff();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function loadAbsences() {
  var el = document.getElementById('absence-list');
  if (!el) return;
  var today = todayStr();
  try {
    // Load all active absences; filter client-side (toDate >= today)
    var snap = await db.collection('temp_roles')
      .where('type','==','absence')
      .where('active','==',true)
      .orderBy('fromDate')
      .get();
    var items = [];
    snap.forEach(function(d) {
      var a = d.data();
      if (a.toDate >= today) items.push({ id: d.id, data: a });
    });
    if (!items.length) { el.innerHTML = '<div class="empty">No active or upcoming absences</div>'; return; }
    var html = '';
    items.forEach(function(item) {
      var a = item.data;
      var isNow = a.fromDate <= today && a.toDate >= today;
      var badge = isNow
        ? '<span style="font-size:10px;font-family:var(--mono);background:#EF4444;color:#fff;padding:1px 7px;border-radius:10px;margin-left:6px">ABSENT NOW</span>'
        : '<span style="font-size:10px;font-family:var(--mono);background:#F59E0B;color:#fff;padding:1px 7px;border-radius:10px;margin-left:6px">UPCOMING</span>';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid var(--border)">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:13px;font-weight:500">' + esc(a.staffName) + badge + '</div>'
        + '<div style="font-size:11px;font-family:var(--mono);color:var(--text3);margin-top:2px">'
        + esc(a.fromDate) + ' → ' + esc(a.toDate)
        + (a.reason ? ' · ' + esc(a.reason) : '') + '</div>'
        + '</div>'
        + '<button data-id="' + item.id + '" onclick="cancelAbsence(this.dataset.id)" style="font-size:12px;padding:5px 10px;border:0.5px solid var(--red);border-radius:6px;color:var(--red);background:none;cursor:pointer;flex-shrink:0;margin-left:8px">Cancel</button>'
        + '</div>';
    });
    el.innerHTML = html;
  } catch(e) { el.innerHTML = '<div class="empty">Error loading absences</div>'; }
}

async function cancelAbsence(id) {
  if (!confirm('Cancel this absence record?')) return;
  try {
    await db.collection('temp_roles').doc(id).update({ active: false });
    toast('Absence cancelled ✓', 'ok');
    loadAbsences();
    loadAdminStaff();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

// Returns true if staffId is currently absent (used by task dispatch logic)
var _absenceCache = null;
var _absenceCacheDate = '';
async function isStaffAbsent(staffId) {
  var today = todayStr();
  if (_absenceCacheDate !== today || !_absenceCache) {
    var snap = await db.collection('temp_roles')
      .where('type','==','absence')
      .where('active','==',true)
      .get();
    _absenceCache = [];
    snap.forEach(function(d) { _absenceCache.push(d.data()); });
    _absenceCacheDate = today;
  }
  return _absenceCache.some(function(a) {
    return a.staffId === staffId && a.fromDate <= today && a.toDate >= today;
  });
}

// [moved to utils.js]

