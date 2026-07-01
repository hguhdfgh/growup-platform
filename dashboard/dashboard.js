/* dashboard.js — Main App Logic */
(function(){'use strict';

// ── State ──
var A={user:null,session:null,settings:null,orders:[],customers:[],products:[],reviews:[],faqs:[],tickets:[],notifications:[],coupons:[],activities:[],currentPage:'',currentOrderId:null,currentCustomerId:null,currentTicketId:null,pendingConfirm:null,statsTimer:null};
var activeSubscriptions = []

function trackSubscription(sub) {
  if (sub) activeSubscriptions.push(sub)
}

function unsubscribeAll() {
  activeSubscriptions.forEach(function(sub) {
    try { supabase.removeChannel(sub) } catch(e) {}
  })
  activeSubscriptions = []
}

var currentOrdersPage=1;
var currentCustomersPage=1;
var currentReviewsPage=1;
var currentTicketsPage=1;
var currentActivityPage=1;
var analyticsCharts={};

// ── DOM refs ──
var $=function(id){return document.getElementById(id)};
var q=function(s){return document.querySelector(s)};
var qa=function(s){return document.querySelectorAll(s)};

// ── Error Capture ──
var _errs=[];
function _capErr(msg,url,line,col,err){
  var e=err||{message:msg,stack:url+':'+line+':'+col};
  _errs.push(e);
  if(_errs.length>20)_errs.shift();
  showToast(msg||e.message||'خطأ','error');
  var eb=$('error-badge');
  if(eb){eb.style.display='flex';eb.style.alignItems='center';eb.style.justifyContent='center';$('error-badge-count').textContent=_errs.length}
}
window.onerror=function(msg,url,line,col,err){_capErr(msg,url,line,col,err);return true};
window.addEventListener('unhandledrejection',function(e){_capErr(e.reason?.message||'Promise rejected','','','',e.reason)});

// ── Init ──
async function init(){
  var hash=location.hash.replace('#','')||'dashboard';
  bindGlobalEvents();
  var ses=await getSession();
  if(ses.data){
    var u=await getCurrentUser();
    if(u.data){
      A.user=u.data;
      A.session=ses.data;
      A.session.user=u.data;
      showApp();
      loadSettings();
      navigateTo('page-'+hash);
      setupRealtime();
      loadDarkModePreference();
      setupGlobalSearch();
      setupKeyboardShortcuts();
    }else{
      await signOut();
      showLogin();
    }
  }else{
    showLogin();
  }
  bindNavEvents();
  bindLoginForm();
}

// Session expiry warning
function showNotification(msg, type) {
  showToast(msg, type || 'warning')
}
function checkSessionExpiry() {
  supabase.auth.getSession().then(({ data }) => {
    if (data?.session?.expires_at) {
      const expiresAt = data.session.expires_at * 1000
      const timeLeft = expiresAt - Date.now()
      if (timeLeft > 0 && timeLeft < 300000) {
        showNotification('Your session will expire in ' + Math.ceil(timeLeft/60000) + ' minutes', 'warning')
      }
    }
  })
}
setInterval(checkSessionExpiry, 60000)

function showLogin(){
  $('page-login').classList.add('active');
  $('app-layout').style.display='none';
  A.user=null;
  A.session=null;
}

function showApp(){
  $('page-login').classList.remove('active');
  $('app-layout').style.display='flex';
  if(A.user){
    var name=A.user?.user_metadata?.full_name||A.user?.email||'Admin';
    if($('sidebar-user-name'))$('sidebar-user-name').textContent=name;
    if($('sidebar-user-email'))$('sidebar-user-email').textContent=A.user.email||'';
    if($('header-user-name'))$('header-user-name').textContent=name;
  }
}

// ── Login ──
function bindLoginForm(){
  var form=$('login-form');
  if(!form)return;
  form.addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=$('login-btn'),txt=$('login-btn-text'),loader=$('login-btn-loader'),err=$('login-error');
    btn.disabled=true;txt.style.display='none';if(loader)loader.style.display='inline-block';if(err)err.style.display='none';
    var email=$('login-email').value,password=$('login-password').value;
    var r=await signIn(email,password);
    btn.disabled=false;txt.style.display='inline';if(loader)loader.style.display='none';
    if(r.error){
      if(err){err.textContent=r.error.message||'البريد الإلكتروني أو كلمة المرور غير صحيحة';err.style.display='block'}
    }else{
      A.session=r.data.session;A.user=r.data.user;
      showApp();loadSettings();navigateTo('page-dashboard');setupRealtime();
    }
  });
}

// ── Navigation ──
function navigateTo(pageId,params){
  if(!pageId)return;
  A.currentPage=pageId;
  qa('.page').forEach(function(p){p.classList.remove('active')});
  var page=$(pageId);
  if(page){page.classList.add('active')}
  qa('.nav-item').forEach(function(n){n.classList.remove('active')});
  var nav=q('.nav-item[data-page="'+pageId+'"]');
  if(nav)nav.classList.add('active');
  if(pageId==='page-login')return;
  if(pageId==='page-order-detail'&&params){loadOrderDetail(params)}
  else if(pageId==='page-customer-detail'&&params){loadCustomerDetail(params)}
  else if(pageId==='page-ticket-detail'&&params){loadTicketDetail(params)}
  else if(pageId==='page-dashboard'){loadDashboard()}
  else if(pageId==='page-orders'){currentOrdersPage=1;loadOrders()}
  else if(pageId==='page-customers'){loadCustomers()}
  else if(pageId==='page-products'){loadProducts()}
  else if(pageId==='page-reviews'){loadReviews()}
  else if(pageId==='page-faq'){loadFaq()}
  else if(pageId==='page-tickets'){loadTickets()}
  else if(pageId==='page-notifications'){loadNotifications()}
  else if(pageId==='page-settings'){loadSettings()}
  else if(pageId==='page-analytics'){loadAnalytics()}
  else if(pageId==='page-coupons'){loadCoupons()}
  else if(pageId==='page-content'){loadContent()}
  else if(pageId==='page-activity'){loadActivity()}
  else if(pageId==='page-media'){loadMedia()}
  else if(pageId==='page-profile'){loadProfile()}
  closeDropdown();
}

function bindNavEvents(){
  document.addEventListener('click',function(e){
    var target=e.target.closest('[data-page]');
    if(target){
      var page=target.getAttribute('data-page');
      if(page==='page-login')return;
      if(page==='page-notifications'){loadNotifications()}
      navigateTo(page);
      if(window.innerWidth<768){$('sidebar').classList.remove('open');var _ov=$('sidebar-overlay');if(_ov)_ov.classList.remove('open')}
    }
  });
}

// ── Sidebar ──
function toggleSidebar(){
  $('sidebar').classList.toggle('open');
  var ov=$('sidebar-overlay');
  if(ov)ov.classList.toggle('open');
}

// ── Dropdown ──
function toggleDropdown(){
  var m=$('dropdown-menu');
  if(m)m.classList.toggle('open');
}
function closeDropdown(){
  var m=$('dropdown-menu');
  if(m)m.classList.remove('open');
}

// ── Modals ──
function openModal(id,data){
  var m=$(id);
  if(!m)return;
  if(data&&id==='modal-order-form'){fillOrderModal(data)}
  else if(data&&id==='modal-customer-form'){fillCustomerModal(data)}
  else if(data&&id==='modal-product-form'){fillProductModal(data)}
  else if(data&&id==='modal-faq-form'){fillFaqModal(data)}
  else if(data&&id==='modal-coupon-form'){fillCouponModal(data)}
  m.classList.add('open');
}
function closeModal(id){
  var m=$(id);
  if(m)m.classList.remove('open');
}
function closeAllModals(){
  qa('.modal-overlay.open').forEach(function(m){m.classList.remove('open')});
}

function showErrorModal(){
  if(!_errs.length){showToast('لا توجد أخطاء مسجلة','info');return}
  var html=_errs.map(function(e,i){
    var m=esc(e.message||'');
    var s=esc(e.stack||'');
    return '<div style="padding:12px;margin-bottom:8px;background:var(--bg-card);border-radius:8px;border-right:3px solid var(--error);text-align:right;font-size:12px;direction:ltr;font-family:monospace">'+
      '<div style="color:var(--error);font-weight:700;margin-bottom:4px">#'+(i+1)+' '+m+'</div>'+
      '<div style="color:var(--text-tertiary);white-space:pre-wrap;word-break:break-all;line-height:1.5">'+s+'</div></div>'
  }).join('');
  var modal=document.createElement('div');
  modal.className='modal-overlay open';
  modal.style.cssText='display:flex;z-index:9999';
  modal.onclick=function(e){if(e.target===modal){modal.remove()}};
  modal.innerHTML='<div class="modal" style="max-width:700px;max-height:90vh;transform:none">'+
    '<div class="modal-header"><h3>مدير الأخطاء</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">✕</button></div>'+
    '<div class="modal-body" style="max-height:70vh;overflow-y:auto">'+html+'</div>'+
    '<div class="modal-footer"><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">إغلاق</button></div></div>';
  document.body.appendChild(modal);
}
window.showErrorModal=showErrorModal;

function showConfirm(msg,onConfirm){
  $('modal-confirm-message').textContent=msg;
  A.pendingConfirm=onConfirm;
  openModal('modal-confirm');
}

// ── Toasts ──
function showToast(msg,type){
  type=type||'info';
  var c=$('toast-container');
  if(!c)return;
  var t=document.createElement('div');
  t.className='toast toast-'+type;
  t.innerHTML='<span>'+msg+'</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>';
  c.appendChild(t);
  setTimeout(function(){if(t.parentNode)t.remove()},4000);
}

// ── Helpers ──
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function sanitizeHTML(str) {
  if (!str) return ''
  return String(str).replace(/[&<>"']/g, function(m) {
    if (m === '&') return '&amp;'
    if (m === '<') return '&lt;'
    if (m === '>') return '&gt;'
    if (m === '"') return '&quot;'
    if (m === "'") return '&#39;'
  })
}
function fmtDate(d){if(!d)return'—';try{var dt=new Date(d);return dt.toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}catch(e){return d}}
function fmtCurr(n){return Number(n||0).toLocaleString('ar-SA',{minimumFractionDigits:0,maximumFractionDigits:2})+' د.ج'}
function statusBadge(s){
  var map={pending:'badge-pending',approved:'badge-approved',active:'badge-approved',completed:'badge-approved',delivered:'badge-approved',rejected:'badge-rejected',cancelled:'badge-rejected',archived:'badge-archived',open:'badge-open',resolved:'badge-resolved'};
  var cls=map[s]||'badge-archived';
  var labels={pending:'قيد الانتظار',approved:'مقبول',active:'نشط',completed:'مكتمل',delivered:'تم التسليم',rejected:'مرفوض',cancelled:'ملغي',archived:'مؤرشف',open:'مفتوح',resolved:'تم الحل'};
  return '<span class="badge '+cls+'">'+(labels[s]||s)+'</span>';
}

function showLoader(id){var el=$(id);if(el)el.style.display='flex'}
function hideLoader(id){var el=$(id);if(el)el.style.display='none'}
function showEmpty(id){var el=$(id);if(el)el.style.display='block'}
function hideEmpty(id){var el=$(id);if(el)el.style.display='none'}

// ── Dashboard ──
async function loadDashboard(){
  showLoader('recent-orders-loader');
  if(A.statsTimer)clearInterval(A.statsTimer);
  await refreshDashboardStats();
  A.statsTimer=setInterval(refreshDashboardStats,30000);
  try{
    var recent=await getRecentOrders(5);
    hideLoader('recent-orders-loader');
    var tbody=$('recent-orders-table');
    if(!tbody)return;
    if(!recent.data||recent.data.length===0){
      showEmpty('recent-orders-empty');return
    }
    hideEmpty('recent-orders-empty');
    tbody.innerHTML=recent.data.map(function(o){
      return '<tr onclick="navigateTo(\'page-order-detail\','+o.id+')" style="cursor:pointer">'+
        '<td class="cell-primary">'+esc(o.order_number||'#---')+'</td>'+
        '<td>'+esc(o.customers?.full_name||o.customer_name||'—')+'</td>'+
        '<td>'+esc(o.products?.name||o.product_name||'—')+'</td>'+
        '<td>'+fmtCurr(o.amount)+'</td>'+
        '<td>'+statusBadge(o.status)+'</td>'+
        '<td>'+fmtDate(o.created_at)+'</td></tr>'
    }).join('');
  }catch(e){hideLoader('recent-orders-loader')}
  try{
    var top=await getTopProducts(5);
    var list=$('top-products-list');
    if(list){
      if(!top.data||top.data.length===0){list.innerHTML='<div class="empty-state"><p>لا توجد منتجات</p></div>';return}
      list.innerHTML=top.data.map(function(p,i){
        return '<div class="stat-card" style="margin-bottom:8px;padding:12px 16px">'+
          '<div style="display:flex;align-items:center;gap:12px">'+
          '<span style="background:var(--bg-glass);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px">'+(i+1)+'</span>'+
          '<div style="flex:1"><div style="font-weight:600;font-size:13px">'+esc(p.name)+'</div><div style="font-size:11px;color:var(--text-tertiary)">'+fmtCurr(p.price)+'</div></div>'+
          '<span style="font-weight:700;font-size:14px;font-family:var(--font-english)">'+ (p.order_count||p.total_orders||0) +'</span></div></div>'
      }).join('');
    }
  }catch(e){}
}

