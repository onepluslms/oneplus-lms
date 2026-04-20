// ── reports.js — oPLUS LMS v20.03 ───────────────────────────────────────
// EOD, cash handover, dues reminder, phlebotomist review, collect due

// ── PHLEBOTOMIST REVIEW ──────────────────────────────────────────────────
var reviewPeriod = 'week';

function setReviewPeriod(period) {
  reviewPeriod = period;
  ['week','month','custom'].forEach(function(id){
    var btn = document.getElementById('rev-btn-'+id);
    if (btn) btn.className = 'tog'+(id===period?' on':'');
  });
  var customDates = document.getElementById('rev-custom-dates');
  if (customDates) customDates.style.display = period==='custom' ? 'block' : 'none';
  if (period !== 'custom') loadReview();
}


// ── DUES REMINDER ──
var _pendingDuesForReminder = [];

function checkDuesReminder() {
  var myUid = curUser && curUser.uid;
  if (!myUid) return;
  var d = new Date(); d.setDate(d.getDate()-90);
  var fromDate = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  db.collection('orders')
    .where('hasDue','==',true)
    .where('date','>=',fromDate)
    .where('createdBy','==',myUid)
    .get().then(function(snap) {
      if (snap.empty) return;
      var dues = [];
      snap.forEach(function(d){
        var o = Object.assign({id:d.id},d.data());
        if (!o.reminderSuppressed) dues.push(o);
      });
      if (!dues.length) return;
      dues.sort(function(a,b){ return (a.date||'').localeCompare(b.date||''); });
      _pendingDuesForReminder = dues;
      showDuesReminderModal(dues);
      // 9 AM WhatsApp trigger
      var now = new Date();
      var h = now.getHours(), m = now.getMinutes();
      if (h === 9 && m < 30) {
        // Within 9:00–9:30 AM window — auto-open WA if staff has a phone number
        var staffPhone = curProfile && curProfile.phone;
        if (staffPhone) {
          setTimeout(function(){ sendDuesWhatsApp(); }, 2000);
        }
      }
    }).catch(function(){});
}