async function refreshDashboardStats(){
  try{
    var s=await getDashboardStats();
    if(s.data){
      if($('stat-total-orders'))$('stat-total-orders').textContent=s.data.orders_total||0;
      if($('stat-active-orders'))$('stat-active-orders').textContent=s.data.pending_orders||0;
      if($('stat-total-customers'))$('stat-total-customers').textContent=s.data.customers_total||0;
      if($('stat-revenue'))$('stat-revenue').textContent=fmtCurr(s.data.revenue_total||0);
    }
    var ys=await getDashboardStatsYesterday();
    if(ys.data&&s.data){
      function calcTrend(current,previous){if(!previous||previous===0)return{direction:'up',percent:current>0?100:0};var change=((current-previous)/previous)*100;return{direction:change>=0?'up':'down',percent:Math.abs(Math.round(change))}}
      var tOrders=calcTrend(s.data.orders_total||0,ys.data.orders_total||0);var el=$('trend-total-orders');if(el){el.textContent=tOrders.percent+'%';el.className='stat-trend trend-'+tOrders.direction}
      var tActive=calcTrend(s.data.pending_orders||0,ys.data.pending_orders||0);var el=$('trend-active-orders');if(el){el.textContent=tActive.percent+'%';el.className='stat-trend trend-'+tActive.direction}
      var tCust=calcTrend(s.data.customers_total||0,ys.data.customers_total||0);var el=$('trend-total-customers');if(el){el.textContent=tCust.percent+'%';el.className='stat-trend trend-'+tCust.direction}
      var tRev=calcTrend(s.data.revenue_total||0,ys.data.revenue_total||0);var el=$('trend-revenue');if(el){el.textContent=tRev.percent+'%';el.className='stat-trend trend-'+tRev.direction}
    }
  }catch(e){}
}
window.refreshDashboardStats=refreshDashboardStats;

// ── Export Orders CSV ──
async function exportOrdersCSV(){
  var r=await getOrders({});
  if(!r.data||!r.data.length){showToast('لا توجد طلبات للتصدير','error');return}
  var headers='رقم الطلب,العميل,البريد,الهاتف,المبلغ,طريقة الدفع,الحالة,التاريخ\n';
  var rows=r.data.map(function(o){
    return [
      o.order_number||'',
      o.customer_name||'',
      o.email||'',
      o.phone||'',
      o.amount||'',
      o.payment_method||'',
      o.status||'',
      o.created_at||''
    ].map(function(v){return '"'+String(v).replace(/"/g,'""')+'"'}).join(',')
  }).join('\n');
  var blob=new Blob(['\uFEFF'+headers+rows],{type:'text/csv;charset=utf-8;'});
  var link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='orders_export.csv';link.click();
  URL.revokeObjectURL(link.href);
  showToast('تم تصدير الطلبات','success');
}
window.exportOrdersCSV=exportOrdersCSV;

function goOrdersPage(p){currentOrdersPage=p;loadOrders()}
function goCustomersPage(p){currentCustomersPage=p;loadCustomers()}
function goReviewsPage(p){currentReviewsPage=p;loadReviews()}
function goTicketsPage(p){currentTicketsPage=p;loadTickets()}
function goActivityPage(p){currentActivityPage=p;loadActivity()}
window.goOrdersPage=goOrdersPage;window.goCustomersPage=goCustomersPage;window.goReviewsPage=goReviewsPage;window.goTicketsPage=goTicketsPage;window.goActivityPage=goActivityPage;

// ── Pagination ──
function renderPagination(containerId, currentPage, totalPages, pageCallbackName){
  var el=$(containerId);
  if(!el)return;
  if(totalPages<=1){el.innerHTML='';return}
  var h='';
  h+='<button class="btn btn-sm btn-ghost" onclick="'+pageCallbackName+'('+(currentPage-1)+')" '+(currentPage<=1?'disabled':'')+'>السابق</button>';
  for(var i=Math.max(1,currentPage-2);i<=Math.min(totalPages,currentPage+2);i++){
    h+='<button class="btn btn-sm '+(i===currentPage?'btn-primary':'btn-ghost')+'" onclick="'+pageCallbackName+'('+i+')">'+i+'</button>';
  }
  h+='<button class="btn btn-sm btn-ghost" onclick="'+pageCallbackName+'('+(currentPage+1)+')" '+(currentPage>=totalPages?'disabled':'')+'>التالي</button>';
  el.innerHTML=h;
}
window.renderPagination=renderPagination;

// ── Checkbox Selection & Batch Actions ──
function toggleAllOrders(checked){
  document.querySelectorAll('.order-checkbox').forEach(function(cb){cb.checked=checked});
  updateBatchBar();
}
window.toggleAllOrders=toggleAllOrders;

function updateBatchBar(){
  var checked=document.querySelectorAll('.order-checkbox:checked').length;
  var bar=$('orders-batch-bar');
  if(!bar)return;
  if(checked>0){bar.style.display='flex';bar.querySelector('.batch-count').textContent=checked+' طلب محدد'}
  else{bar.style.display='none'}
}
window.updateBatchBar=updateBatchBar;

async function batchApproveOrders(){
  var ids=Array.from(document.querySelectorAll('.order-checkbox:checked')).map(function(cb){return cb.value});
  if(!ids.length)return;
  showConfirm('هل أنت متأكد من الموافقة على '+ids.length+' طلب؟',async function(){
    for(var i=0;i<ids.length;i++){await approveOrder(ids[i])}
    showToast('تمت الموافقة على '+ids.length+' طلب','success');
    loadOrders();
  });
}
window.batchApproveOrders=batchApproveOrders;

async function batchDeleteOrders(){
  var ids=Array.from(document.querySelectorAll('.order-checkbox:checked')).map(function(cb){return cb.value});
  if(!ids.length)return;
  showConfirm('هل أنت متأكد من حذف '+ids.length+' طلب؟',async function(){
    for(var i=0;i<ids.length;i++){await deleteOrder(ids[i])}
    showToast('تم حذف '+ids.length+' طلب','success');
    loadOrders();
  });
}
window.batchDeleteOrders=batchDeleteOrders;

// ── Orders ──
async function loadOrders(){
  showLoader('orders-loader');hideEmpty('orders-empty');
  var tbody=$('orders-table');
  if(!tbody){hideLoader('orders-loader');return}
  try{
    var status=$('orders-status-filter')?.value||'';
    var search=$('orders-search')?.value||'';
    var r=await getOrders({status:status,search:search,page:currentOrdersPage,pageSize:20});
    hideLoader('orders-loader');
    if(!r.data||r.data.length===0){showEmpty('orders-empty');tbody.innerHTML='';return}
    hideEmpty('orders-empty');

    var totalCount=0;
    try{
      var countQ=supabase.from('orders').select('*',{count:'exact',head:true});
      if(status)countQ=countQ.eq('status',status);
      if(search){
        var term='%'+search+'%';
        countQ=countQ.or('order_number.ilike.'+term+',customer_name.ilike.'+term);
      }
      var countR=await countQ;
      totalCount=countR.count||0;
    }catch(e){totalCount=r.data.length}
    var totalPages=Math.ceil(totalCount/20)||1;

    var headerActions=$('page-orders')?.querySelector('.page-header>div:last-child') || $('page-orders')?.querySelector('.page-header button[data-action="create-order"]')?.parentNode;
    if(headerActions && !headerActions.querySelector('[data-action="export-orders"]')){
      var exportBtn=document.createElement('button');
      exportBtn.className='btn btn-ghost';
      exportBtn.setAttribute('data-action','export-orders');
      exportBtn.innerHTML='📥 CSV';
      exportBtn.onclick=exportOrdersCSV;
      headerActions.appendChild(exportBtn);
    }

    var table=tbody.closest('table');
    if(table){
      var theadTr=table.querySelector('thead tr');
      if(theadTr && !theadTr.querySelector('#orders-select-all')){
        var cbTh=document.createElement('th');
        cbTh.innerHTML='<input type="checkbox" id="orders-select-all" onchange="toggleAllOrders(this.checked)">';
        theadTr.insertBefore(cbTh, theadTr.firstChild);
      }
      if(theadTr){
        var headerTexts=Array.from(theadTr.querySelectorAll('th')).map(function(th){return th.textContent.trim()});
        var hasProofHeader=false;
        for(var hi=0;hi<headerTexts.length;hi++){
          if(headerTexts[hi].indexOf('إثبات')>=0||headerTexts[hi].indexOf('الدفع')>=0){hasProofHeader=true;break}
        }
        if(!hasProofHeader){
          var amountIdx=-1;
          for(var hi2=0;hi2<headerTexts.length;hi2++){
            if(headerTexts[hi2].indexOf('المبلغ')>=0){amountIdx=hi2;break}
          }
          if(amountIdx>=0){
            var proofTh=document.createElement('th');
            proofTh.textContent='إثبات الدفع';
            var refTh=theadTr.children[amountIdx+1];
            if(refTh){theadTr.insertBefore(proofTh, refTh)}
            else{theadTr.appendChild(proofTh)}
          }
        }
      }
    }

    var statusOptions=['pending','approved','rejected','delivered','archived'];
    var statusLabels={pending:'قيد الانتظار',approved:'مقبول',rejected:'مرفوض',delivered:'تم التسليم',archived:'مؤرشف'};

    tbody.innerHTML=r.data.map(function(o){
      var paymentProof=o.payment_proof_url
        ? '<img src="'+sanitizeHTML(o.payment_proof_url)+'" style="width:40px;height:40px;object-fit:cover;cursor:pointer" onclick="event.stopPropagation();window.open(\''+sanitizeHTML(o.payment_proof_url)+'\',\'_blank\')">'
        : '—';
      var dd='<select class="form-control form-control-sm" style="width:120px;display:inline-block" onchange="event.stopPropagation();if(confirm(\'هل أنت متأكد من تغيير الحالة؟\'))updateOrder(\''+o.id+'\',{status:this.value}).then(function(){loadOrders()})">'+
        statusOptions.map(function(s){return '<option value="'+s+'"'+(o.status===s?' selected':'')+'>'+(statusLabels[s]||s)+'</option>'}).join('')+
        '</select>';
      return '<tr onclick="navigateTo(\'page-order-detail\','+o.id+')" style="cursor:pointer">'+
        '<td><input type="checkbox" class="order-checkbox" value="'+o.id+'" onclick="event.stopPropagation();updateBatchBar()"></td>'+
        '<td class="cell-primary">'+sanitizeHTML(o.order_number||'#---')+'</td>'+
        '<td>'+sanitizeHTML(o.customers?.full_name||o.customer_name||'—')+'</td>'+
        '<td>'+sanitizeHTML(o.products?.name||o.product_name||'—')+'</td>'+
        '<td class="font-english">'+fmtCurr(o.amount)+'</td>'+
        '<td>'+paymentProof+'</td>'+
        '<td>'+statusBadge(o.status)+'</td>'+
        '<td>'+fmtDate(o.created_at)+'</td>'+
        '<td><div class="cell-action">'+
          dd+
          '<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();navigateTo(\'page-order-detail\','+o.id+')">عرض</button>'+
          (o.status==='pending'?'<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();approveOrderAction(\''+o.id+'\')">موافقة</button><button class="btn btn-sm btn-danger" onclick="event.stopPropagation();rejectOrderAction(\''+o.id+'\')">رفض</button>':'')+
        '</div></td></tr>'
    }).join('');

    var existingBatchBar=$('orders-batch-bar');
    if(!existingBatchBar){
      var batchDiv=document.createElement('div');
      batchDiv.id='orders-batch-bar';
      batchDiv.className='batch-bar';
      batchDiv.style.cssText='display:none;align-items:center;gap:12px;padding:12px;background:var(--bg-card);border-radius:8px;margin-bottom:12px';
      batchDiv.innerHTML='<span class="batch-count" style="font-weight:600">0 طلب محدد</span>'+
        '<button class="btn btn-sm btn-primary" onclick="batchApproveOrders()">موافقة</button>'+
        '<button class="btn btn-sm btn-danger" onclick="batchDeleteOrders()">حذف</button>'+
        '<button class="btn btn-sm btn-ghost" onclick="toggleAllOrders(false)">إلغاء التحديد</button>';
      var tableWrapper=table?.parentElement;
      if(tableWrapper){tableWrapper.parentElement.insertBefore(batchDiv, tableWrapper)}
    }

    var existingPagination=$('orders-pagination');
    if(!existingPagination){
      var paginationDiv=document.createElement('div');
      paginationDiv.id='orders-pagination';
      paginationDiv.className='pagination';
      var tableWrapper2=table?.parentElement;
      if(tableWrapper2){
        var afterTable=tableWrapper2.nextSibling;
        if(afterTable){tableWrapper2.parentElement.insertBefore(paginationDiv, afterTable)}
        else{tableWrapper2.parentElement.appendChild(paginationDiv)}
      }
    }

    renderPagination('orders-pagination',currentOrdersPage,totalPages,'goOrdersPage');

  }catch(e){hideLoader('orders-loader')}
}

async function loadOrderDetail(id){
  A.currentOrderId=id;
  try{
    var r=await getOrder(id);
    if(!r.data)return;
    var o=r.data;
    if($('order-detail-number'))$('order-detail-number').textContent='طلب #'+(o.order_number||'---');
    if($('order-detail-status'))$('order-detail-status').innerHTML=statusBadge(o.status);
    if($('order-detail-customer'))$('order-detail-customer').textContent=o.customers?.full_name||o.customer_name||'—';
    if($('order-detail-product'))$('order-detail-product').textContent=o.products?.name||o.product_name||'—';
    if($('order-detail-amount'))$('order-detail-amount').textContent=fmtCurr(o.amount);
    if($('order-detail-quantity'))$('order-detail-quantity').textContent=o.quantity||1;
    if($('order-detail-created'))$('order-detail-created').textContent=fmtDate(o.created_at);
    if($('order-detail-updated'))$('order-detail-updated').textContent=fmtDate(o.updated_at);
    if($('order-detail-notes'))$('order-detail-notes').textContent=o.notes||'لا توجد ملاحظات';
    if($('order-detail-payment-method'))$('order-detail-payment-method').textContent=o.payment_method||'—';
    if($('order-detail-payment-proof')){
      if(o.payment_proof_url){
        $('order-detail-payment-proof').innerHTML='<a href="'+esc(o.payment_proof_url)+'" target="_blank" rel="noopener"><img src="'+esc(o.payment_proof_url)+'" style="max-width:200px;max-height:200px;border-radius:8px;cursor:pointer"></a>';
      }else{
        $('order-detail-payment-proof').textContent='—';
      }
    }
    var approveBtn=$('order-detail-actions')?.querySelector('[data-action="approve-order"]');
    var rejectBtn=$('order-detail-actions')?.querySelector('[data-action="reject-order"]');
    if(approveBtn&&rejectBtn){
      if(o.status==='pending'){approveBtn.style.display='inline-flex';rejectBtn.style.display='inline-flex'}
      else{approveBtn.style.display='none';rejectBtn.style.display='none'}
    }
    var tl=$('order-timeline');
    if(tl){
      var tlData=await getOrderTimeline(id);
      if(tlData.data&&tlData.data.length){
        tl.innerHTML=tlData.data.map(function(t){
          return '<div class="timeline-item"><div class="time">'+fmtDate(t.created_at)+'</div><div class="title">'+
            ({created:'تم الإنشاء',updated:'تم التحديث',approved:'تمت الموافقة',rejected:'مرفوض'}[t.action]||t.action)+
            '</div><div class="desc">'+esc(t.description||'')+'</div></div>'
        }).join('');
      }else{tl.innerHTML='<p style="color:var(--text-tertiary);font-size:13px">لا يوجد سجل</p>'}
    }
  }catch(e){}
}

async function approveOrderAction(id){
  showConfirm('هل أنت متأكد من الموافقة على هذا الطلب؟',async function(){
    var r=await approveOrder(id,A.user?.id);
    if(!r.error){showToast('تمت الموافقة على الطلب','success');loadOrderDetail(id);loadOrders()}
    else{showToast('حدث خطأ','error')}
  })
}
window.approveOrderAction=approveOrderAction;

async function rejectOrderAction(id){
  showConfirm('هل أنت متأكد من رفض هذا الطلب؟',async function(){
    var r=await rejectOrder(id,'تم الرفض من قبل المشرف',A.user?.id);
    if(!r.error){showToast('تم رفض الطلب','success');loadOrderDetail(id);loadOrders()}
    else{showToast('حدث خطأ','error')}
  })
}
window.rejectOrderAction=rejectOrderAction;

function bindOrderFilters(){
  var statusFilter=$('orders-status-filter');
  var searchInput=$('orders-search');
  if(statusFilter)statusFilter.addEventListener('change',function(){currentOrdersPage=1;loadOrders()});
  if(searchInput){
    var timer;
    searchInput.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(function(){currentOrdersPage=1;loadOrders()},400)})
  }
}

// ── Customers ──
async function loadCustomers(){
  showLoader('customers-loader');hideEmpty('customers-empty');
  var tbody=$('customers-table');
  if(!tbody){hideLoader('customers-loader');return}
  try{
    var search=$('customers-search')?.value||'';
    var statusFilter=$('customers-status-filter')?.value||'';

    var filterContainer=$('customers-search')?.parentElement;
    if(filterContainer && !$('customers-status-filter')){
      var statusSel=document.createElement('select');
      statusSel.id='customers-status-filter';
      statusSel.className='form-control form-control-sm';
      statusSel.style.cssText='width:130px;display:inline-block;margin-right:8px';
      statusSel.innerHTML='<option value="">كل الحالات</option><option value="lead">عميل محتمل</option><option value="active">نشط</option><option value="blocked">محظور</option>';
      statusSel.addEventListener('change',function(){loadCustomers()});
      filterContainer.appendChild(statusSel);
    }

    var r=await getCustomers({search:search,status:statusFilter||undefined});
    hideLoader('customers-loader');
    if(!r.data||r.data.length===0){showEmpty('customers-empty');tbody.innerHTML='';return}
    hideEmpty('customers-empty');

    var table=tbody.closest('table');
    if(table){
      var theadTr=table.querySelector('thead tr');
      if(theadTr){
        var hasActions=false;
        Array.from(theadTr.querySelectorAll('th')).forEach(function(th){
          if(th.textContent.trim().indexOf('الإجراءات')>=0)hasActions=true;
        });
        if(!hasActions){
          var actionsTh=document.createElement('th');
          actionsTh.textContent='الإجراءات';
          theadTr.appendChild(actionsTh);
        }
        var hasSource=false;
        Array.from(theadTr.querySelectorAll('th')).forEach(function(th){
          if(th.textContent.trim()==='المصدر')hasSource=true;
        });
        if(!hasSource){
          var items=Array.from(theadTr.querySelectorAll('th'));
          var ordersIdx=-1;
          for(var i=0;i<items.length;i++){
            if(items[i].textContent.trim()==='الطلبات'||items[i].textContent.trim().indexOf('الطلبات')>=0){ordersIdx=i;break}
          }
          if(ordersIdx>=0){
            var sourceTh=document.createElement('th');
            sourceTh.textContent='المصدر';
            theadTr.insertBefore(sourceTh, items[ordersIdx]);
            var tagsTh=document.createElement('th');
            tagsTh.textContent='الوسوم';
            theadTr.insertBefore(tagsTh, items[ordersIdx]);
          }
        }
      }
    }

    tbody.innerHTML=r.data.map(function(c){
      var sourceLabels={direct:'مباشر',tiktok:'تيك توك',facebook:'فيسبوك',referral:'إحالة'};
      var sourceDisplay=sanitizeHTML(sourceLabels[c.source]||c.source||'—');
      var tagsDisplay=c.tags?sanitizeHTML(c.tags):'—';
      return '<tr onclick="navigateTo(\'page-customer-detail\','+c.id+')" style="cursor:pointer">'+
        '<td class="cell-primary">'+sanitizeHTML(c.full_name)+'</td>'+
        '<td>'+sanitizeHTML(c.email||'—')+'</td>'+
        '<td dir="ltr" class="text-right">'+sanitizeHTML(c.phone||'—')+'</td>'+
        '<td>'+sourceDisplay+'</td>'+
        '<td>'+tagsDisplay+'</td>'+
        '<td class="font-english">'+(c.total_orders||0)+'</td>'+
        '<td class="font-english">'+fmtCurr(c.total_spent||0)+'</td>'+
        '<td>'+fmtDate(c.created_at)+'</td>'+
        '<td><div class="cell-action">'+
          '<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openModal(\'modal-customer-form\','+sanitizeHTML(JSON.stringify(c))+'")>تعديل</button>'+
          '<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();deleteCustomerAction(\''+c.id+'\')">حذف</button>'+
        '</div></td></tr>'
    }).join('');
  }catch(e){hideLoader('customers-loader')}
}

async function deleteCustomerAction(id){
  showConfirm('هل أنت متأكد من حذف هذا العميل؟',async function(){
    var r=await supabase.from('customers').delete().eq('id',id);
    if(!r.error){showToast('تم حذف العميل','success');loadCustomers()}
    else{showToast('حدث خطأ','error')}
  })
}
window.deleteCustomerAction=deleteCustomerAction;

function bindCustomerSearch(){
  var el=$('customers-search');
  if(!el)return;
  var timer;
  el.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(loadCustomers,400)})
}

async function loadCustomerDetail(id){
  A.currentCustomerId=id;
  try{
    var r=await getCustomer(id);
    if(!r.data)return;
    var c=r.data;
    if($('customer-detail-name'))$('customer-detail-name').textContent=c.full_name;
    if($('customer-detail-fullname'))$('customer-detail-fullname').textContent=c.full_name;
    if($('customer-detail-email'))$('customer-detail-email').textContent=c.email||'—';
    if($('customer-detail-phone'))$('customer-detail-phone').textContent=c.phone||'—';
    if($('customer-detail-source'))$('customer-detail-source').textContent=c.source||'—';
    if($('customer-detail-tags')){
      if(c.tags){$('customer-detail-tags').innerHTML=c.tags.split(',').map(function(t){return '<span class="badge badge-approved" style="margin:2px">'+esc(t.trim())+'</span>'}).join('')}
      else{$('customer-detail-tags').textContent='—'}
    }
    if($('customer-detail-status')){
      var statusMap={lead:'عميل محتمل',active:'نشط',blocked:'محظور'};
      $('customer-detail-status').innerHTML=statusBadge(c.status||'active');
    }
    if($('customer-detail-city'))$('customer-detail-city').textContent=c.city||'—';
    if($('customer-detail-orders-count'))$('customer-detail-orders-count').textContent=c.total_orders||0;
    if($('customer-detail-total-spent'))$('customer-detail-total-spent').textContent=fmtCurr(c.total_spent||0);
    if($('customer-detail-notes')){
      $('customer-detail-notes').innerHTML='<textarea id="customer-notes-input" class="form-control" style="width:100%;min-height:60px;margin-bottom:8px">'+esc(c.notes||'')+'</textarea>'+
        '<button class="btn btn-sm btn-primary" onclick="saveCustomerNotes()">حفظ</button>';
    }
    var otbody=$('customer-orders-table');
    if(otbody&&c.orders){
      if(c.orders.length===0){$('customer-orders-empty').style.display='block';otbody.innerHTML=''}
      else{$('customer-orders-empty').style.display='none';
        otbody.innerHTML=c.orders.map(function(o){
          return '<tr><td class="cell-primary">'+esc(o.order_number||'#---')+'</td><td>'+esc(o.products?.name||'—')+'</td><td>'+fmtCurr(o.amount)+'</td><td>'+statusBadge(o.status)+'</td><td>'+fmtDate(o.created_at)+'</td></tr>'
        }).join('')
      }
    }
  }catch(e){}
}