function showDuesReminderModal(dues) {
  var total = dues.reduce(function(s,o){ return s+(o.dueAmount>0?o.dueAmount:(o.netAmount||o.totalAmount||0)); },0);
  document.getElementById('dues-reminder-sub').textContent =
    dues.length + ' pending due' + (dues.length>1?'s':'') + ' — Total Rs.' + total.toLocaleString('en-IN');
  document.getElementById('dues-reminder-list').innerHTML = dues.map(function(o){
    var due = o.dueAmount>0?o.dueAmount:(o.netAmount||o.totalAmount||0);
    var daysAgo = Math.floor((Date.now()-new Date(o.date).getTime())/86400000);
    var age = daysAgo===0?'Today':daysAgo===1?'Yesterday':daysAgo+'d ago';
    return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid var(--border);cursor:pointer" onclick="closeDuesReminder();openOrderDetail(\''+o.id+'\')">'
      +'<div><div style="font-size:13px;font-weight:500">'+esc(o.patientName)+'</div>'
      +'<div style="font-size:11px;color:var(--text3)">'+age+' · '+esc(o.phone||'-')+'</div></div>'
      +'<div style="font-size:13px;font-weight:600;color:#D97706">Rs.'+due.toLocaleString('en-IN')+'</div>'
      +'</div>';
  }).join('');
  // Hide WA button if no staff phone
  var staffPhone = curProfile && curProfile.phone;
  document.getElementById('dues-wa-btn').style.display = staffPhone ? 'block' : 'none';
  document.getElementById('dues-reminder-bg').style.display = 'flex';
}

function closeDuesReminder() {
  document.getElementById('dues-reminder-bg').style.display = 'none';
}

function sendDuesWhatsApp() {
  var staffPhone = curProfile && curProfile.phone;
  if (!staffPhone) { toast('No WhatsApp number set for your profile', 'warn'); return; }
  var name = (curProfile&&curProfile.name)||'Staff';
  var role = (curProfile&&curProfile.role||'').toUpperCase();
  var now = new Date();
  var dateStr = now.getDate()+'/'+(now.getMonth()+1)+'/'+now.getFullYear();
  var timeStr = now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  var dues = _pendingDuesForReminder;
  var total = dues.reduce(function(s,o){ return s+(o.dueAmount>0?o.dueAmount:(o.netAmount||o.totalAmount||0)); },0);
  var lines = dues.map(function(o,i){
    var due = o.dueAmount>0?o.dueAmount:(o.netAmount||o.totalAmount||0);
    var daysAgo = Math.floor((Date.now()-new Date(o.date).getTime())/86400000);
    var age = daysAgo===0?'today':daysAgo===1?'yesterday':daysAgo+' days ago';
    return (i+1)+'. '+o.patientName+' — Rs.'+due.toLocaleString('en-IN')+' (booked '+age+')';
  }).join('\n');
  var msg = '📋 *OnePLUS Lab — Pending Dues Reminder*\n'
    +'Staff: '+name+' ('+role+')\n'
    +'Date: '+dateStr+', '+timeStr+'\n\n'
    +lines+'\n\n'
    +'*Total pending: Rs.'+total.toLocaleString('en-IN')+'*\n'
    +'Please collect and update in the app.\n'
    +'OnePLUS Ultrasound Lab, Pitampura | 011-4248 0101';
  window.open('https://wa.me/91'+staffPhone+'?text='+encodeURIComponent(msg),'_blank');
  closeDuesReminder();
}

function toggleDuesList() {
  var listEl = document.getElementById('dash-dues');
  var chevron = document.getElementById('dues-chevron');
  var open = listEl.style.display === 'block';
  listEl.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
}

var CATALOGUE = [];
var PANELS = {};
var PANEL_NAMES = {standard:'Standard',jk:'Dr J K Gupta',du:'DU Panel',sh:'Dr Shalini Gupta'};

// ── COLLECT DUE PAYMENT ──
var _cDueOrderId = null;
var _cDueMax = 0;
var _cDuePayMode = 'cash';

function loadDuesTracking() {
  var fromVal = document.getElementById('dues-track-from').value;
  var toVal = document.getElementById('dues-track-to').value;
  var el = document.getElementById('dues-tracking-list');
  if (!fromVal || !toVal) { el.innerHTML = '<div class="empty">Select both dates</div>'; return; }
  // Enforce 90 day max
  var diffDays = Math.floor((new Date(toVal)-new Date(fromVal))/86400000);
  if (diffDays > 90) { el.innerHTML = '<div class="empty">Max range is 90 days</div>'; return; }
  if (diffDays < 0) { el.innerHTML = '<div class="empty">From date must be before To date</div>'; return; }
  el.innerHTML = '<div class="empty">Loading...</div>';
  db.collection('orders')
    .where('hasDue','==',true)
    .where('date','>=',fromVal)
    .where('date','<=',toVal)
    .get().then(function(snap) {
      if (snap.empty) { el.innerHTML = '<div class="empty">No pending dues in this range</div>'; return; }
      // Group by staff
      var byStaff = {};
      snap.forEach(function(d) {
        var o = Object.assign({id:d.id},d.data());
        var uid = o.createdBy || 'unknown';
        var uname = o.createdByName || 'Unknown';
        if (!byStaff[uid]) byStaff[uid] = {name:uname, orders:[], total:0};
        var due = o.dueAmount>0?o.dueAmount:(o.netAmount||o.totalAmount||0);
        byStaff[uid].orders.push(o);
        byStaff[uid].total += due;
      });
      var grandTotal = Object.values(byStaff).reduce(function(s,g){ return s+g.total; },0);
      var html = '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-strong);margin-bottom:8px">'
        +'<div style="font-size:12px;font-family:var(--mono);color:var(--text3)">'+snap.size+' orders · '+Object.keys(byStaff).length+' staff</div>'
        +'<div style="font-size:14px;font-weight:600;color:#D97706">Rs.'+grandTotal.toLocaleString('en-IN')+' total</div>'
        +'</div>';
      Object.values(byStaff).sort(function(a,b){ return b.total-a.total; }).forEach(function(g) {
        html += '<div style="margin-bottom:12px">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
          +'<div style="font-size:13px;font-weight:600">'+esc(g.name)+'</div>'
          +'<div style="font-size:13px;font-weight:600;color:#D97706">Rs.'+g.total.toLocaleString('en-IN')+'</div>'
          +'</div>';
        g.orders.forEach(function(o) {
          var due = o.dueAmount>0?o.dueAmount:(o.netAmount||o.totalAmount||0);
          var suppressed = o.reminderSuppressed || false;
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--surface2);border-radius:6px;margin-bottom:4px;cursor:pointer" onclick="closeDuesTrackingAndOpen(\''+o.id+'\')">'
            +'<div><div style="font-size:12px;font-weight:500">'+esc(o.patientName)+'</div>'
            +'<div style="font-size:10px;font-family:var(--mono);color:var(--text3)">'+esc(o.date||'')+(suppressed?' · 🔕 Suppressed':'')+'</div></div>'
            +'<div style="text-align:right">'
            +'<div style="font-size:12px;font-weight:500;color:#D97706">Rs.'+due.toLocaleString('en-IN')+'</div>'
            +'<div style="font-size:10px;color:var(--accent)">View ›</div>'
            +'</div></div>';
        });
        html += '</div>';
      });
      el.innerHTML = html;
    }).catch(function(e){ el.innerHTML = '<div class="empty">Error: '+e.message+'</div>'; });
}

function closeDuesTrackingAndOpen(orderId) {
  goTo('s-order-detail');
  openOrderDetail(orderId);
}

// ── CASH HANDOVER — Chain of Custody ──
var hoUnsubscribe = null; // Firestore real-time listener handle

var hoMode = 'normal'; // 'normal' | 'refund'

function setHOMode(mode) {
  hoMode = mode;
  var nb = document.getElementById('ho-mode-normal');
  var rb = document.getElementById('ho-mode-refund');
  var desc = document.getElementById('ho-mode-desc');
  var lbl = document.getElementById('ho-to-label');
  var btn = document.getElementById('ho-submit-btn');
  nb.style.background = mode==='normal'?'var(--accent)':'var(--surface)';
  nb.style.color = mode==='normal'?'#fff':'var(--text2)';
  nb.style.borderColor = mode==='normal'?'var(--accent)':'var(--border-strong)';
  rb.style.background = mode==='refund'?'#DC2626':'var(--surface)';
  rb.style.color = mode==='refund'?'#fff':'var(--text2)';
  rb.style.borderColor = mode==='refund'?'#DC2626':'var(--border-strong)';
  if (mode==='refund') {
    desc.textContent = 'Refund: request cash back from a staff member. They must accept to confirm the return.';
    desc.style.color = '#DC2626';
    lbl.textContent = 'Refund From';
    btn.textContent = '↓ Request Refund';
    btn.style.background = '#DC2626';
    btn.style.borderColor = '#DC2626';
  } else {
    desc.textContent = 'Recipient must accept before custody transfers.';
    desc.style.color = 'var(--text2)';
    lbl.textContent = 'Handover To';
    btn.textContent = 'Initiate Handover →';
    btn.style.background = 'var(--accent)';
    btn.style.borderColor = 'var(--accent)';
  }
}

function loadHO() {
  var today = todayStr();
  document.getElementById('ho-date').textContent = today;
  setHOMode('normal'); // always start in normal mode

  // Populate staff dropdown (exclude self)
  db.collection('staff').where('active','==',true).get().then(function(snap) {
    var sel = document.getElementById('ho-to');
    var current = sel.value;
    sel.innerHTML = '<option value="">Select recipient...</option>';
    snap.forEach(function(d) {
      var s = d.data();
      if (d.id === curUser.uid) return; // exclude self by UID
      var myName = (curProfile&&curProfile.name)||curUser.email;
      if (s.name && s.name === myName) return; // exclude self by name (fallback)
      var opt = document.createElement('option');
      opt.value = s.name;
      opt.dataset.uid = d.id;
      opt.dataset.name = s.name;
      opt.textContent = s.name + ' (' + (s.role||'staff') + ')';
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  }).catch(function(){});

  // Load today's cash totals from orders
  db.collection('orders').where('date','==',today).get().then(function(snap){
    var cash=0, upi=0, credit=0;
    snap.forEach(function(d){ var o=d.data(); if(o.payMode==='cash') cash+=(o.paidAmount||0); else if(o.payMode==='upi'||o.payMode==='card') upi+=(o.paidAmount||0); else if(o.payMode==='credit') credit+=(o.totalAmount||0); });
    document.getElementById('ho-cash').textContent='Rs.'+cash.toLocaleString('en-IN');
    document.getElementById('ho-upi').textContent='Rs.'+upi.toLocaleString('en-IN');
    document.getElementById('ho-credit').textContent='Rs.'+credit.toLocaleString('en-IN');
    document.getElementById('ho-amt').value=cash;
  }).catch(function(){});

  // Real-time listener for today's handovers (for pending detection)
  if (hoUnsubscribe) hoUnsubscribe();
  hoUnsubscribe = db.collection('handovers').where('date','==',today)
    .onSnapshot(function(snap){
      var rows = [];
      snap.forEach(function(d){ rows.push(Object.assign({id:d.id}, d.data())); });
      rows.sort(function(a,b){ return (b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0)-(a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0); });
      renderHOList(rows);
      renderHOPending(rows);
    }, function(){ });
}

function renderOrdersInHandover(orders) {
  if (!orders || !orders.length) return '';
  return '<div style="margin-top:8px;border-top:0.5px solid var(--border);padding-top:8px">'    + '<div style="font-size:10px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;margin-bottom:6px">Patients included</div>'    + orders.map(function(o){        return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:5px 0;border-bottom:0.5px solid var(--border);font-size:12px">'          + '<div style="flex:1;min-width:0">'            + '<div style="font-weight:500">'+esc(o.patientName)+(o.age?' · '+o.age+'yr':'')+(o.sex?' '+esc(o.sex):'')+'</div>'            + '<div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(o.tests||'-')+'</div>'          + '</div>'          + '<div style="font-family:var(--mono);font-size:12px;color:var(--accent);margin-left:8px;white-space:nowrap">Rs.'+o.cashAmt.toLocaleString('en-IN')+'</div>'          + '</div>';      }).join('')    + '</div>';}

function renderHOPending(rows) {
  var myName = (curProfile&&curProfile.name)||'';
  var myFirst = myName.split(' ')[0].toLowerCase();
  var pending = rows.filter(function(h){
    if (h.custodyStatus !== 'PENDING') return false;
    if (h.type === 'refund') {
      // Refund pending: show to the person being asked to return cash
      return h.refundRequestedFromName && h.refundRequestedFromName.toLowerCase().indexOf(myFirst) >= 0;
    }
    // Normal handover: show to recipient
    return h.handoverTo && h.handoverTo.toLowerCase().indexOf(myFirst) >= 0;
  });
  var sec = document.getElementById('ho-pending-section');
  var list = document.getElementById('ho-pending-list');
  if (!pending.length) { sec.style.display='none'; return; }
  sec.style.display='block';
  list.innerHTML = pending.map(function(h){
    var isRefund = h.type === 'refund';
    return '<div class="ho-pending-item" style="'+(isRefund?'border-left:3px solid #DC2626;':'')+'">'
      +(isRefund?'<div style="font-size:10px;font-family:var(--mono);color:#DC2626;font-weight:600;margin-bottom:4px">↓ REFUND REQUEST</div>':'')
      +'<div class="ho-pending-meta">'+(isRefund?'Refund requested by':'From')+' <strong>'+esc(h.recordedByName||'-')+'</strong> · '+esc(h.time||'')+'</div>'
      +'<div class="ho-pending-amt">Rs.'+(h.amount||0).toLocaleString('en-IN')+'</div>'
      +'<div class="ho-pending-from">'+(h.notes?esc(h.notes):'No notes')+'</div>'      +renderOrdersInHandover(h.orders)      +'<div class="ho-pending-actions">'        +'<button class="btn-accept" onclick="hoConfirm(&quot;accept&quot;,&quot;'+h.id+'&quot;,&quot;'+esc(h.recordedByName||'')+'&quot;,'+(h.amount||0)+')">&#10003; Accept Custody</button>'        +'<button class="btn-reject" onclick="hoConfirm(&quot;reject&quot;,&quot;'+h.id+'&quot;,&quot;'+esc(h.recordedByName||'')+'&quot;,'+(h.amount||0)+')">&#10007; Reject</button>'      +'</div>'    +'</div>';  }).join('');
}

function renderHOList(rows) {
  var el = document.getElementById('ho-list');
  if (!rows.length) { el.innerHTML='<div class="empty">No handovers recorded yet</div>'; return; }
  el.innerHTML = rows.map(function(h){
    var status = h.custodyStatus || 'ACCEPTED';
    var badgeClass = status==='PENDING'?'pending':status==='REJECTED'?'rejected':'accepted';
    var badgeLabel = status==='PENDING'?'Awaiting Acceptance':status==='REJECTED'?'Rejected':'Accepted';
    var refundBadge = h.type==='refund'?'<span style="font-size:9px;font-family:var(--mono);background:#FEE2E2;color:#DC2626;padding:1px 6px;border-radius:10px;margin-left:4px">REFUND</span>':'';
    var acceptedLine = '';
    if (status==='ACCEPTED' && h.acceptedAt) acceptedLine='<div><div class="ho-card-k">Accepted At</div><div class="ho-card-v">'+esc(h.acceptedAt)+'</div></div>';
    if (status==='REJECTED' && h.rejectedAt) acceptedLine='<div><div class="ho-card-k">Rejected At</div><div class="ho-card-v">'+esc(h.rejectedAt)+'</div></div>';
    return '<div class="ho-handover-card">'      +'<div class="ho-card-header">'        +'<span style="font-size:10px;font-family:var(--mono);color:var(--text3)">#'+h.id.slice(-6).toUpperCase()+'</span>'        +'<span class="ho-status-badge '+badgeClass+'">'+badgeLabel+'</span>'+refundBadge        +'<span style="font-size:10px;font-family:var(--mono);color:var(--text3)">'+esc(h.time||'')+'</span>'      +'</div>'      +'<div class="ho-card-body">'        +(h.type==='refund'
          ?'<div><div class="ho-card-k">Refund From</div><div class="ho-card-v" style="color:#DC2626">'+esc(h.refundRequestedFromName||h.handoverFrom||'-')+'</div></div>'
          +'<div><div class="ho-card-k">To</div><div class="ho-card-v">'+esc(h.handoverTo)+'</div></div>'
          :'<div><div class="ho-card-k">To</div><div class="ho-card-v">'+esc(h.handoverTo)+'</div></div>')        +'<div><div class="ho-card-k">Amount</div><div class="ho-card-v amount">Rs.'+(h.amount||0).toLocaleString('en-IN')+'</div></div>'        +'<div><div class="ho-card-k">By</div><div class="ho-card-v">'+esc(h.recordedByName||'-')+'</div></div>'        +'<div><div class="ho-card-k">Notes</div><div class="ho-card-v">'+esc(h.notes||'-')+'</div></div>'        +acceptedLine      +'</div>'      +renderOrdersInHandover(h.orders)    +'</div>';  }).join('');
}
function submitHandover() {
  var sel = document.getElementById('ho-to');
  var to = sel.value;
  var toUID = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].dataset.uid || '' : '';
  var toName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].dataset.name || to : to;
  var amt = parseFloat(document.getElementById('ho-amt').value||0);
  var notes = document.getElementById('ho-notes').value.trim();
  if (!to) { toast(hoMode==='refund'?'Select who to refund from':'Select a recipient','warn'); return; }
  if (!amt || amt<=0) { toast('Enter a valid amount','warn'); return; }
  var myName = (curProfile&&curProfile.name)||curUser.email;
  if (toUID && toUID === curUser.uid) { toast('Cannot hand over to yourself','warn'); return; }
  if (!toUID && toName && toName === myName) { toast('Cannot hand over to yourself','warn'); return; }

  var today = todayStr();
  var myUid = curUser.uid;
  var myName = (curProfile&&curProfile.name)||curUser.email;

  // REFUND MODE — request cash back from another staff member
  // No cash-in-hand check needed (we're receiving, not giving)
  if (hoMode === 'refund') {
    // Check no pending refund already exists from us
    db.collection('handovers').where('date','==',today).get().then(function(hoSnap) {
      var hasPending = false;
      hoSnap.forEach(function(d) {
        var h = d.data();
        if (h.recordedBy === myUid && h.custodyStatus === 'PENDING') hasPending = true;
      });
      if (hasPending) { toast('You already have a pending handover. Wait for it to resolve first.','warn'); return; }
      var now = new Date();
      db.collection('handovers').add({
        handoverTo: myName,   // refund goes TO the initiator
        handoverFrom: toName, // refund comes FROM this person
        amount: amt, notes: notes ? notes : 'Refund', date: today,
        time: now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        recordedBy: myUid, recordedByName: myName,
        refundRequestedFrom: to, refundRequestedFromName: toName,
        custodyStatus: 'PENDING',
        type: 'refund'
      }).then(function(){
        toast('Refund request sent to '+toName+' — awaiting their acceptance','ok');
        logActivity('handover_out', 'Refund request Rs.'+amt.toLocaleString('en-IN')+' from '+toName);
        sel.value='';
        document.getElementById('ho-amt').value='';
        document.getElementById('ho-notes').value='';
        setHOMode('normal');
        loadStats();
      }).catch(function(){ toast('Failed — check connection','err'); });
    }).catch(function(){ toast('Could not verify — check connection','err'); });
    return;
  }

  // NORMAL HANDOVER MODE
  // Guard: compute actual cash in hand before allowing transfer
  Promise.all([
    db.collection('orders').where('date','==',today).get(),
    db.collection('handovers').where('date','==',today).get()
  ]).then(function(results) {
    var orderSnap = results[0], hoSnap = results[1];

    var cashCollected = 0;
    orderSnap.forEach(function(d) {
      var o = d.data();
      if (o.payMode === 'cash') cashCollected += (o.paidAmount||0);
      if (o.source !== 'Walk-in') cashCollected += (o.collectionCharge||0);
    });

    var alreadyHandedOver = 0;
    var hasPendingOut = false;
    hoSnap.forEach(function(d) {
      var h = d.data();
      if (h.recordedBy !== myUid) return;
      if (h.custodyStatus === 'ACCEPTED') alreadyHandedOver += (h.amount||0);
      if (h.custodyStatus === 'PENDING') hasPendingOut = true;
    });

    if (hasPendingOut) {
      toast('You already have a pending handover awaiting acceptance. Wait for it to be accepted or rejected first.','warn');
      return;
    }

    var cashInHand = cashCollected - alreadyHandedOver;
    if (amt > cashInHand + 0.01) {
      toast('Amount exceeds your cash in hand (Rs.'+Math.max(0,cashInHand).toLocaleString('en-IN')+')','warn');
      return;
    }

    var myOrders = [];
    orderSnap.forEach(function(d) {
      var o = d.data();
      if (o.createdBy === myUid && (o.payMode === 'cash' || o.payMode === 'split')) {
        var cashAmt = o.payMode === 'split' && o.splitPayments ? (o.splitPayments.cash||0) : (o.paidAmount||0);
        if (cashAmt > 0) {
          myOrders.push({
            patientName: o.patientName||'', age: o.age||'', sex: o.sex||'',
            tests: (o.tests||[]).map(function(t){ return t.name; }).join(', '),
            cashAmt: cashAmt, orderId: d.id.slice(-6).toUpperCase()
          });
        }
      }
    });

    var now = new Date();
    db.collection('handovers').add({
      handoverTo: toName, amount: amt, notes: notes, date: today,
      time: now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      recordedBy: myUid, recordedByName: myName,
      custodyStatus: 'PENDING',
      type: 'normal',
      orders: myOrders
    }).then(function(){
      toast('Handover initiated — awaiting acceptance by '+toName,'ok');
      logActivity('handover_out', 'Handed over Rs.'+amt.toLocaleString('en-IN')+' to '+toName);
      sel.value='';
      document.getElementById('ho-notes').value='';
      loadStats();
    }).catch(function(){ toast('Failed — check connection','err'); });

  }).catch(function(){ toast('Could not verify balance — check connection','err'); });
}

// PIN-authenticated handover confirmation
var hoPendingAction = null;
var hoPinBuf = '';

function hoConfirm(action, hvid, fromName, amount) {
  hoPendingAction = {action:action, hvid:hvid};
  hoPinBuf = '';
  hoUpdatePinDots();
  document.getElementById('ho-pin-err').textContent = '';
  var title = document.getElementById('ho-confirm-title');
  var sub = document.getElementById('ho-confirm-sub');
  if (action==='accept') {
    title.textContent = 'Accept Cash Custody?';
    sub.textContent = 'Rs.'+amount.toLocaleString('en-IN')+' from '+fromName+'. Enter your PIN to authenticate.';
  } else {
    title.textContent = 'Reject Handover?';
    sub.textContent = 'Rejecting Rs.'+amount.toLocaleString('en-IN')+' from '+fromName+'. Enter your PIN to confirm.';
  }
  document.getElementById('ho-confirm-overlay').style.display='flex';
}
function hoConfirmCancel() {
  document.getElementById('ho-confirm-overlay').style.display='none';
  hoPendingAction = null; hoPinBuf = '';
}
function hoPinKey(k) {
  if (hoPinBuf.length >= 4) return;
  hoPinBuf += k;
  hoUpdatePinDots();
  if (hoPinBuf.length === 4) hoConfirmExecute();
}
function hoPinBack() {
  hoPinBuf = hoPinBuf.slice(0,-1);
  hoUpdatePinDots();
  document.getElementById('ho-pin-err').textContent = '';
}
function hoUpdatePinDots() {
  for (var i=0;i<4;i++) {
    var dot = document.getElementById('hpd'+i);
    if (dot) {
      dot.style.background = i < hoPinBuf.length ? 'var(--accent)' : '';
      dot.style.borderColor = i < hoPinBuf.length ? 'var(--accent)' : '#9CA3AF';
    }
  }
}
async function hoConfirmExecute() {
  if (hoPinBuf.length < 4) return;
  var storedPin = curProfile && curProfile.pin ? curProfile.pin : '';
  if (storedPin) {
    var hashed = await hashPin(hoPinBuf);
    if (hashed !== storedPin) {
      document.getElementById('ho-pin-err').textContent = 'Incorrect PIN';
      hoPinBuf = ''; hoUpdatePinDots(); return;
    }
  }
  // If a transfer PIN override is active, route there instead
  if (_hoExecuteOverride) { _hoExecuteOverride(); return; }
  if (!hoPendingAction) return;
  var action = hoPendingAction.action;
  var hvid = hoPendingAction.hvid;
  hoConfirmCancel();
  var now = new Date();
  var timeStr = now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  var byName = (curProfile&&curProfile.name)||curUser.email;
  // Transaction guard: read-then-write ensures custodyStatus is still PENDING
  // This prevents double-accept from two devices or rapid re-taps
  var ref = db.collection('handovers').doc(hvid);
  var updateData;
  if (action==='accept') {
    updateData = {
      custodyStatus: 'ACCEPTED', acceptedBy: curUser.uid,
      acceptedByName: byName, acceptedAt: timeStr,
      acceptedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
  } else {
    updateData = {
      custodyStatus: 'REJECTED', rejectedBy: curUser.uid,
      rejectedByName: byName, rejectedAt: timeStr,
      rejectedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
  }
  db.runTransaction(function(tx) {
    return tx.get(ref).then(function(doc) {
      if (!doc.exists) throw new Error('not_found');
      if (doc.data().custodyStatus !== 'PENDING') throw new Error('already_actioned');
      tx.update(ref, updateData);
    });
  }).then(function(){
    if (action==='accept') { toast('Cash accepted — PIN verified ✓','ok'); logActivity('handover_in', 'Accepted handover Rs.'+(hoPendingAction&&hoPendingAction.amount?hoPendingAction.amount.toLocaleString('en-IN'):'?')+' from '+(hoPendingAction&&hoPendingAction.recordedByName||'?')); loadStats(); }
    else { toast('Handover rejected','warn'); logActivity('handover_rej', 'Rejected handover from '+(hoPendingAction&&hoPendingAction.recordedByName||'?')); }
  }).catch(function(err){
    if (err.message === 'already_actioned') toast('Already accepted or rejected by another session','warn');
    else if (err.message === 'not_found') toast('Handover record not found','err');
    else toast('Failed — check connection','err');
  });
}

// ── EOD ──
function showEODTab(tab) {
  document.getElementById('eod-panel-summary').style.display = tab==='summary' ? 'block' : 'none';
  document.getElementById('eod-panel-charges').style.display = tab==='charges' ? 'block' : 'none';
  var s = document.getElementById('eod-tab-summary');
  var c = document.getElementById('eod-tab-charges');
  s.style.background = tab==='summary'?'var(--accent)':'var(--surface)';
  s.style.color = tab==='summary'?'#fff':'var(--text2)';
  s.style.borderColor = tab==='summary'?'var(--accent)':'var(--border-strong)';
  c.style.background = tab==='charges'?'var(--accent)':'var(--surface)';
  c.style.color = tab==='charges'?'#fff':'var(--text2)';
  c.style.borderColor = tab==='charges'?'var(--accent)':'var(--border-strong)';
  if (tab==='charges') loadCollectionCharges('daily');
}

var ccPeriod = 'daily';

function showCCPeriod(period) {
  ccPeriod = period;
  var d = document.getElementById('cc-tab-daily');
  var w = document.getElementById('cc-tab-weekly');
  d.style.background = period==='daily'?'var(--accent)':'var(--surface)';
  d.style.color = period==='daily'?'#fff':'var(--text2)';
  d.style.borderColor = period==='daily'?'var(--accent)':'var(--border-strong)';
  w.style.background = period==='weekly'?'var(--accent)':'var(--surface)';
  w.style.color = period==='weekly'?'#fff':'var(--text2)';
  w.style.borderColor = period==='weekly'?'var(--accent)':'var(--border-strong)';
  loadCollectionCharges(period);
}

function loadCollectionCharges(period) {
  var loading = document.getElementById('cc-loading');
  var list = document.getElementById('cc-list');
  loading.style.display = 'block';
  list.innerHTML = '';

  // Compute date range
  var today = new Date();
  var endStr = todayStr();
  var startStr;
  if (period === 'daily') {
    startStr = endStr;
  } else {
    // This week — Monday to today
    var day = today.getDay(); // 0=Sun
    var diff = (day === 0) ? 6 : day - 1; // days since Monday
    var monday = new Date(today);
    monday.setDate(today.getDate() - diff);
    startStr = monday.getFullYear() + '-' + String(monday.getMonth()+1).padStart(2,'0') + '-' + String(monday.getDate()).padStart(2,'0');
  }

  db.collection('orders')
    .where('date', '>=', startStr)
    .where('date', '<=', endStr)
    .get()
    .then(function(snap) {
      // Group collection charges by user
      var byUser = {}; // uid -> {name, total, orders: [{date, patient, amount}]}
      snap.forEach(function(d) {
        var o = d.data();
        var cc = o.collectionCharge || 0;
        if (!cc || o.source === 'Walk-in') return; // walk-in has no collection charge
        var uid = o.createdBy || 'unknown';
        var name = o.createdByName || 'Unknown';
        if (!byUser[uid]) byUser[uid] = { name: name, total: 0, orders: [] };
        byUser[uid].total += cc;
        byUser[uid].orders.push({
          date: o.date || '',
          patient: o.patientName || '-',
          amount: cc,
          source: o.source || ''
        });
      });

      loading.style.display = 'none';
      var users = Object.keys(byUser);
      if (!users.length) {
        list.innerHTML = '<div class="empty">No collection charges for this period</div>';
        return;
      }

      // Sort by total desc
      users.sort(function(a,b){ return byUser[b].total - byUser[a].total; });

      // Grand total
      var grandTotal = users.reduce(function(s,uid){ return s + byUser[uid].total; }, 0);

      var html = '<div style="background:var(--accent-light);border:1px solid var(--accent);border-radius:var(--radius);padding:12px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">'
        + '<div style="font-size:13px;font-weight:500">' + (period==='daily'?'Today':'This Week') + ' — Total</div>'
        + '<div style="font-size:18px;font-weight:600;color:var(--accent)">Rs.' + grandTotal.toLocaleString('en-IN') + '</div>'
        + '</div>';

      users.forEach(function(uid) {
        var u = byUser[uid];
        // Sort orders by date desc
        u.orders.sort(function(a,b){ return b.date.localeCompare(a.date); });
        var ordersHtml = u.orders.map(function(o){
          return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:0.5px solid var(--border)">'
            + '<div><span style="color:var(--text3);font-family:var(--mono);font-size:10px">' + esc(o.date) + '</span> ' + esc(o.patient) + '</div>'
            + '<div style="font-family:var(--mono);color:var(--blue,#2563EB);white-space:nowrap;margin-left:8px">Rs.' + o.amount.toLocaleString('en-IN') + '</div>'
            + '</div>';
        }).join('');

        html += '<div class="card" style="margin-bottom:10px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
            + '<div style="font-size:13px;font-weight:500">' + esc(u.name) + '</div>'
            + '<div style="font-size:16px;font-weight:600;color:var(--accent);font-family:var(--mono)">Rs.' + u.total.toLocaleString('en-IN') + '</div>'
          + '</div>'
          + '<div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-bottom:6px">' + u.orders.length + ' home collection' + (u.orders.length!==1?'s':'') + '</div>'
          + ordersHtml
          + '</div>';
      });

      list.innerHTML = html;
    })
    .catch(function(e) {
      loading.style.display = 'none';
      list.innerHTML = '<div class="empty">Error: ' + esc(e.message) + '</div>';
    });
}


// ── EOD AUTO-SEND ─────────────────────────────────────────────────────────
var EOD_AUTO_SEND_KEY = 'eod_auto_enabled';
var EOD_AUTO_TIME_KEY = 'eod_auto_time';
var EOD_AUTO_SENT_KEY = 'eod_auto_sent_date'; // localStorage key — date string

function saveEODAutoEnabled(val) {
  localStorage.setItem(EOD_AUTO_SEND_KEY, val ? '1' : '0');
  toast(val ? 'Auto-send enabled ✓' : 'Auto-send disabled', 'ok');
}

function saveEODAutoTime(val) {
  localStorage.setItem(EOD_AUTO_TIME_KEY, val);
  toast('Auto-send time set to ' + val, 'ok');
}

function loadEODAutoSettings() {
  var enabled = localStorage.getItem(EOD_AUTO_SEND_KEY) === '1';
  var time = localStorage.getItem(EOD_AUTO_TIME_KEY) || '22:00';
  var enabledEl = document.getElementById('eod-auto-enabled');
  var timeEl = document.getElementById('eod-auto-time');
  if (enabledEl) enabledEl.checked = enabled;
  if (timeEl) timeEl.value = time;
}

function checkEODAutoSend() {
  // Only admin/manager/pathologist trigger auto-send
  var role = curProfile && curProfile.role || '';
  if (role !== 'admin' && role !== 'manager' && role !== 'pathologist') return;

  var enabled = localStorage.getItem(EOD_AUTO_SEND_KEY) === '1';
  if (!enabled) return;

  // Check if already sent today
  var today = todayStr();
  var lastSent = localStorage.getItem(EOD_AUTO_SENT_KEY);
  if (lastSent === today) return; // already sent today

  // Check if current time is within 30 min window of configured time
  var configTime = localStorage.getItem(EOD_AUTO_TIME_KEY) || '22:00';
  var parts = configTime.split(':');
  var configH = parseInt(parts[0], 10);
  var configM = parseInt(parts[1], 10);
  var now = new Date();
  var nowH = now.getHours();
  var nowM = now.getMinutes();
  var nowMins = nowH * 60 + nowM;
  var configMins = configH * 60 + configM;

  // Fire if within a 30-minute window after configured time
  if (nowMins >= configMins && nowMins < configMins + 30) {
    // Mark sent first to prevent double-fire
    localStorage.setItem(EOD_AUTO_SENT_KEY, today);
    // Load EOD data then auto-send
    autoSendEOD();
  }
}

function autoSendEOD() {
  var today = todayStr();
  db.collection('orders').where('date', '==', today).get().then(function(snap) {
    var cash=0, upi=0, card=0, credit=0, total=0, coll=0;
    snap.forEach(function(doc) {
      var o = doc.data();
      var paid = o.paidAmount || 0;
      total += paid;
      if (o.source !== 'Walk-in') coll += (o.collectionCharge || 0);
      if (o.payMode === 'split' && o.splitPayments) {
        cash += (o.splitPayments.cash || 0);
        upi  += (o.splitPayments.upi  || 0);
        card += (o.splitPayments.card || 0);
      } else if (o.payMode === 'cash')   { cash += paid; }
        else if (o.payMode === 'upi')    { upi  += paid; }
        else if (o.payMode === 'card')   { card += paid; }
        else if (o.payMode === 'credit') { credit += (o.netAmount || o.totalAmount || 0); }
    });
    var fmt = function(n) { return 'Rs.' + n.toLocaleString('en-IN'); };
    var d = new Date();
    var dateStr = d.toLocaleDateString('en-IN', {weekday:'short', day:'2-digit', month:'short', year:'numeric'});
    var lines = [
      'OnePLUS Ultrasound Lab - AUTO EOD Report',
      'Date: ' + dateStr,
      '',
      'Total Orders: ' + snap.size,
      'Cash: ' + fmt(cash),
      'UPI: ' + fmt(upi),
      'Card: ' + fmt(card),
      'Credit: ' + fmt(credit),
      'Collection Charges: ' + fmt(coll),
      '------------------------',
      'Total Revenue: ' + fmt(total + coll),
      '',
      'Auto-generated by oplus-lms',
      'OnePLUS Ultrasound Lab Management System'
    ];
    var text = lines.join('\n');
    var ADMIN_WA = '919312218812';
    window.open('https://wa.me/' + ADMIN_WA + '?text=' + encodeURIComponent(text), '_blank');
    toast('EOD auto-sent to Admin ✓', 'ok');
    logActivity('eod_save', 'EOD auto-sent to Admin at ' + new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}));
  }).catch(function(e) {
    console.warn('EOD auto-send failed:', e.message);
    // Clear sent flag so it retries on next login today
    localStorage.removeItem(EOD_AUTO_SENT_KEY);
  });
}