async function saveCustomerNotes(){
  var notes=$('customer-notes-input')?.value;
  if(!notes||!A.currentCustomerId)return;
  await updateCustomer(A.currentCustomerId,{notes:notes});
  showToast('تم حفظ الملاحظات','success');
}
window.saveCustomerNotes=saveCustomerNotes;

// ── Products ──
async function loadProducts(){
  showLoader('products-loader');hideEmpty('products-empty');
  var tbody=$('products-table');
  if(!tbody){hideLoader('products-loader');return}
  try{
    var r=await getProducts(true);
    hideLoader('products-loader');
    if(!r.data||r.data.length===0){showEmpty('products-empty');tbody.innerHTML='';return}
    tbody.innerHTML=r.data.map(function(p){
      var imgSrc=p.images&&p.images[0]?sanitizeHTML(p.images[0]):'';
      return '<tr>'+
        '<td class="cell-primary">'+(imgSrc?'<img src="'+imgSrc+'" style="width:32px;height:32px;border-radius:4px;object-fit:cover;margin-left:8px">':'')+sanitizeHTML(p.name)+'</td>'+
        '<td class="font-english">'+fmtCurr(p.price)+'</td>'+
        '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sanitizeHTML(p.description||'—')+'</td>'+
        '<td>'+(p.is_active?'<span class="badge badge-approved">نشط</span>':'<span class="badge badge-archived">غير نشط</span>')+'</td>'+
        '<td class="font-english">'+(p.sort_order||0)+'</td>'+
        '<td><div class="cell-action">'+
          '<button class="btn btn-sm btn-ghost" onclick="reorderProductAction(\''+p.id+'\','+(p.sort_order-1)+')">↑</button>'+
          '<button class="btn btn-sm btn-ghost" onclick="reorderProductAction(\''+p.id+'\','+(p.sort_order+1)+')">↓</button>'+
          '<button class="btn btn-sm btn-ghost" onclick="openModal(\'modal-product-form\','+sanitizeHTML(JSON.stringify(p))+'")>تعديل</button>'+
          '<button class="btn btn-sm btn-ghost" onclick="deleteProductAction(\''+p.id+'\')">حذف</button>'+
        '</div></td></tr>'
    }).join('');
  }catch(e){hideLoader('products-loader')}
}

async function deleteProductAction(id){
  showConfirm('هل أنت متأكد من حذف هذا المنتج؟',async function(){
    var r=await deleteProduct(id);
    if(!r.error){showToast('تم حذف المنتج','success');loadProducts()}
    else{showToast('حدث خطأ','error')}
  })
}
window.deleteProductAction=deleteProductAction;

async function reorderProductAction(id,newOrder){
  var r=await updateProduct(id,{sort_order:Math.max(0,newOrder)});
  if(!r.error){showToast('تم تحديث الترتيب','success');loadProducts()}
}
window.reorderProductAction=reorderProductAction;

// ── Reviews ──
async function loadReviews(){
  showLoader('reviews-loader');hideEmpty('reviews-empty');
  var tbody=$('reviews-table');
  if(!tbody){hideLoader('reviews-loader');return}
  try{
    var statusFilter=$('reviews-status-filter')?.value||'';
    var ratingFilter=$('reviews-rating-filter')?.value||'';
    var r=await getReviews({status:statusFilter,rating:ratingFilter||undefined});
    hideLoader('reviews-loader');
    if(!r.data||r.data.length===0){showEmpty('reviews-empty');tbody.innerHTML='';return}
    hideEmpty('reviews-empty');
    tbody.innerHTML=r.data.map(function(rv){
      var rating=rv.rating||0;
      var stars='';
      for(var si=1;si<=5;si++){
        var color=rating<=2?'#e74c3c':rating===3?'#f39c12':'#2ecc71';
        stars+='<span style="color:'+color+'">'+(si<=rating?'★':'☆')+'</span>';
      }
      return '<tr>'+
        '<td><input type="checkbox" class="review-checkbox" value="'+rv.id+'" onchange="updateReviewsBatchBar()"></td>'+
        '<td>'+sanitizeHTML(rv.customer_name||'—')+'</td>'+
        '<td style="font-size:14px;letter-spacing:2px">'+rating+'.0 '+stars+'</td>'+
        '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">'+sanitizeHTML(rv.review_text||rv.comment||'—')+'</td>'+
        '<td>'+(rv.is_approved?'<span class="badge badge-approved">مقبول</span>':'<span class="badge badge-pending">قيد المراجعة</span>')+'</td>'+
        '<td>'+(rv.is_pinned?'<span style="color:var(--primary)">📌</span>':'—')+'</td>'+
        '<td>'+fmtDate(rv.created_at)+'</td>'+
        '<td><div class="cell-action">'+
          (!rv.is_approved?'<button class="btn btn-sm btn-primary" onclick="approveReviewAction(\''+rv.id+'\')">موافقة</button>':'')+
          (!rv.is_pinned?'<button class="btn btn-sm btn-ghost" onclick="pinReviewAction(\''+rv.id+'\')">تثبيت</button>':'')+
          '<button class="btn btn-sm btn-ghost" onclick="deleteReviewAction(\''+rv.id+'\')">حذف</button>'+
        '</div></td></tr>'
    }).join('');
    if(!document.getElementById('reviews-batch-bar')){
      var container=tbody.parentElement;
      var batchBar='<div class="reviews-batch-bar" id="reviews-batch-bar" style="display:none;align-items:center;gap:12px;padding:12px;background:var(--bg-card);border-radius:8px;margin-bottom:12px">'+
        '<span class="batch-count" style="font-weight:600">0 تقييم محدد</span>'+
        '<button class="btn btn-sm btn-primary" onclick="batchApproveReviews()">موافقة</button>'+
        '<button class="btn btn-sm btn-ghost" onclick="batchPinReviews()">تثبيت</button>'+
        '<button class="btn btn-sm btn-danger" onclick="batchDeleteReviews()">حذف</button>'+
        '<button class="btn btn-sm btn-ghost" onclick="toggleAllReviews(false)">إلغاء التحديد</button></div>';
      container.insertAdjacentHTML('afterend',batchBar);
    }
  }catch(e){hideLoader('reviews-loader')}
}

async function approveReviewAction(id){
  var r=await approveReview(id);
  if(!r.error){showToast('تمت الموافقة على التقييم','success');loadReviews()}
  else{showToast('حدث خطأ','error')}
}
window.approveReviewAction=approveReviewAction;

async function pinReviewAction(id){
  var r=await pinReview(id);
  if(!r.error){showToast('تم تثبيت التقييم','success');loadReviews()}
  else{showToast('حدث خطأ','error')}
}
window.pinReviewAction=pinReviewAction;

async function deleteReviewAction(id){
  showConfirm('هل أنت متأكد من حذف هذا التقييم؟',async function(){
    var r=await deleteReview(id);
    if(!r.error){showToast('تم حذف التقييم','success');loadReviews()}
    else{showToast('حدث خطأ','error')}
  })
}
window.deleteReviewAction=deleteReviewAction;

function toggleAllReviews(checked){
  document.querySelectorAll('.review-checkbox').forEach(function(cb){cb.checked=checked});
  updateReviewsBatchBar();
}
function updateReviewsBatchBar(){
  var checked=document.querySelectorAll('.review-checkbox:checked').length;
  var bar=$('reviews-batch-bar');
  if(!bar)return;
  if(checked>0){bar.style.display='flex';bar.querySelector('.batch-count').textContent=checked+' تقييم محدد'}
  else{bar.style.display='none'}
}
async function batchApproveReviews(){
  var ids=Array.from(document.querySelectorAll('.review-checkbox:checked')).map(function(cb){return cb.value});
  if(!ids.length)return;
  showConfirm('هل أنت متأكد؟',async function(){
    for(var i=0;i<ids.length;i++){await approveReview(ids[i])}
    showToast('تمت الموافقة على '+ids.length+' تقييم','success');loadReviews()
  });
}
async function batchPinReviews(){
  var ids=Array.from(document.querySelectorAll('.review-checkbox:checked')).map(function(cb){return cb.value});
  if(!ids.length)return;
  for(var i=0;i<ids.length;i++){await pinReview(ids[i])}
  showToast('تم تثبيت '+ids.length+' تقييم','success');loadReviews()
}
async function batchDeleteReviews(){
  var ids=Array.from(document.querySelectorAll('.review-checkbox:checked')).map(function(cb){return cb.value});
  if(!ids.length)return;
  showConfirm('هل أنت متأكد من حذف '+ids.length+' تقييم؟',async function(){
    for(var i=0;i<ids.length;i++){await deleteReview(ids[i])}
    showToast('تم حذف '+ids.length+' تقييم','success');loadReviews()
  });
}
window.toggleAllReviews=toggleAllReviews;
window.updateReviewsBatchBar=updateReviewsBatchBar;
window.batchApproveReviews=batchApproveReviews;
window.batchPinReviews=batchPinReviews;
window.batchDeleteReviews=batchDeleteReviews;

// ── FAQ ──
async function loadFaq(){
  showLoader('faq-loader');hideEmpty('faq-empty');
  var list=$('faq-list');
  if(!list){hideLoader('faq-loader');return}
  try{
    var catFilter=$('faq-category-filter')?.value||'';
    var r=await getFaqs(false,catFilter||undefined);
    hideLoader('faq-loader');
    if(!r.data||r.data.length===0){showEmpty('faq-empty');list.innerHTML='';return}
    hideEmpty('faq-empty');
    list.innerHTML=r.data.map(function(f,i){
      return '<div class="card" style="margin-bottom:8px" draggable="true" data-faq-id="'+f.id+'" ondragstart="faqDragStart(event,\''+f.id+'\')" ondragover="faqDragOver(event)" ondrop="faqDrop(event,\''+f.id+'\')" ondragend="faqDragEnd(event)">'+
        '<div class="card-header" style="cursor:pointer" onclick="this.nextElementSibling.classList.toggle(\'open\')">'+
          '<h3 style="font-size:14px;font-weight:600">'+(i+1)+'. '+esc(f.question)+'</h3>'+
          '<div style="display:flex;gap:4px">'+
            '<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openModal(\'modal-faq-form\','+JSON.stringify(f).replace(/"/g,"'")+')">تعديل</button>'+
            '<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();deleteFaqAction(\''+f.id+'\')">حذف</button>'+
          '</div></div>'+
        '<div class="card-body" style="display:none">'+esc(f.answer)+
        '<div style="margin-top:8px;font-size:11px;color:var(--text-tertiary)">الترتيب: '+(f.sort_order||0)+'</div></div></div>'
    }).join('');
  }catch(e){hideLoader('faq-loader')}
}

async function deleteFaqAction(id){
  showConfirm('هل أنت متأكد من حذف هذا السؤال؟',async function(){
    var r=await deleteFaq(id);
    if(!r.error){showToast('تم حذف السؤال','success');loadFaq()}
    else{showToast('حدث خطأ','error')}
  })
}
window.deleteFaqAction=deleteFaqAction;

var faqDragSourceId=null;
function faqDragStart(ev,id){
  faqDragSourceId=id;
  ev.target.style.opacity='0.5';
  ev.dataTransfer.effectAllowed='move';
}
function faqDragOver(ev){
  ev.preventDefault();
  ev.dataTransfer.dropEffect='move';
}
function faqDrop(ev,targetId){
  ev.preventDefault();
  if(faqDragSourceId&&targetId!==faqDragSourceId){
    var items=Array.from(document.querySelectorAll('#faq-list .card'));
    var ids=items.map(function(el){return el.dataset.faqId});
    reorderFaq(ids).then(function(r){
      if(!r.error){showToast('تم إعادة الترتيب','success')}
    });
  }
  faqDragEnd(ev);
}
function faqDragEnd(ev){
  ev.target.style.opacity='1';
  faqDragSourceId=null;
}
window.faqDragStart=faqDragStart;
window.faqDragOver=faqDragOver;
window.faqDrop=faqDrop;
window.faqDragEnd=faqDragEnd;

// ── Tickets ──
async function loadTickets(){
  showLoader('tickets-loader');hideEmpty('tickets-empty');
  var tbody=$('tickets-table');
  if(!tbody){hideLoader('tickets-loader');return}
  try{
    var r=await getTickets();
    hideLoader('tickets-loader');
    if(!r.data||r.data.length===0){showEmpty('tickets-empty');tbody.innerHTML='';return}
    var prioColors={high:'#e74c3c',medium:'#f39c12',low:'#2ecc71',urgent:'#e74c3c'};
    var prioMap={high:'عالية',medium:'متوسطة',low:'منخفضة'};
    tbody.innerHTML=r.data.map(function(t){
      return '<tr onclick="navigateTo(\'page-ticket-detail\','+t.id+')" style="cursor:pointer">'+
        '<td class="cell-primary">'+sanitizeHTML(t.subject)+'</td>'+
        '<td>'+sanitizeHTML(t.customers?.full_name||t.customer_name||'—')+'</td>'+
        '<td>'+statusBadge(t.status)+'</td>'+
        '<td><span style="color:'+(prioColors[t.priority]||'#888')+'">'+sanitizeHTML(prioMap[t.priority]||t.priority||'—')+'</span></td>'+
        '<td>'+sanitizeHTML(t.assigned_to||'—')+'</td>'+
        '<td>'+fmtDate(t.created_at)+'</td></tr>'
    }).join('');
  }catch(e){hideLoader('tickets-loader')}
}

async function loadTicketDetail(id){
  A.currentTicketId=id;
  try{
    var r=await getTicket(id);
    if(!r.data)return;
    var t=r.data;
    if($('ticket-detail-subject'))$('ticket-detail-subject').textContent=t.subject;
    if($('ticket-detail-status'))$('ticket-detail-status').innerHTML=statusBadge(t.status);
    if($('ticket-detail-priority'))$('ticket-detail-priority').textContent=({high:'عالية',medium:'متوسطة',low:'منخفضة'}[t.priority]||t.priority||'—');
    if($('ticket-detail-customer'))$('ticket-detail-customer').textContent=t.customers?.full_name||t.customer_name||'—';
    if($('ticket-detail-assignee'))$('ticket-detail-assignee').textContent=t.assigned_to||'غير معين';
    if($('ticket-detail-date'))$('ticket-detail-date').textContent=fmtDate(t.created_at);
    if($('ticket-detail-description'))$('ticket-detail-description').textContent=t.description||'لا يوجد وصف';
    var as=$('ticket-assignee-select');
    if(as){
      var assignRow=$('ticket-assignee-row');
      if(assignRow)assignRow.style.display='';
      getProfiles().then(function(r){
        if(r.data){
          as.innerHTML='<option value="">غير معين</option>'+r.data.map(function(p){return '<option value="'+p.id+'"'+(t.assigned_to===p.id?'selected':'')+'>'+esc(p.full_name||p.email)+'</option>'}).join('');
        }
      });
    }
    var rc=$('ticket-replies-container');
    if(rc&&t.replies){
      if(t.replies.length){
        rc.innerHTML=t.replies.map(function(rp){
          return '<div style="padding:12px;border-bottom:1px solid var(--border-glass);font-size:13px">'+
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'+
            '<strong>'+esc(rp.sender_name)+'</strong><span style="color:var(--text-tertiary);font-size:11px">'+fmtDate(rp.created_at)+'</span></div>'+
            '<p style="color:var(--text-secondary)">'+esc(rp.message)+'</p></div>'
        }).join('');
      }else{rc.innerHTML='<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:20px">لا توجد ردود</p>'}
    }
  }catch(e){}
}

async function assignTicketAction(){
  var ticketId=A.currentTicketId;
  var assigneeId=$('ticket-assignee-select')?.value;
  if(!ticketId)return;
  var r=await updateTicket(ticketId,{assigned_to:assigneeId||null});
  if(!r.error){showToast('تم تعيين المشرف','success');loadTicketDetail(ticketId)}
  else{showToast('حدث خطأ','error')}
}

// ── Notifications ──
async function loadNotifications(){
  showLoader('notifications-loader');hideEmpty('notifications-empty');
  var list=$('notifications-list');
  if(!list){hideLoader('notifications-loader');return}
  try{
    var typeFilter=$('notifications-type-filter')?.value||'';
    var readFilter=$('notifications-read-filter')?.value||'';
    var r=await getNotifications({type:typeFilter||undefined,read:readFilter||undefined});
    hideLoader('notifications-loader');
    if(!r.data||r.data.length===0){showEmpty('notifications-empty');list.innerHTML='';return}
    var typeStyles={
      new_order:{icon:'🆕',bg:'rgba(254,44,85,0.15)'},
      new_customer:{icon:'👤',bg:'rgba(52,152,219,0.15)'},
      payment_uploaded:{icon:'💳',bg:'rgba(46,204,113,0.15)'},
      support:{icon:'🎫',bg:'rgba(243,156,18,0.15)'},
      order_approved:{icon:'✅',bg:'rgba(46,204,113,0.15)'},
      order_rejected:{icon:'❌',bg:'rgba(231,76,60,0.15)'}
    };
    list.innerHTML=r.data.map(function(n){
      var style=typeStyles[n.type]||{icon:'ℹ️',bg:'rgba(255,255,255,0.05)'};
      return '<div class="notif-item'+(n.is_read?'':' unread')+'" onclick="markNotifRead(\''+n.id+'\')">'+
        '<div class="notif-icon" style="background:'+style.bg+'">'+
          '<span style="font-size:16px">'+style.icon+'</span></div>'+
        '<div class="notif-content"><div class="notif-title">'+sanitizeHTML(n.title)+'</div>'+
        '<div class="notif-body">'+sanitizeHTML(n.body)+'</div><div class="notif-time">'+fmtDate(n.created_at)+'</div></div></div>'
    }).join('');
    var unread=r.data.filter(function(n){return !n.is_read}).length;
    var badge=$('notif-badge-sidebar');
    if(badge)badge.textContent=unread;
    var dot=$('notif-dot-header');
    if(dot)dot.style.display=unread?'block':'none';
  }catch(e){hideLoader('notifications-loader')}
}

async function markNotifRead(id){
  await markNotificationRead(id);
  loadNotifications();
}
window.markNotifRead=markNotifRead;

async function markAllRead(){
  var r=await markAllNotificationsRead(A.user?.id);
  if(!r.error){showToast('تم تحديد الكل كمقروء','success');loadNotifications()}
}

// ── Settings ──
async function loadSettings(){
  try{
    var r=await getSettings();
    if(r.data){
      A.settings=r.data;
      var s=r.data;
      if($('settings-site-name'))$('settings-site-name').textContent=s.company_name||'TikTok Agency';
      if($('settings-site-desc'))$('settings-site-desc').textContent=s.address||'—';
      if($('settings-company-name'))$('settings-company-name').value=s.company_name||'';
      if($('settings-phone'))$('settings-phone').value=s.phone||'';
      if($('settings-whatsapp'))$('settings-whatsapp').value=s.whatsapp||'';
      if($('settings-email'))$('settings-email').value=s.email||'';
      if($('settings-address'))$('settings-address').value=s.address||'';
      var pa=s.payment_accounts||{};
      if($('settings-baridimob-label'))$('settings-baridimob-label').value=pa.baridimob?.label||'';
      if($('settings-baridimob-number'))$('settings-baridimob-number').value=pa.baridimob?.number||'';
      if($('settings-ccp-label'))$('settings-ccp-label').value=pa.ccp?.label||'';
      if($('settings-ccp-rib'))$('settings-ccp-rib').value=pa.ccp?.rib||'';
      if($('settings-bank-label'))$('settings-bank-label').value=pa.bank?.label||'';
      if($('settings-bank-account'))$('settings-bank-account').value=pa.bank?.account||'';
    }
  }catch(e){}
}

// ── Analytics ──
async function loadAnalytics(){
  showLoader('analytics-loader');
  try{
    var today=new Date().toISOString().slice(0,10);
    var s=await getDashboardStats();
    var eventsRes=await supabase.from('analytics_events').select('event_type,created_at').gte('created_at',today);
    var pageViews=0,visitors=0,conversions=0;
    if(eventsRes.data){
      var seen=new Set();
      eventsRes.data.forEach(function(e){
        if(e.event_type==='page_view'){pageViews++;if(e.session_id)seen.add(e.session_id)}
        if(e.event_type==='order_submitted'||e.event_type==='order_created')conversions++;
      });
      visitors=seen.size;
    }
    if($('analytics-visitors'))$('analytics-visitors').textContent=visitors||0;
    if($('analytics-pageviews'))$('analytics-pageviews').textContent=pageViews||0;
    if($('analytics-conversions'))$('analytics-conversions').textContent=conversions||0;
    var bounceRate = pageViews > 0 ? Math.round((1 - conversions / Math.max(pageViews,1)) * 100) : 0;
    if($('analytics-bounce-rate'))$('analytics-bounce-rate').textContent=bounceRate+'%';

    var from=$('analytics-date-from')?.value;
    var to=$('analytics-date-to')?.value;

    var salesR=await getSalesTrend(from,to);
    if(salesR.data&&salesR.data.length&&window.Chart){
      renderSalesChart(salesR.data);
    }

    var distR=await getOrderStatusDistribution();
    if(distR.data&&Object.keys(distR.data).length&&window.Chart){
      renderStatusChart(distR.data);
    }

    var growthR=await getCustomerGrowth(from,to);
    if(growthR.data&&growthR.data.length&&window.Chart){
      renderGrowthChart(growthR.data);
    }
    hideLoader('analytics-loader');
  }catch(e){hideLoader('analytics-loader')}  
}

function renderSalesChart(data){
  var canvas=document.createElement('canvas');
  var container=$('analytics-chart-main');
  if(!container)return;
  container.innerHTML='';
  container.appendChild(canvas);
  if(analyticsCharts.sales)analyticsCharts.sales.destroy();
  analyticsCharts.sales=new Chart(canvas,{
    type:'line',
    data:{
      labels:data.map(function(d){return d.date?.slice(5)||''}),
      datasets:[{
        label:'الإيرادات (د.ج)',
        data:data.map(function(d){return d.revenue}),
        borderColor:'#fe2c55',
        backgroundColor:'rgba(254,44,85,0.1)',
        fill:true,
        tension:0.4
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#ddd'}}},
      scales:{x:{ticks:{color:'#888'}},y:{ticks:{color:'#888'}}}
    }
  });
}

function renderStatusChart(data){
  var canvas=document.createElement('canvas');
  var container=$('analytics-chart-events');
  if(!container)return;
  container.innerHTML='';
  container.appendChild(canvas);
  if(analyticsCharts.status)analyticsCharts.status.destroy();
  var labels={pending:'قيد الانتظار',approved:'مقبول',rejected:'مرفوض',delivered:'تم التسليم',archived:'مؤرشف'};
  var colors={pending:'#f39c12',approved:'#2ecc71',rejected:'#e74c3c',delivered:'#3498db',archived:'#95a5a6'};
  analyticsCharts.status=new Chart(canvas,{
    type:'doughnut',
    data:{
      labels:Object.keys(data).map(function(k){return labels[k]||k}),
      datasets:[{
        data:Object.values(data),
        backgroundColor:Object.keys(data).map(function(k){return colors[k]||'#888'})
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{color:'#ddd'}}}
    }
  });
}

function renderGrowthChart(data){
  var canvas=document.createElement('canvas');
  var container=$('analytics-chart-main');
  var growthContainer=document.getElementById('analytics-chart-growth');
  if(!growthContainer){
    var mainCard=container?.closest('.card');
    if(mainCard){
      var newCard=mainCard.cloneNode(true);
      newCard.querySelector('h3').textContent='نمو العملاء';
      newCard.querySelector('.chart-container').id='analytics-chart-growth';
      newCard.querySelector('.chart-container').innerHTML='';
      mainCard.parentNode.appendChild(newCard);
      growthContainer=document.getElementById('analytics-chart-growth');
    }
  }
  if(!growthContainer)return;
  growthContainer.innerHTML='';
  growthContainer.appendChild(canvas);
  if(analyticsCharts.growth)analyticsCharts.growth.destroy();
  analyticsCharts.growth=new Chart(canvas,{
    type:'line',
    data:{
      labels:data.map(function(d){return d.date?.slice(5)||''}),
      datasets:[{
        label:'العملاء الجدد',
        data:data.map(function(d){return d.cumulative}),
        borderColor:'#3498db',
        backgroundColor:'rgba(52,152,219,0.1)',
        fill:true,
        tension:0.4
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#ddd'}}},
      scales:{x:{ticks:{color:'#888'}},y:{ticks:{color:'#888'}}}
    }
  });
}
window.loadAnalytics=loadAnalytics;

// ── Coupons ──
async function loadCoupons(){
  showLoader('coupons-loader');hideEmpty('coupons-empty');
  var tbody=$('coupons-table');
  if(!tbody){hideLoader('coupons-loader');return}
  try{
    var r=await getCoupons();
    hideLoader('coupons-loader');
    if(!r.data||r.data.length===0){showEmpty('coupons-empty');tbody.innerHTML='';return}
    tbody.innerHTML=r.data.map(function(c){
      var active=c.max_uses>=(c.used_count||0)&&(!c.expires_at||new Date(c.expires_at)>new Date());
      return '<tr><td class="cell-primary" dir="ltr">'+esc(c.code)+'</td>'+
        '<td class="font-english">'+(c.type==='percentage'?c.discount_value+'%':fmtCurr(c.discount_value))+'</td>'+
        '<td>'+(c.type==='percentage'?'نسبة مئوية':'قيمة ثابتة')+'</td>'+
        '<td class="font-english">'+ (c.max_uses||'∞') +'</td>'+
        '<td class="font-english">'+(c.used_count||0)+'</td>'+
        '<td>'+ (c.expires_at?fmtDate(c.expires_at):'—') +'</td>'+
        '<td>'+(active?'<span class="badge badge-approved">نشط</span>':'<span class="badge badge-archived">منتهي</span>')+'</td>'+
        '<td><div class="cell-action">'+
          '<button class="btn btn-sm btn-ghost" onclick="openModal(\'modal-coupon-form\','+JSON.stringify(c).replace(/"/g,"'")+')">تعديل</button>'+
          '<button class="btn btn-sm btn-ghost" onclick="deleteCouponAction(\''+c.id+'\')">حذف</button>'+
        '</div></td></tr>'
    }).join('');
  }catch(e){hideLoader('coupons-loader')}
}

async function deleteCouponAction(id){
  showConfirm('هل أنت متأكد من حذف هذا الكوبون؟',async function(){
    var r=await deleteCoupon(id);
    if(!r.error){showToast('تم حذف الكوبون','success');loadCoupons()}
    else{showToast('حدث خطأ','error')}
  })
}
window.deleteCouponAction=deleteCouponAction;

// ── Content ──
async function loadContent(){
  try{
    var sections=['hero','features','stats','about'];
    for(var i=0;i<sections.length;i++){
      var s=sections[i];
      var r=await getLandingContent(s);
      if(r.data){
        var content=r.data;
        if(typeof content==='string'){
          if(s==='hero'){
            try{var parsed=JSON.parse(content);if($('content-hero-title'))$('content-hero-title').value=parsed.title||'';if($('content-hero-desc'))$('content-hero-desc').value=parsed.description||''}catch(e){}
          }else{
            var el=$('content-'+s);
            if(el)el.value=typeof content==='string'?content:JSON.stringify(content,null,2);
          }
        }
      }
    }
  }catch(e){}
}

// ── Activity ──
async function loadActivity(){
  showLoader('activity-loader');hideEmpty('activity-empty');
  var tbody=$('activity-table');
  if(!tbody){hideLoader('activity-loader');return}
  try{
    var actorFilter=$('activity-actor-filter')?.value||'';
    var resourceFilter=$('activity-resource-filter')?.value||'';
    var r=await getActivityLogs({actorType:actorFilter||undefined,resourceType:resourceFilter||undefined});
    hideLoader('activity-loader');
    if(!r.data||r.data.length===0){showEmpty('activity-empty');tbody.innerHTML='';return}
    tbody.innerHTML=r.data.map(function(a){
      var detailsHtml='';
      if(a.details&&Object.keys(a.details).length){
        detailsHtml='<div class="activity-details" style="display:none;padding:12px;background:var(--bg-secondary);border-radius:8px;margin-top:8px;font-size:12px;direction:ltr;text-align:left">'+
          '<pre style="margin:0;white-space:pre-wrap;color:var(--text-secondary)">'+esc(JSON.stringify(a.details,null,2))+'</pre></div>';
      }
      return '<tr onclick="if(this.nextElementSibling)this.nextElementSibling.classList.toggle(\'open\')" style="cursor:pointer">'+
        '<td>'+esc(a.actor_type||'—')+'</td><td>'+esc(a.action)+'</td><td>'+esc(a.resource_type||'—')+'</td>'+
        '<td class="font-english">'+esc(a.resource_id?.slice(0,8)||'—')+'</td><td>'+fmtDate(a.created_at)+'</td></tr>'+
        '<tr style="display:none"><td colspan="5">'+detailsHtml+'</td></tr>'
    }).join('');
  }catch(e){hideLoader('activity-loader')}
}

function bindActivityFilter(){
  var el=$('activity-actor-filter');
  if(el)el.addEventListener('change',loadActivity);
  var arf=$('activity-resource-filter');
  if(arf)arf.addEventListener('change',loadActivity);
}

// ── Media ──
async function loadMedia(){
  showLoader('media-loader');hideEmpty('media-empty');
  var grid=$('media-grid');
  if(!grid){hideLoader('media-loader');return}
  try{
    var r=await getFiles('media');
    hideLoader('media-loader');
    if(!r.data||r.data.length===0){showEmpty('media-empty');grid.innerHTML='';return}
    grid.innerHTML=r.data.map(function(f){
      var ext=f.name?.split('.').pop()?.toLowerCase();
      var isImage=['jpg','jpeg','png','gif','webp'].includes(ext);
      return '<div class="media-item" style="border:1px solid var(--border-glass);border-radius:8px;overflow:hidden;cursor:pointer" onclick="window.open(\''+sanitizeHTML(f.publicUrl)+'\',\'_blank\')">'+
        (isImage?'<img src="'+sanitizeHTML(f.publicUrl)+'" alt="'+sanitizeHTML(f.name)+'" style="width:100%;height:120px;object-fit:cover">':
          '<div style="width:100%;height:120px;display:flex;align-items:center;justify-content:center;background:var(--bg-secondary)"><span style="font-size:12px;color:var(--text-muted)">'+sanitizeHTML(ext)+'</span></div>')+
        '<div style="padding:8px;font-size:11px;text-align:center">'+
        '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sanitizeHTML(f.name)+'</div>'+
        '<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();deleteMediaAction(\''+sanitizeHTML(f.name)+'\')" style="margin-top:4px">حذف</button></div></div>'
    }).join('');
  }catch(e){hideLoader('media-loader')}
}

async function deleteMediaAction(name){
  showConfirm('هل أنت متأكد من حذف '+name+'؟',async function(){
    var r=await deleteFile('media',name);
    if(!r.error){showToast('تم حذف الملف','success');loadMedia()}
    else{showToast('حدث خطأ','error')}
  })
}
window.loadMedia=loadMedia;
window.deleteMediaAction=deleteMediaAction;

// ── Profile ──
async function loadProfile(){
  if(!A.user)return;
  if($('profile-name'))$('profile-name').value=A.user?.user_metadata?.full_name||'';
  if($('profile-email'))$('profile-email').value=A.user?.email||'';
  if($('profile-phone'))$('profile-phone').value=A.user?.user_metadata?.phone||'';
  var r=await getCurrentUser();
  if(r.data&&r.data.profile){
    if(r.data.profile.avatar_url&&$('profile-avatar-img')){
      $('profile-avatar-img').src=r.data.profile.avatar_url;
    }
  }
}

// ── Modal Fill Functions ──
function fillOrderModal(data){
  $('modal-order-title').textContent=data.id?'تعديل طلب':'إنشاء طلب';
  $('modal-order-id').value=data.id||'';
  $('modal-order-customer').value=data.customer_id||'';
  $('modal-order-product').value=data.product_id||'';
  $('modal-order-amount').value=data.amount||'';
  $('modal-order-quantity').value=data.quantity||1;
  $('modal-order-status').value=data.status||'pending';
  $('modal-order-notes').value=data.notes||'';
  loadModalSelects();
}

function fillCustomerModal(data){
  $('modal-customer-title').textContent=data.id?'تعديل عميل':'إضافة عميل';
  $('modal-customer-id').value=data.id||'';
  $('modal-customer-name').value=data.full_name||'';
  $('modal-customer-email').value=data.email||'';
  $('modal-customer-phone').value=data.phone||'';
  if($('modal-customer-source'))$('modal-customer-source').value=data.source||'direct';
  if($('modal-customer-status'))$('modal-customer-status').value=data.status||'active';
  if($('modal-customer-tags'))$('modal-customer-tags').value=data.tags||'';
}

function fillProductModal(data){
  $('modal-product-title').textContent=data.id?'تعديل منتج':'إضافة منتج';
  $('modal-product-id').value=data.id||'';
  $('modal-product-name').value=data.name||'';
  $('modal-product-price').value=data.price||'';
  $('modal-product-slug').value=data.slug||'';
  $('modal-product-desc').value=data.description||'';
  $('modal-product-warranty').value=data.warranty_months||6;
  $('modal-product-video-url').value=data.video_url||'';
  $('modal-product-status').value=data.is_active!==false?'active':'inactive';
  $('modal-product-featured').checked=data.is_featured||false;
  $('modal-product-order').value=data.sort_order||0;
  var previews=$('modal-product-image-previews');
  if(previews){
    previews.innerHTML='';
    if(data.images&&Array.isArray(data.images)){
      data.images.forEach(function(url){
        var img=document.createElement('img');
        img.src=url;
        img.style.cssText='width:64px;height:64px;border-radius:4px;object-fit:cover';
        previews.appendChild(img);
      });
    }
  }
  var featuresContainer=$('modal-product-features');
  if(featuresContainer){
    featuresContainer.innerHTML='';
    if(Array.isArray(data.features)){
      data.features.forEach(function(f){addFeature(f)});
    }
    if(!data.features||!data.features.length){
      addFeature('');
    }
  }
}

function fillFaqModal(data){
  $('modal-faq-title').textContent=data.id?'تعديل سؤال':'إضافة سؤال';
  $('modal-faq-id').value=data.id||'';
  $('modal-faq-question').value=data.question||'';
  $('modal-faq-answer').value=data.answer||'';
  $('modal-faq-order').value=data.sort_order||0;
}

function fillCouponModal(data){
  $('modal-coupon-title').textContent=data.id?'تعديل كوبون':'إضافة كوبون';
  $('modal-coupon-id').value=data.id||'';
  $('modal-coupon-code').value=data.code||'';
  $('modal-coupon-discount').value=data.discount_value||'';
  $('modal-coupon-type').value=data.type||'percentage';
  $('modal-coupon-max-uses').value=data.max_uses||100;
  $('modal-coupon-expiry').value=data.expires_at?data.expires_at.split('T')[0]:'';
}

async function loadModalSelects(){
  try{
    var c=await getCustomers();
    var sel=$('modal-order-customer');
    if(sel&&c.data){
      sel.innerHTML='<option value="">اختر العميل</option>'+c.data.map(function(cu){return '<option value="'+cu.id+'">'+esc(cu.full_name)+'</option>'}).join('');
    }
    var p=await getProducts(true);
    var sel2=$('modal-order-product');
    if(sel2&&p.data){
      sel2.innerHTML='<option value="">اختر المنتج</option>'+p.data.map(function(pr){return '<option value="'+pr.id+'">'+esc(pr.name)+'</option>'}).join('');
    }
  }catch(e){}
}

// ── Modal Save Handlers ──
async function saveModalOrder(){
  var id=$('modal-order-id').value;
  var data={customer_id:$('modal-order-customer').value,product_id:$('modal-order-product').value,amount:parseFloat($('modal-order-amount').value),quantity:parseInt($('modal-order-quantity').value)||1,status:$('modal-order-status').value,notes:$('modal-order-notes').value};
  if(!data.customer_id||!data.product_id||!data.amount){showToast('يرجى تعبئة جميع الحقول المطلوبة','error');return}
  var r=id?await updateOrder(id,data):await createOrder(data);
  if(!r.error){closeModal('modal-order-form');showToast(id?'تم تحديث الطلب':'تم إنشاء الطلب','success');loadOrders()}
  else{showToast(r.error.message||'حدث خطأ','error')}
}

async function saveModalCustomer(){
  var id=$('modal-customer-id').value;
  var data={full_name:$('modal-customer-name').value,email:$('modal-customer-email').value,phone:$('modal-customer-phone').value};
  if(!data.full_name||!data.email){showToast('يرجى تعبئة جميع الحقول المطلوبة','error');return}
  if($('modal-customer-source'))data.source=$('modal-customer-source').value;
  if($('modal-customer-status'))data.status=$('modal-customer-status').value;
  if($('modal-customer-tags'))data.tags=$('modal-customer-tags').value;
  var r=id?await updateCustomer(id,data):await createCustomer(data);
  if(!r.error){closeModal('modal-customer-form');showToast(id?'تم تحديث العميل':'تم إضافة العميل','success');loadCustomers()}
  else{showToast(r.error.message||'حدث خطأ','error')}
}

async function saveModalProduct(){
  var id=$('modal-product-id').value;
  var slug=$('modal-product-name').value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  var images=[];
  var previews=$('modal-product-image-previews');
  if(previews){
    Array.from(previews.querySelectorAll('img')).forEach(function(img){images.push(img.src)});
  }
  var fileInput=$('modal-product-images');
  if(fileInput&&fileInput.files.length){
    for(var i=0;i<fileInput.files.length;i++){
      var r=await uploadProductImage(fileInput.files[i],id||'new');
      if(r.data)images.push(r.data);
    }
  }
  var features=getFeatures();
  var data={
    name:$('modal-product-name').value,
    slug:slug,
    price:parseFloat($('modal-product-price').value),
    description:$('modal-product-desc').value,
    warranty_months:parseInt($('modal-product-warranty').value)||6,
    images:images,
    video_url:$('modal-product-video-url').value,
    features:features.length?features:null,
    is_active:$('modal-product-status').value==='active',
    is_featured:$('modal-product-featured').checked,
    sort_order:parseInt($('modal-product-order').value)||0
  };
  if(!data.name||!data.price){showToast('يرجى تعبئة جميع الحقول المطلوبة','error');return}
  var r=id?await updateProduct(id,data):await createProduct(data);
  if(!r.error){closeModal('modal-product-form');showToast(id?'تم تحديث المنتج':'تم إضافة المنتج','success');loadProducts()}
  else{showToast(r.error.message||'حدث خطأ','error')}
}

async function saveModalFaq(){
  var id=$('modal-faq-id').value;
  var data={question:$('modal-faq-question').value,answer:$('modal-faq-answer').value,sort_order:parseInt($('modal-faq-order').value)||0};
  if(!data.question||!data.answer){showToast('يرجى تعبئة جميع الحقول المطلوبة','error');return}
  var r=id?await updateFaq(id,data):await createFaq(data);
  if(!r.error){closeModal('modal-faq-form');showToast(id?'تم تحديث السؤال':'تم إضافة السؤال','success');loadFaq()}
  else{showToast(r.error.message||'حدث خطأ','error')}
}

async function saveModalCoupon(){
  var id=$('modal-coupon-id').value;
  var data={code:$('modal-coupon-code').value,discount_value:parseFloat($('modal-coupon-discount').value),type:$('modal-coupon-type').value,max_uses:parseInt($('modal-coupon-max-uses').value)||100,expires_at:$('modal-coupon-expiry').value||null};
  if(!data.code||!data.discount_value){showToast('يرجى تعبئة جميع الحقول المطلوبة','error');return}
  var r=id?await updateCoupon(id,data):await createCoupon(data);
  if(!r.error){closeModal('modal-coupon-form');showToast(id?'تم تحديث الكوبون':'تم إضافة الكوبون','success');loadCoupons()}
  else{showToast(r.error.message||'حدث خطأ','error')}
}

async function saveModalSettings(){
  var data={};
  if($('settings-company-name'))data.company_name=$('settings-company-name').value;
  if($('settings-phone'))data.phone=$('settings-phone').value;
  if($('settings-whatsapp'))data.whatsapp=$('settings-whatsapp').value;
  if($('settings-email'))data.email=$('settings-email').value;
  if($('settings-address'))data.address=$('settings-address').value;
  var paymentAccounts={};
  if($('settings-baridimob-label'))paymentAccounts.baridimob={label:$('settings-baridimob-label').value,number:$('settings-baridimob-number').value};
  if($('settings-ccp-label'))paymentAccounts.ccp={label:$('settings-ccp-label').value,rib:$('settings-ccp-rib').value};
  if($('settings-bank-label'))paymentAccounts.bank={label:$('settings-bank-label').value,account:$('settings-bank-account').value};
  data.payment_accounts=paymentAccounts;
  var r=await updateSettings(data);
  if(!r.error){closeModal('modal-settings-section');showToast('تم حفظ الإعدادات','success');loadSettings()}
  else{showToast(r.error.message||'حدث خطأ','error')}
}
window.saveModalSettings=saveModalSettings;

function addFeature(value){
  var container=$('modal-product-features');
  if(!container)return;
  var div=document.createElement('div');
  div.className='feature-item';
  div.style.cssText='display:flex;gap:8px;margin-bottom:4px';
  div.innerHTML='<input type="text" class="form-control feature-text" placeholder="ميزة" style="flex:1" value="'+esc(value||'')+'"><button class="btn btn-sm btn-ghost" onclick="this.parentElement.remove()">✕</button>';
  container.appendChild(div);
}
function removeFeature(btn){btn.closest('.feature-item')?.remove()}
function getFeatures(){
  return Array.from(document.querySelectorAll('#modal-product-features .feature-text')).map(function(inp){return inp.value.trim()}).filter(Boolean);
}
window.addFeature=addFeature;
window.removeFeature=removeFeature;
window.getFeatures=getFeatures;

// ── Event Binding ──
function bindGlobalEvents(){
  // Sidebar toggle
  var mt=$('menu-toggle');
  if(mt)mt.addEventListener('click',toggleSidebar);

  // User dropdown toggle
  var dt=$('user-dropdown');
  if(dt)dt.addEventListener('click',function(e){
    var trig=e.target.closest('[data-action="toggle-dropdown"]');
    if(trig){toggleDropdown();e.stopPropagation()}
  });
  document.addEventListener('click',function(e){
    if(!e.target.closest('#user-dropdown'))closeDropdown()
  });

  // Logout
  document.addEventListener('click',function(e){
    if(e.target.closest('[data-action="logout"]')){
      handleLogout();
    }
  });

  // Modal opens
  document.addEventListener('click',function(e){
    var target=e.target.closest('[data-modal]');
    if(target){
      var modalId=target.getAttribute('data-modal');
      if(target.hasAttribute('data-action')){
        if(target.getAttribute('data-action')==='create-order'){loadModalSelects();openModal(modalId)}
        else if(target.getAttribute('data-action')==='create-customer'){fillCustomerModal({});openModal(modalId)}
        else if(target.getAttribute('data-action')==='create-product'){fillProductModal({});openModal(modalId)}
        else if(target.getAttribute('data-action')==='create-faq'){fillFaqModal({});openModal(modalId)}
        else if(target.getAttribute('data-action')==='create-coupon'){fillCouponModal({});openModal(modalId)}
        else{openModal(modalId)}
      }else{
        openModal(modalId);
      }
    }
  });

  // Modal closes
  document.addEventListener('click',function(e){
    if(e.target.closest('[data-action="close-modal"]')){
      var modalId=e.target.closest('[data-action="close-modal"]').getAttribute('data-modal');
      closeModal(modalId);
    }
    if(e.target.classList.contains('modal-overlay')){
      closeModal(e.target.id);
    }
    if(e.target.closest('.modal-close')){
      var modal=e.target.closest('.modal-overlay');
      if(modal)closeModal(modal.id);
    }
  });

  // Modal save actions
  document.addEventListener('click',function(e){
    var target=e.target.closest('[data-action]');
    if(!target)return;
    var action=target.getAttribute('data-action');
    if(action==='save-modal-order'){saveModalOrder()}
    else if(action==='save-modal-customer'){saveModalCustomer()}
    else if(action==='save-modal-product'){saveModalProduct()}
    else if(action==='save-modal-faq'){saveModalFaq()}
    else if(action==='save-modal-coupon'){saveModalCoupon()}
    else if(action==='mark-all-read'){markAllRead()}
    else if(action==='approve-order'&&A.currentOrderId){approveOrderAction(A.currentOrderId)}
    else if(action==='reject-order'&&A.currentOrderId){rejectOrderAction(A.currentOrderId)}
    else if(action==='save-order-note'&&A.currentOrderId){saveOrderNote()}
    else if(action==='send-ticket-reply'&&A.currentTicketId){sendTicketReply()}
    else if(action==='save-content'){saveContentSection(target.getAttribute('data-section'))}
    else if(action==='save-modal-settings'){saveModalSettings()}
    else if(action==='filter-analytics'){loadAnalytics()}
    else if(action==='upload-avatar'){$('avatar-upload-input')?.click()}
  });

  // Confirm action
  document.addEventListener('click',function(e){
    var target=e.target.closest('#modal-confirm-btn');
    if(target&&A.pendingConfirm){
      A.pendingConfirm();
      A.pendingConfirm=null;
      closeModal('modal-confirm');
    }
  });

  // Media upload handler
  var mu=$('media-upload-input');
  if(mu)mu.addEventListener('change',async function(){
    var files=mu.files;
    if(!files.length)return;
    showToast('جاري رفع '+files.length+' ملف...','info');
    var count=0;
    for(var i=0;i<files.length;i++){
      var r=await uploadFile('media',files[i]);
      if(!r.error)count++;
    }
    showToast('تم رفع '+count+' ملف','success');
    mu.value='';
    loadMedia();
  });

  // Order form submit (page form)
  var of=$('order-form');
  if(of)of.addEventListener('submit',async function(e){
    e.preventDefault();
    var id=$('order-form-id').value;
    var data={customer_id:$('order-form-customer').value,product_id:$('order-form-product').value,amount:parseFloat($('order-form-amount').value),quantity:parseInt($('order-form-quantity').value)||1,status:$('order-form-status').value,notes:$('order-form-notes').value};
    if(!data.customer_id||!data.product_id||!data.amount){showToast('يرجى تعبئة جميع الحقول المطلوبة','error');return}
    var r=id?await updateOrder(id,data):await createOrder(data);
    if(!r.error){showToast(id?'تم تحديث الطلب':'تم إنشاء الطلب','success');navigateTo('page-orders')}
    else{showToast(r.error.message||'حدث خطأ','error')}
  });

  // Profile form
  var pf=$('profile-form');
  if(pf)pf.addEventListener('submit',async function(e){
    e.preventDefault();
    var data={full_name:$('profile-name').value,phone:$('profile-phone').value};
    var r=await supabase.from('profiles').update(data).eq('id',A.user.id).select().single();
    if(!r.error){showToast('تم حفظ التغييرات','success');loadProfile()}
    else{showToast('حدث خطأ','error')}
  });

  // Password form
  var pwf=$('password-form');
  if(pwf)pwf.addEventListener('submit',async function(e){
    e.preventDefault();
    var cp=$('password-current').value,np=$('password-new').value,cf=$('password-confirm').value;
    if(np!==cf){showToast('كلمة المرور غير متطابقة','error');return}
    var r=await supabase.auth.updateUser({password:np});
    if(!r.error){showToast('تم تحديث كلمة المرور','success');$('password-current').value='';$('password-new').value='';$('password-confirm').value=''}
    else{showToast(r.error.message||'حدث خطأ','error')}
  });

  // Avatar upload
  var av=$('avatar-upload-input');
  if(av)av.addEventListener('change',async function(){
    var file=av.files[0];
    if(!file)return;
    showToast('جاري رفع الصورة...','info');
    var r=await uploadFile('avatars',file);
    if(!r.error){
      if($('profile-avatar-img'))$('profile-avatar-img').src=r.data.publicUrl;
      await supabase.from('profiles').update({avatar_url:r.data.publicUrl,updated_at:new Date().toISOString()}).eq('id',A.user.id);
      showToast('تم تغيير الصورة الشخصية','success');
    }else{showToast('فشل رفع الصورة','error')}
    av.value='';
  });

  // General settings form
  var gsf=$('settings-general-form');
  if(gsf)gsf.addEventListener('submit',async function(e){
    e.preventDefault();
    var data={
      company_name:$('settings-company-name').value,
      phone:$('settings-phone').value,
      whatsapp:$('settings-whatsapp').value,
      email:$('settings-email').value,
      address:$('settings-address').value
    };
    var r=await updateSettings(data);
    if(!r.error){showToast('تم حفظ الإعدادات العامة','success');loadSettings()}
    else{showToast('حدث خطأ في الحفظ','error')}
  });

  // Payment settings form
  var psf=$('settings-payment-form');
  if(psf)psf.addEventListener('submit',async function(e){
    e.preventDefault();
    var data={
      payment_accounts:{
        baridimob:{label:$('settings-baridimob-label').value,number:$('settings-baridimob-number').value},
        ccp:{label:$('settings-ccp-label').value,rib:$('settings-ccp-rib').value},
        bank:{label:$('settings-bank-label').value,account:$('settings-bank-account').value}
      }
    };
    var r=await updateSettings(data);
    if(!r.error){showToast('تم حفظ إعدادات الدفع','success');loadSettings()}
    else{showToast('حدث خطأ في الحفظ','error')}
  });

  // Order filters
  bindOrderFilters();
  bindCustomerSearch();
  bindActivityFilter();

  // Analytics filters
  var af=$('analytics-date-from');
  var at=$('analytics-date-to');
  if(af)af.valueAsDate=new Date(new Date().getFullYear(),new Date().getMonth(),1);
  if(at)at.valueAsDate=new Date();

  // Reviews filters
  var rsf=$('reviews-status-filter');
  var rrf=$('reviews-rating-filter');
  if(rsf)rsf.addEventListener('change',loadReviews);
  if(rrf)rrf.addEventListener('change',loadReviews);

  // FAQ category filter
  var fcf=$('faq-category-filter');
  if(fcf)fcf.addEventListener('change',loadFaq);

  // Notification filters
  var ntf=$('notifications-type-filter');
  var nrf=$('notifications-read-filter');
  if(ntf)ntf.addEventListener('change',loadNotifications);
  if(nrf)nrf.addEventListener('change',loadNotifications);
}

async function saveOrderNote(){
  var note=$('order-detail-notes-input')?.value;
  if(!note||!A.currentOrderId){showToast('يرجى كتابة ملاحظة','error');return}
  var r=await addTimelineEntry(A.currentOrderId,'note',note,A.user?.id);
  if(!r.error){showToast('تم حفظ الملاحظة','success');$('order-detail-notes-input').value='';loadOrderDetail(A.currentOrderId)}
  else{showToast('حدث خطأ','error')}
}

async function sendTicketReply(){
  var msg=$('ticket-reply-input')?.value;
  if(!msg||!A.currentTicketId){showToast('يرجى كتابة الرد','error');return}
  var r=await addTicketReply(A.currentTicketId,'admin',A.user?.user_metadata?.full_name||'مشرف',msg);
  if(!r.error){showToast('تم إرسال الرد','success');$('ticket-reply-input').value='';loadTicketDetail(A.currentTicketId)}
  else{showToast('حدث خطأ','error')}
}

async function saveContentSection(section){
  var data={};
  if(section==='hero'){
    data={title:$('content-hero-title')?.value||'',description:$('content-hero-desc')?.value||''};
  }else{
    var el=$('content-'+section);
    if(!el){showToast('حدث خطأ','error');return}
    try{data=JSON.parse(el.value)}catch(e){data={content:el.value}}
  }
  var r=await updateLandingContent(section,data);
  if(!r.error){showToast('تم حفظ المحتوى','success')}
  else{showToast('حدث خطأ','error')}
}

// ── Logout ──
async function handleLogout(){
  await signOut();
  A.user=null;A.session=null;
  $('app-layout').style.display='none';
  qa('.page').forEach(function(p){p.classList.remove('active')});
  $('page-login').classList.add('active');
  closeDropdown();
}
window.handleLogout=handleLogout;

// ── Realtime ──
function setupRealtime(){
  try{
    unsubscribeAll();
    trackSubscription(subscribeNotifications(function(n){
      showToast(n.body||'إشعار جديد','info');
      loadNotifications();
      var badge=$('notif-badge-sidebar');
      if(badge)badge.textContent=parseInt(badge.textContent||'0')+1;
      var dot=$('notif-dot-header');
      if(dot)dot.style.display='block';
      refreshDashboardStats();
    }));
    trackSubscription(subscribeStats(function(){
      var page=A.currentPage;
      if(page==='page-dashboard'||!page)refreshDashboardStats();
    }));
  }catch(e){}
}

// ── Dark Mode ──
function toggleDarkMode(){
  var html=document.documentElement;
  var isDark=html.classList.toggle('dark');
  localStorage.setItem('theme',isDark?'dark':'light');
}

function loadDarkModePreference(){
  var theme=localStorage.getItem('theme');
  if(theme==='dark'){
    document.documentElement.classList.add('dark');
  }else if(!theme){
    var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;
    if(prefersDark)document.documentElement.classList.add('dark');
  }
}

// ── Global Search ──
function setupGlobalSearch(){
  var input=$('global-search');
  if(!input)return;
  var timer;
  input.addEventListener('input',function(){
    clearTimeout(timer);
    timer=setTimeout(function(){performGlobalSearch(input.value)},300);
  });
  input.addEventListener('focus',function(){
    if(this.value)showSearchDropdown();
  });
  input.addEventListener('blur',function(){
    setTimeout(closeSearchDropdown,200);
  });
}

function showSearchDropdown(){
  var dd=$('search-dropdown');
  if(!dd){
    dd=document.createElement('div');
    dd.id='search-dropdown';
    dd.style.cssText='position:absolute;top:100%;left:0;right:0;background:var(--bg-secondary);border:1px solid var(--border-glass);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);z-index:300;max-height:400px;overflow-y:auto;display:none';
    var sb=$('search-bar');
    if(sb)sb.style.position='relative';
    var parent=$('search-bar')||$('global-search')?.parentElement;
    if(parent)parent.appendChild(dd);
  }
  if(dd)dd.style.display='block';
}

function closeSearchDropdown(){
  var dd=$('search-dropdown');
  if(dd)dd.style.display='none';
}

async function performGlobalSearch(query){
  var dd=$('search-dropdown');
  if(!dd)return;
  if(!query||query.length<2){dd.style.display='none';return}
  showSearchDropdown();
  dd.innerHTML='<div style="padding:12px;text-align:center;color:var(--text-tertiary)">جاري البحث...</div>';
  var results=[];
  try{
    var o=await getOrders({search:query,pageSize:5});
    if(o.data&&o.data.length)results=results.concat(o.data.map(function(r){return{type:'طلب',label:r.order_number||r.id,url:'page-order-detail',id:r.id}}));
  }catch(e){}
  try{
    var c=await getCustomers({search:query,pageSize:5});
    if(c.data&&c.data.length)results=results.concat(c.data.map(function(r){return{type:'عميل',label:r.full_name||r.email,url:'page-customer-detail',id:r.id}}));
  }catch(e){}
  if(!results.length){
    dd.innerHTML='<div style="padding:12px;text-align:center;color:var(--text-tertiary)">لا توجد نتائج</div>';
    return;
  }
    dd.innerHTML=results.map(function(r){
    return '<div style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-glass);font-size:13px" onmouseover="this.style.background=\'var(--bg-glass)\'" onmouseout="this.style.background=\'\'" onclick="navigateTo(\''+sanitizeHTML(r.url)+'\',\''+sanitizeHTML(r.id)+'\');closeSearchDropdown()">'+
        '<span style="background:var(--primary-glow);color:var(--primary);padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600">'+sanitizeHTML(r.type)+'</span>'+
        '<span>'+sanitizeHTML(r.label)+'</span></div>'
    }).join('');
}

// ── Keyboard Shortcuts ──
function setupKeyboardShortcuts(){
  document.addEventListener('keydown',function(e){
    if(e.ctrlKey&&e.key==='k'){
      e.preventDefault();
      var inp=$('global-search');
      if(inp){inp.focus();inp.select()}
    }
    if(e.key==='Escape'){
      closeSearchDropdown();
      closeAllModals();
    }
  });
}

// ── Export to CSV helper ──
function exportToCSV(headers,rows,filename){
  filename=filename||'export.csv';
  var headerLine=headers.map(function(h){return '"'+String(h).replace(/"/g,'""')+'"'}).join(',')+'\n';
  var dataLines=rows.map(function(row){
    return row.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"'}).join(',')
  }).join('\n');
  var blob=new Blob(['\uFEFF'+headerLine+dataLines],{type:'text/csv;charset=utf-8;'});
  var link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;link.click();
  URL.revokeObjectURL(link.href);
}

function exportCSV(rows, filename) {
  if (!rows || !rows.length) { showToast('No data to export', 'warning'); return }
  var headers = Object.keys(rows[0])
  var csv = headers.join(',') + '\n'
  rows.forEach(function(row) {
    var vals = headers.map(function(h) {
      var val = row[h] !== undefined && row[h] !== null ? String(row[h]) : ''
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val.replace(/"/g, '""') + '"'
      }
      return val
    })
    csv += vals.join(',') + '\n'
  })
  var BOM = '\uFEFF'
  var blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  var link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename + '.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

// ── Hash routing ──
window.addEventListener('hashchange',function(){
  var hash=location.hash.replace('#','')||'dashboard';
  navigateTo('page-'+hash);
});

// ── Start ──
document.addEventListener('DOMContentLoaded',init);

// ── Window exports ──
window.init=init;
window.toggleSidebar=toggleSidebar;
window.toggleDropdown=toggleDropdown;
window.closeDropdown=closeDropdown;
window.openModal=openModal;
window.closeModal=closeModal;
window.closeAllModals=closeAllModals;
window.showConfirm=showConfirm;
window.showToast=showToast;
window.navigateTo=navigateTo;
window.loadDashboard=loadDashboard;
window.loadOrders=loadOrders;
window.loadOrderDetail=loadOrderDetail;
window.loadCustomers=loadCustomers;
window.loadCustomerDetail=loadCustomerDetail;
window.loadProducts=loadProducts;
window.loadReviews=loadReviews;
window.loadFaq=loadFaq;
window.loadTickets=loadTickets;
window.loadTicketDetail=loadTicketDetail;
window.loadNotifications=loadNotifications;
window.loadSettings=loadSettings;
window.loadAnalytics=loadAnalytics;
window.loadCoupons=loadCoupons;
window.loadContent=loadContent;
window.loadActivity=loadActivity;
window.loadMedia=loadMedia;
window.loadProfile=loadProfile;
window.approveOrderAction=approveOrderAction;
window.rejectOrderAction=rejectOrderAction;
window.deleteCustomerAction=deleteCustomerAction;
window.saveCustomerNotes=saveCustomerNotes;
window.deleteProductAction=deleteProductAction;
window.reorderProductAction=reorderProductAction;
window.approveReviewAction=approveReviewAction;
window.pinReviewAction=pinReviewAction;
window.deleteReviewAction=deleteReviewAction;
window.toggleAllReviews=toggleAllReviews;
window.updateReviewsBatchBar=updateReviewsBatchBar;
window.batchApproveReviews=batchApproveReviews;
window.batchPinReviews=batchPinReviews;
window.batchDeleteReviews=batchDeleteReviews;
window.deleteFaqAction=deleteFaqAction;
window.faqDragStart=faqDragStart;
window.faqDragOver=faqDragOver;
window.faqDrop=faqDrop;
window.faqDragEnd=faqDragEnd;
window.markNotifRead=markNotifRead;
window.deleteCouponAction=deleteCouponAction;
window.addFeature=addFeature;
window.removeFeature=removeFeature;
window.getFeatures=getFeatures;
window.saveModalOrder=saveModalOrder;
window.saveModalCustomer=saveModalCustomer;
window.saveModalProduct=saveModalProduct;
window.saveModalFaq=saveModalFaq;
window.saveModalCoupon=saveModalCoupon;
window.handleLogout=handleLogout;
window.loadModalSelects=loadModalSelects;
window.fillOrderModal=fillOrderModal;
window.fillCustomerModal=fillCustomerModal;
window.fillProductModal=fillProductModal;
window.fillFaqModal=fillFaqModal;
window.fillCouponModal=fillCouponModal;
window.saveOrderNote=saveOrderNote;
window.sendTicketReply=sendTicketReply;
window.saveContentSection=saveContentSection;
window.exportOrdersCSV=exportOrdersCSV;
window.renderPagination=renderPagination;
window.toggleAllOrders=toggleAllOrders;
window.updateBatchBar=updateBatchBar;
window.batchApproveOrders=batchApproveOrders;
window.batchDeleteOrders=batchDeleteOrders;
window.bindOrderFilters=bindOrderFilters;
window.bindCustomerSearch=bindCustomerSearch;
window.bindActivityFilter=bindActivityFilter;
window.markAllRead=markAllRead;
window.setupRealtime=setupRealtime;
window.deleteMediaAction=deleteMediaAction;
window.assignTicketAction=assignTicketAction;
window.toggleDarkMode=toggleDarkMode;
window.loadDarkModePreference=loadDarkModePreference;
window.setupGlobalSearch=setupGlobalSearch;
window.performGlobalSearch=performGlobalSearch;
window.closeSearchDropdown=closeSearchDropdown;
window.showSearchDropdown=showSearchDropdown;
window.setupKeyboardShortcuts=setupKeyboardShortcuts;
window.exportToCSV=exportToCSV;
window.exportCSV=exportCSV;

})();