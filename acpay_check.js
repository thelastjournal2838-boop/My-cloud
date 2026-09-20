

const API='/api';

let currentPayment=null;
let adminToken=localStorage.getItem('adminToken')||null;



/* TEAM */

let currentTeamLevel='A';
let teamData=null;

async function openTeam(fromHistory=false){

  try{

    let parentPage=sessionStorage.getItem('acpay_team_parent')||'home';

    if(!fromHistory){

      const currentHash=(location.hash||'')
        .replace(/^#/,'')
        .split('?')[0];

      if(currentHash==='my'){
        parentPage='my';
      }else{
        parentPage='home';
      }

      sessionStorage.setItem('acpay_team_parent',parentPage);

    }

    show('team',false);

    const data=await req('/team',{
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    teamData=data;

    const summary=data.summary||{};

    const total=document.getElementById('teamTotalCommission');
    if(total)
      total.textContent='₹'+Number(summary.total_commission||0).toFixed(2);

    const today=document.getElementById('teamTodayCommission');
    if(today)
      today.textContent='₹'+Number(summary.today_commission||0).toFixed(2);

    const yesterday=document.getElementById('teamYesterdayCommission');
    if(yesterday)
      yesterday.textContent='₹'+Number(summary.yesterday_commission||0).toFixed(2);

    const members=document.getElementById('teamMembers');
    if(members)
      members.textContent=String(summary.total_members||0);

    const deposit=document.getElementById('teamDeposit');
    if(deposit)
      deposit.textContent='₹'+Number(summary.total_team_deposit||0).toFixed(2);

    const code=document.getElementById('teamReferralCode');
    if(code)
      code.textContent=data.user?.referral_code||'-';

    showTeamLevel('A');

    if(!fromHistory && !restoringPage){

      history.pushState(
        {page:parentPage},
        '',
        '#'+parentPage
      );

      history.pushState(
        {page:'team',backPage:parentPage},
        '',
        '#team'
      );

    }

    window.scrollTo(0,0);

  }catch(e){

    console.error('Team error:',e);
    alert(e.message||'Team load nahi ho paya');

  }

}
function showTeamLevel(level){

  currentTeamLevel=level;

  const tabs={
    A:document.getElementById('teamTabA'),
    B:document.getElementById('teamTabB'),
    C:document.getElementById('teamTabC')
  };

  Object.values(tabs).forEach(tab=>{
    if(tab) tab.classList.remove('active');
  });

  if(tabs[level])
    tabs[level].classList.add('active');

  const list=document.getElementById('teamMembersList');

  if(!list) return;

  const members=
    teamData &&
    teamData.levels &&
    teamData.levels[level]
      ? teamData.levels[level]
      : [];

  if(!members.length){

    list.innerHTML=
      '<p>No members in Level '+level+' yet.</p>';

    return;
  }

  list.innerHTML=members.map(user=>{

    const date=user.created_at
      ? new Date(user.created_at).toLocaleDateString()
      : '';

    return `
      <div class="ac-task-row">
        <strong>${escapeHtml(user.username||'User')}</strong>
        <span>ID: ${escapeHtml(String(user.id||''))}</span>
      </div>
      <div class="ac-task-bottom">
        <span>Joined ${escapeHtml(date)}</span>
        <span>Level ${level}</span>
      </div>
    `;

  }).join('');

}

function copyTeamLink(){

  if(!teamData || !teamData.user){

    alert('Team data load nahi hua');

    return;
  }

  const code=teamData.user.referral_code||'';

  if(!code){

    alert('Referral code available nahi hai');

    return;
  }

  const link=
    location.origin+
    location.pathname+
    '#register?ref='+
    encodeURIComponent(code);

  navigator.clipboard.writeText(link)
    .then(()=>{
      alert('Invitation link copied');
    })
    .catch(()=>{
      prompt('Invitation link:',link);
    });

}



/* TEAM SHARING */

function getTeamInviteLink(){

  const code=
    teamData &&
    teamData.user &&
    teamData.user.referral_code
      ? teamData.user.referral_code
      : '';

  if(!code){
    return '';
  }

  return location.origin+
    location.pathname+
    '#register?ref='+
    encodeURIComponent(code);
}

function shareTeam(type){

  const link=getTeamInviteLink();

  if(!link){

    alert('Referral link abhi available nahi hai');
    return;
  }

  const text=
    'Join ACPay using my invitation link: '+
    link;

  if(type==='copy'){

    if(navigator.clipboard){

      navigator.clipboard.writeText(link)
        .then(()=>{
          alert('Invitation link copied');
        })
        .catch(()=>{
          prompt('Copy this invitation link:',link);
        });

    }else{

      prompt('Copy this invitation link:',link);

    }

    return;
  }

  if(type==='whatsapp'){

    window.open(
      'https://wa.me/?text='+
      encodeURIComponent(text),
      '_blank'
    );

    return;
  }

  if(type==='telegram'){

    window.open(
      'https://t.me/share/url?url='+
      encodeURIComponent(link)+
      '&text='+
      encodeURIComponent('Join ACPay using my invitation link'),
      '_blank'
    );

    return;
  }

  if(type==='facebook'){

    window.open(
      'https://www.facebook.com/sharer/sharer.php?u='+
      encodeURIComponent(link),
      '_blank'
    );

    return;
  }

}


/* MY ASSET TOTALS */

async function loadMyAsset(){

  try{

    const me=await req('/me',{
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    const data=await req('/transactions/'+me.user.id,{
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    const transactions=data.transactions||[];

    const payments=await req('/payments',{
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    const paymentList=payments.payments||[];

    const totalDepositFromPayments=paymentList
      .filter(p=>
        String(p.user_id||'')===String(me.user.id) &&
        p.status==='approved'
      )
      .reduce((sum,p)=>sum+Number(p.amount||0),0);

    const totalDepositFromAdmin=transactions
      .filter(t=>t.type==='admin_deposit')
      .reduce((sum,t)=>sum+Number(t.amount||0),0);

    // Approved USDT deposits
    let totalDepositFromUSDT=0;

    try{

      const usdtRequests=await req('/usdt/my-deposits',{
        headers:{
          Authorization:'Bearer '+localStorage.token
        }
      });

      const usdtList=usdtRequests.deposits||[];

      totalDepositFromUSDT=usdtList
        .filter(d=>
          String(d.user_id||'')===String(me.user.id) &&
          d.status==='approved'
        )
        .reduce((sum,d)=>{
          const usdtAmount=Number(d.amount||0);
          const inrAmount=
            d.inr_amount!=null
              ? Number(d.inr_amount)
              : usdtAmount*118;

          return sum+inrAmount;
        },0);

    }catch(usdtError){

      console.error('My Asset USDT load:',usdtError);

    }

    const totalDeposit=
      totalDepositFromPayments+
      totalDepositFromAdmin+
      totalDepositFromUSDT;

    const totalWithdraw=transactions
      .filter(t=>
        t.type==='upi_withdraw' ||
        t.type==='admin_withdraw'
      )
      .reduce((sum,t)=>sum+Number(t.amount||0),0);

    const totalCommission=transactions
      .filter(t=>
        t.type==='referral_b_commission' ||
        t.type==='referral_c_commission'
      )
      .reduce((sum,t)=>sum+Number(t.amount||0),0);

    const deposit=document.getElementById('myAssetDeposit');
    if(deposit){
      deposit.textContent='₹ '+totalDeposit.toFixed(2);
    }

    const withdraw=document.getElementById('myAssetWithdraw');
    if(withdraw){
      withdraw.textContent='₹ '+totalWithdraw.toFixed(2);
    }

    const commission=document.getElementById('myAssetCommission');
    if(commission){
      commission.textContent='₹ '+totalCommission.toFixed(2);
    }

  }catch(e){

    console.error('My Asset load error:',e);

  }

}

/* BOTTOM NAVIGATION */

let bottomNavigation=false;

async function openBottomPage(page){

  try{

    bottomNavigation=true;

    const nav=document.getElementById('nav');
    if(nav){
      const buttons=nav.querySelectorAll('button');
      const pages=['home','payment','usdtDeposit','statistics','my'];

      buttons.forEach((button,index)=>{
        button.classList.toggle('nav-active',pages[index]===page);
      });
    }

    if(page==='home'){

      show('home',false);

    }else if(page==='payment'){

      await openMainPayment();

    }else if(page==='usdtDeposit'){

      await openUSDTDeposit();

    }else if(page==='statistics'){

      await openStatistics();

    }else if(page==='my'){

      show('my',false);
      await loadMyAsset();

    }

    /* Bottom navigation replaces the current page.
       Therefore Back returns to the page before the current flow. */
    history.replaceState({page:page},'','#'+page);

  }catch(e){

    console.error('Bottom navigation error:',e);
    alert(e.message||'Page open nahi ho paya');

  }finally{

    bottomNavigation=false;

  }
}


/* COMMON */

let restoringPage=false;









function show(id, addHistory=true){

 if(restoringPage || bottomNavigation) addHistory=false;

 const sections=[
  'login',
  'register',
  'adminLogin',
  'home',
  'payment',
  'deposit',
  'usdtDeposit',
  'withdrawal',
  'balanceDetails',
  'tasks',
  'statistics',
  'my',
  'team',
  'admin'
 ];

 sections.forEach(x=>{
  const el=document.getElementById(x);
  if(el) el.classList.add('hidden');
 });

 const target=document.getElementById(id);

 if(target) target.classList.remove('hidden');

 // Open every section from the top
 window.scrollTo(0,0);

 const nav=document.getElementById('nav');

 if(id==='home'||id==='payment'||id==='usdtDeposit'||id==='withdrawal'||id==='tasks'||id==='statistics'||id==='my'){
  nav.classList.remove('hidden');
 }else{
  nav.classList.add('hidden');
 }

 if(addHistory){
  history.pushState({page:id},'', '#'+id);
 }
}


/* BROWSER BACK BUTTON */

window.addEventListener('popstate',async function(e){

 const page=e.state && e.state.page
  ? e.state.page
  :'home';

 if(page==='login' && localStorage.getItem('token')){
  show('home',false);
  history.replaceState({page:'home'},'','#home');
  return;
 }

 try{
  restoringPage=true;

  if(page==='deposit'){
    await openDeposit();
  }else if(page==='payment'){
    await openMainPayment();
  }else if(page==='usdtDeposit'){
    await openUSDTDeposit();
  }else if(page==='withdrawal'){
    await openWithdrawal();
  }else if(page==='statistics'){
    await openStatistics();
  }else if(page==='team'){
    await openTeam(true);
  }else{
    show(page,false);
  }

 }catch(err){
  console.error('Back navigation error:',err);
  show('home',false);
 }finally{
  restoringPage=false;
 }

});


/* RESTORE PAGE AFTER REFRESH */

window.addEventListener('DOMContentLoaded',async function(){

  restoringPage=true;

  if(localStorage.getItem('adminToken')){
    adminToken=localStorage.getItem('adminToken');
    show('admin',false);
    await loadAdminDashboard();
    await loadAdminPayments();
    document.body.classList.remove('ac-loading');
    return;
  }

  if(localStorage.getItem('token')){
    await loadMe();
  }else{
    show('login',false);
    history.replaceState({page:'login'},'','#login');
  }

  restoringPage=false;
  document.body.classList.remove('ac-loading');

});


/* API */

async function req(path,options={}){

 const response=await fetch(API+path,options);

 const data=await response
  .json()
  .catch(()=>({}));

 if(!response.ok)
  throw Error(data.error||'Request failed');

 return data;
}


/* USER REGISTER */

function getReferralCodeFromUrl(){

  const hash=location.hash||'';

  const q=hash.indexOf('?');

  if(q===-1) return '';

  const params=new URLSearchParams(
    hash.substring(q+1)
  );

  return params.get('ref')||'';
}


async function register(){

 try{

  const referralCode=getReferralCodeFromUrl();

  await req('/register',{
   method:'POST',
   headers:{
    'Content-Type':'application/json'
   },
   body:JSON.stringify({
    username:document.getElementById('ru').value,
    password:document.getElementById('rp').value,
    referral_code:referralCode
   })
  });

  alert(
    referralCode
      ? 'Registered through referral. Please login.'
      : 'Registered. Please login.'
  );

  show('login');

 }catch(e){
  alert(e.message);
 }
}


/* USER LOGIN */

async function login(){

 try{

  const data=await req('/login',{
   method:'POST',
   headers:{
    'Content-Type':'application/json'
   },
   body:JSON.stringify({
    username:document.getElementById('lu').value,
    password:document.getElementById('lp').value
   })
  });

  localStorage.token=data.token;

  await loadMe();

 }catch(e){
  alert(e.message);
 }
}


/* LOAD USER */

async function loadMe(){

 if(!localStorage.token){
  show('login');
  return;
 }

 try{

  const data=await req('/me',{
   headers:{
    Authorization:'Bearer '+localStorage.token
   }
  });

  document.getElementById('user').textContent=
   'Welcome, '+data.user.username;

  document.getElementById('userIdDisplay').textContent=
   'User ID: '+data.user.id;

  const dashboardUsername=document.getElementById('dashboardUsername');
  if(dashboardUsername){
    dashboardUsername.textContent=data.user.username;
  }

  const dashboardUserId=document.getElementById('dashboardUserId');
  if(dashboardUserId){
    dashboardUserId.textContent='ID: '+data.user.id;
  }

  const dashboardAvatar=document.getElementById('dashboardAvatar');
  if(dashboardAvatar){
    dashboardAvatar.textContent=
      String(data.user.username||'U').charAt(0).toUpperCase();
  }

  document.getElementById('balance').textContent=
   data.user.balance;

const savedPage=location.hash
  ?location.hash.substring(1)
  :'home';

if(savedPage==='deposit'){
  await openDeposit();
  history.replaceState({page:'deposit'},'','#deposit');
}else if(savedPage==='balanceDetails'){
  await openBalanceDetails();
  history.replaceState({page:'balanceDetails'},'','#balanceDetails');
}else if(savedPage==='order'){
  await openOrder();
  history.replaceState({page:'order'},'','#order');
}else if(savedPage==='payment'){
  await openPayment();
  history.replaceState({page:'payment'},'','#payment');
}else if(savedPage==='usdtDeposit'){
  await openUSDTDeposit();
  history.replaceState({page:'usdtDeposit'},'','#usdtDeposit');
}else if(savedPage==='withdrawal'){
  await openWithdrawal();
  history.replaceState({page:'withdrawal'},'','#withdrawal');
}else if(savedPage==='tasks'){
  show('tasks',false);
  history.replaceState({page:'tasks'},'','#tasks');
}else if(savedPage==='statistics'){
  await openStatistics();
  history.replaceState({page:'statistics'},'','#statistics');
}else if(savedPage==='my'){
  show('my',false);
  await loadMyAsset();
  history.replaceState({page:'my'},'','#my');
}else if(savedPage==='team'){
  await openTeam();
  history.replaceState({page:'team'},'','#team');
}else{
  show('home',false);
  history.replaceState({page:'home'},'','#home');
}
 }catch(e){

  localStorage.removeItem('token');
  show('login');

 }
}


/* USER LOGOUT */

function logout(){

 localStorage.removeItem('token');

 currentPayment=null;

 show('login');
}


/* PAYMENT */

let paymentTabName='buy';
let paymentCache=[];
let paymentTimer=null;


/* PAYMENT MAIN */

async function openUSDTDeposit(){
  try{
    const data = await req('/usdt/settings',{
      headers:{Authorization:'Bearer '+localStorage.token}
    });

    document.getElementById('userUSDTWallet').value =
      data.wallet_address || '';

    document.getElementById('userUSDTAmount').value = '';

    show('usdtDeposit');
  }catch(e){
    alert(e.message || 'USDT settings load nahi ho payi');
  }
}

function copyUserUSDTWallet(){
  const input=document.getElementById('userUSDTWallet');

  if(!input.value){
    alert('USDT wallet address available nahi hai');
    return;
  }

  navigator.clipboard.writeText(input.value)
    .then(()=>alert('USDT wallet address copied'))
    .catch(()=>{
      input.select();
      document.execCommand('copy');
      alert('USDT wallet address copied');
    });
}

function updateUSDTINRCalculation(){

  const input=document.getElementById('userUSDTAmount');
  const result=document.getElementById('usdtINRCalculation');

  if(!input || !result) return;

  const amount=Number(input.value)||0;
  const rate=118;
  const inr=amount*rate;

  result.textContent=
    `You will receive ₹${inr.toFixed(2)} in your wallet (${amount} × ₹${rate})`;
}


async function submitUSDTDeposit(){
  const input=document.getElementById('userUSDTAmount');
  const amount=Number(input.value);

  if(!Number.isFinite(amount) || amount<=0){
    alert('Deposit amount enter karo');
    return;
  }

  const warning=document.getElementById('usdtAmountWarning');

  if(amount < 5){
    warning.textContent='Minimum deposit 5 USDT';
    warning.style.display='block';
    return;
  }

  if(amount > 10){
    warning.textContent='Maximum deposit 10 USDT';
    warning.style.display='block';
    return;
  }

  warning.style.display='none';

  try{
    const data=await req('/usdt/deposit',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:'Bearer '+localStorage.token
      },
      body:JSON.stringify({amount})
    });

    alert(data.message || 'USDT deposit request submitted');
    input.value='';
  }catch(e){
    alert(e.message || 'Deposit submit nahi ho paya');
  }
}

async function openPayment(){

  show('payment');

  document.getElementById('proofBox').classList.add('hidden');

  try{

    const [data,me]=await Promise.all([
      req('/payments',{
        headers:{
          Authorization:'Bearer '+localStorage.token
        }
      }),

      req('/me',{
        headers:{
          Authorization:'Bearer '+localStorage.token
        }
      })
    ]);

    paymentCache=data.payments||[];

    document.getElementById('paymentBalance').textContent=
      '₹'+Number(
        me.user ? me.user.balance : me.balance || 0
      ).toFixed(2);

    document.getElementById('paymentReward').textContent=
      '₹0.00';

    const pending=paymentCache
      .filter(x=>x.status==='pending_review')
      .reduce((sum,x)=>sum+Number(x.amount||0),0);

    document.getElementById('paymentPending').textContent=
      '₹'+pending.toFixed(2);

    paymentTab(paymentTabName);

  }catch(e){

    alert(e.message);

  }
}


/* PAYMENT TABS */

function paymentTab(tab){

  paymentTabName=tab;

  const buttons={
    buy:document.getElementById('tabBuy'),
    active:document.getElementById('tabActive'),
    recent:document.getElementById('tabRecent')
  };

  Object.keys(buttons).forEach(k=>{
    buttons[k].style.margin='0';

    if(k===tab){
      buttons[k].style.background='#7c3aed';
      buttons[k].style.color='#fff';
    }else{
      buttons[k].style.background='#eee';
      buttons[k].style.color='#333';
    }
  });

  const container=document.getElementById('paymentOrders');
  container.innerHTML='';

  let list=[];

  if(tab==='buy'){

    // Admin-created orders which nobody has claimed yet.
    list=paymentCache.filter(x=>
      x.status==='active' &&
      !x.user_id
    );

  }else if(tab==='active'){

    // Orders currently claimed by this user.
    list=paymentCache.filter(x=>
      x.status==='claimed'
    );

  }else{

    // Finished / cancelled / expired / pending orders.
    list=paymentCache.filter(x=>
      x.status==='pending_review' ||
      x.status==='cancelled' ||
      x.status==='expired' ||
      x.status==='approved' ||
      x.status==='rejected'
    );

  }

  if(list.length===0){

    document.getElementById('noPayment').textContent=
      tab==='buy'
        ? 'No payment orders available.'
        : tab==='active'
          ? 'No active orders.'
          : 'No recent orders.';

    document.getElementById('noPayment').classList.remove('hidden');

    return;

  }

  document.getElementById('noPayment').classList.add('hidden');

  list.sort((a,b)=>
    new Date(b.created_at||0)-new Date(a.created_at||0)
  );

  list.forEach(payment=>{
    renderPaymentCard(payment,tab,container);
  });
}


/* PAYMENT CARD */

function renderPaymentCard(payment,tab,container){

  const status=payment.status||'active';
  const id=String(payment.id);
  const amount=Number(payment.amount||0);

  const income=Number(
    payment.income!==undefined
      ? payment.income
      : amount*0.085
  );

  const card=document.createElement('div');

  card.className='card';
  card.style.padding='14px';

  let action='';

  if(tab==='buy'){

    action=`
      <button class="green"
        onclick='selectPayment(${JSON.stringify(id)})'>
        Buy
      </button>
    `;

  }else if(tab==='active'){

    action=`
      <button
        onclick='selectPayment(${JSON.stringify(id)})'>
        Continue Payment
      </button>
    `;

  }else{

    let label='';

    if(status==='pending_review'){
      label='Pending Review';
    }else if(status==='cancelled'){
      label='Cancelled';
    }else if(status==='expired'){
      label='Expired';
    }else if(status==='approved'){
      label='Approved';
    }else if(status==='rejected'){
      label='Rejected';
    }

    action=`
      <button disabled>
        ${label}
      </button>
    `;
  }

  card.innerHTML=`

    <div style="display:flex;justify-content:space-between;align-items:center">
      <strong>Order #${id.slice(-6)}</strong>

      <span class="status ${status}">
        ${status.replace('_',' ')}
      </span>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:10px">
      <span class="small">Amount</span>
      <strong>₹${amount.toFixed(2)}</strong>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:5px">
      <span class="small">Income 8.5%</span>
      <strong>₹${income.toFixed(2)}</strong>
    </div>

    ${status==='pending_review'
      ? `<div class="small" style="margin-top:7px">
           Pending amount: ₹${amount.toFixed(2)}
         </div>`
      : ''}

    ${action}
  `;

  container.appendChild(card);
}


/* BUY / CLAIM */

async function selectPayment(id){

  try{

    const claim=await req('/payments/'+id+'/claim',{
      method:'POST',
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    currentPayment=claim.payment;

    paymentTabName='active';

    showProof();

    await openPayment();

    // Re-open details after refresh.
    currentPayment=claim.payment;
    showProof();

  }catch(e){

    // If already claimed by this same user, continue it.
    try{

      const data=await req('/payments',{
        headers:{
          Authorization:'Bearer '+localStorage.token
        }
      });

      const payment=(data.payments||[]).find(
        x=>String(x.id)===String(id)
      );

      if(payment && payment.status==='claimed'){

        currentPayment=payment;
        paymentTabName='active';
        showProof();

        return;
      }

    }catch(ignore){}

    alert(e.message);
    await openPayment();
  }
}


/* COPY UPI */

async function copyUPI(){

  const input=document.getElementById('upiId');
  const value=input.value;

  if(!value){
    alert('UPI ID not available');
    return;
  }

  try{

    await navigator.clipboard.writeText(value);
    alert('UPI ID copied');

  }catch(e){

    input.select();
    document.execCommand('copy');
    alert('UPI ID copied');

  }
}


/* SHOW DETAILS + TIMER */

function showProof(){

  if(!currentPayment){
    alert('Payment order not available');
    return;
  }

  document.getElementById('proofBox')
    .classList.remove('hidden');

  document.getElementById('upiId').value=
    currentPayment.upi_id||'';

  const amount=Number(currentPayment.amount||0);

  document.getElementById('proofAmount').textContent=
    '₹'+amount.toFixed(2);

  document.getElementById('proofIncome').textContent=
    '₹'+Number(
      currentPayment.income!==undefined
        ? currentPayment.income
        : amount*0.085
    ).toFixed(2);

  document.getElementById('proofCode').textContent=
    currentPayment.code||'-';

  document.getElementById('screenshot').value='';
  document.getElementById('preview').style.display='none';

  clearInterval(paymentTimer);

  const expiresAt=
    new Date(currentPayment.expires_at).getTime();

  if(isNaN(expiresAt)){

    document.getElementById('countdown').textContent=
      'Expire in 15:00';

    return;
  }

  function updateTimer(){

    const left=Math.max(
      0,
      expiresAt-Date.now()
    );

    const minutes=Math.floor(left/60000);
    const seconds=Math.floor(
      (left%60000)/1000
    );

    document.getElementById('countdown').textContent=
      'Expire in '+
      String(minutes).padStart(2,'0')+
      ':'+
      String(seconds).padStart(2,'0');

    if(left<=0){

      clearInterval(paymentTimer);

      document.getElementById('countdown').textContent=
        'Expired';

      document.getElementById('proofBox')
        .classList.add('hidden');

      currentPayment=null;

      openPayment();
    }
  }

  updateTimer();

  paymentTimer=setInterval(
    updateTimer,
    1000
  );

  window.scrollTo({
    top:document.body.scrollHeight,
    behavior:'smooth'
  });
}


/* CANCEL */

async function cancelProof(){

  if(!currentPayment){
    document.getElementById('proofBox')
      .classList.add('hidden');
    return;
  }

  if(currentPayment.status!=='claimed'){
    document.getElementById('proofBox')
      .classList.add('hidden');
    return;
  }

  if(!confirm('Cancel this payment order?')){
    return;
  }

  try{

    await req(
      '/payments/'+currentPayment.id+'/cancel',
      {
        method:'POST',
        headers:{
          Authorization:'Bearer '+localStorage.token
        }
      }
    );

    clearInterval(paymentTimer);

    currentPayment=null;

    document.getElementById('proofBox')
      .classList.add('hidden');

    paymentTabName='recent';

    await openPayment();

  }catch(e){

    alert(e.message);

  }
}


/* PREVIEW */

function previewImage(event){

  const file=event.target.files[0];

  if(!file)return;

  const preview=
    document.getElementById('preview');

  preview.src=
    URL.createObjectURL(file);

  preview.style.display='block';
}


/* SUBMIT PROOF */

async function submitProof(){

  if(!currentPayment){
    alert('Payment order not available');
    return;
  }

  const file=
    document.getElementById('screenshot')
      .files[0];

  if(!file){
    alert('Please select payment screenshot');
    return;
  }

  if(file.size>5*1024*1024){
    alert('Screenshot must be below 5 MB');
    return;
  }

  const form=new FormData();

  form.append(
    'screenshot',
    file
  );

  try{

    const data=await req(
      '/payments/'+currentPayment.id+'/proof',
      {
        method:'POST',
        headers:{
          Authorization:'Bearer '+localStorage.token
        },
        body:form
      }
    );

    clearInterval(paymentTimer);

    alert(
      data.message||
      'Payment proof submitted successfully'
    );

    currentPayment=null;

    document.getElementById('proofBox')
      .classList.add('hidden');

    paymentTabName='recent';

    await openPayment();

  }catch(e){

    alert(e.message);

  }
}

/* ADMIN LOGIN */

async function loadAdminDashboard(){

  if(!adminToken)return;

  try{

    const data=await req('/admin/dashboard',{
      headers:{
        Authorization:'Bearer '+adminToken
      }
    });

    document.getElementById('adminTotalUsers').textContent=
      Number(data.totalUsers||0);

    document.getElementById('adminTotalBalance').textContent=
      '₹'+Number(data.totalBalance||0).toFixed(2);

    document.getElementById('adminPendingOrders').textContent=
      Number(data.pendingOrders||0);

    document.getElementById('adminPendingWithdrawals').textContent=
      Number(data.pendingWithdrawals||0);

  }catch(e){

    console.error('Admin dashboard:',e.message);

  }

}

function adminTab(tab){

  const tabs=[
    'dashboard',
    'upi',
    'usdt',
    'withdraw',
    'users'
  ];

  const tabIds={
    dashboard:{section:'adminDashboardTab',button:'adminTabDashboard'},
    upi:{section:'adminUPITab',button:'adminTabUPI'},
    usdt:{section:'adminUSDTTab',button:'adminTabUSDT'},
    withdraw:{section:'adminWithdrawTab',button:'adminTabWithdraw'},
    users:{section:'adminUsersTab',button:'adminTabUsers'}
  };

  tabs.forEach(x=>{

    const el=document.getElementById(tabIds[x].section);

    if(el) el.classList.add('hidden');

    const btn=document.getElementById(tabIds[x].button);

    if(btn){
      btn.style.background='#eee';
      btn.style.color='#333';
    }

  });

  const section=document.getElementById(tabIds[tab].section);

  if(section){
    section.classList.remove('hidden');
  }

  const activeBtn=document.getElementById(tabIds[tab].button);

  if(activeBtn){
    activeBtn.style.setProperty('background','#7c3aed','important');
    activeBtn.style.setProperty('color','#fff','important');
  }

  if(tab==='dashboard'){
    loadAdminDashboard();
  }

  if(tab==='upi'){
    loadAdminPayments();
    loadAdminWithdrawals();
  }

  if(tab==='usdt'){
    loadAdminUSDTDeposits();
  }

}

async function loadAdminWithdrawals(){
  const box=document.getElementById('adminWithdrawals');

  if(!box) return;

  box.innerHTML='Loading...';

  try{
    const data=await req('/admin/withdrawals',{
      headers:{
        Authorization:'Bearer '+adminToken
      }
    });

    const users=data.withdrawals||[];

    if(!users.length){
      box.innerHTML='<div class="msg">Koi UPI withdrawal ON user nahi hai.</div>';
      return;
    }

    box.innerHTML=users.map(u=>`
      <div class="card" style="margin-top:10px;">
        <b>${escapeHtml(u.username)}</b>

        <div class="small" style="margin-top:6px;">
          User ID: ${escapeHtml(u.id)}
        </div>

        <div class="small">
          UPI: ${escapeHtml(u.upi_id)}
        </div>

        <div style="margin-top:8px;">
          Balance:
          <b>₹${Number(u.balance||0).toFixed(2)}</b>
        </div>

        <input
          id="withdrawAmount_${u.id}"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Deduct amount"
          style="margin-top:10px;"
        >

        <input
          id="withdrawReason_${u.id}"
          placeholder="Reason e.g. Send to UPI"
        >

        <button
          onclick="deductAdminWithdrawal('${u.id}')"
          style="width:100%;margin-top:8px;"
        >
          Deduct Balance
        </button>
      </div>
    `).join('');

  }catch(e){
    box.innerHTML=
      '<div class="msg">'+escapeHtml(e.message||'Could not load withdrawals')+'</div>';
  }
}


async function deductAdminWithdrawal(id){

  const amountInput=document.getElementById(
    'withdrawAmount_'+id
  );

  const reasonInput=document.getElementById(
    'withdrawReason_'+id
  );

  const amount=Number(amountInput.value);
  const reason=reasonInput.value.trim();

  if(!Number.isFinite(amount) || amount<=0){
    alert('Valid amount enter karo');
    return;
  }

  if(!reason){
    alert('Reason enter karo');
    return;
  }

  try{

    const data=await req('/admin/withdrawals/'+id+'/deduct',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:'Bearer '+adminToken
      },
      body:JSON.stringify({
        amount,
        reason
      })
    });

    alert(data.message||'Balance deducted');

    await loadAdminWithdrawals();

  }catch(e){
    alert(e.message||'Balance deduct nahi ho paya');
  }
}


function withdrawTab(tab){

  const upi=document.getElementById('adminUPIWithdrawList');
  const usdt=document.getElementById('adminUSDTWithdrawList');

  const upiBtn=document.getElementById('withdrawUPITab');
  const usdtBtn=document.getElementById('withdrawUSDTTab');

  if(tab==='upi'){

    loadAdminWithdrawals();

    upi.classList.remove('hidden');
    usdt.classList.add('hidden');

    upiBtn.style.background='#7c3aed';
    upiBtn.style.color='#fff';

    usdtBtn.style.background='#eee';
    usdtBtn.style.color='#333';

  }else{

    upi.classList.add('hidden');
    usdt.classList.remove('hidden');

    usdtBtn.style.background='#7c3aed';
    usdtBtn.style.color='#fff';

    upiBtn.style.background='#eee';
    upiBtn.style.color='#333';

  }

}

function copyAdminUSDTWallet(){

  const input=document.getElementById('adminUSDTWallet');

  if(!input.value){
    alert('Wallet address empty');
    return;
  }

  navigator.clipboard.writeText(input.value)
    .then(()=>alert('Wallet address copied'))
    .catch(()=>{
      input.select();
      document.execCommand('copy');
      alert('Wallet address copied');
    });

}

async function saveUSDTSettings(){

  const wallet=document.getElementById('adminUSDTWallet').value.trim();

  const min=Number(
    document.getElementById('adminUSDTMin').value
  );

  const max=Number(
    document.getElementById('adminUSDTMax').value
  );

  if(!wallet){
    alert('USDT wallet address enter karo');
    return;
  }

  if(min<5 || max>10 || min>max){
    alert('USDT limit 5 se 10 ke beech hona chahiye');
    return;
  }

  if(!adminToken){
    alert('Admin login required');
    return;
  }

  try{

    const data=await req('/admin/usdt/settings',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:'Bearer '+adminToken
      },
      body:JSON.stringify({
        wallet_address:wallet,
        min:min,
        max:max
      })
    });

    if(data.error){
      throw new Error(data.error);
    }

    alert('USDT settings saved successfully');

  }catch(e){

    console.error('USDT settings:',e);
    alert(e.message||'USDT settings save failed');

  }
}

async function loadAdminUSDTDeposits(){

  const box=document.getElementById('adminUSDTDeposits');

  if(!box) return;

  box.innerHTML='Loading...';

  if(!adminToken){
    box.innerHTML='<div class="msg">Admin login required.</div>';
    return;
  }

  try{

    const data=await req('/admin/usdt/deposits',{
      headers:{
        Authorization:'Bearer '+adminToken
      }
    });

    const deposits=data.deposits||[];

    if(!deposits.length){
      box.innerHTML='<div class="msg">No USDT deposit requests yet.</div>';
      return;
    }

    box.innerHTML=deposits.map(d=>{

      const usdt=Number(d.amount||0);
      const inr=Number(
        d.inr_amount!=null
          ? d.inr_amount
          : usdt*118
      );

      let action='';

      if(d.status==='pending'){

        action=`
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button
              class="green"
              onclick="changeAdminUSDTStatus('${d.id}','approved')">
              Approve
            </button>

            <button
              class="red"
              onclick="changeAdminUSDTStatus('${d.id}','rejected')">
              Reject
            </button>
          </div>
        `;

      }else{

        action=`
          <div class="small" style="margin-top:10px;">
            Status: <b>${escapeHtml(d.status)}</b>
          </div>
        `;

      }

      return `
        <div class="card" style="margin-top:10px;">

          <b>${escapeHtml(d.username||'Unknown')}</b>

          <div class="small" style="margin-top:6px;">
            User ID: ${escapeHtml(d.user_id)}
          </div>

          <div style="margin-top:8px;">
            <b>${usdt.toFixed(2)} USDT</b>
            → <b>₹${inr.toFixed(2)}</b>
          </div>

          <div class="small" style="margin-top:6px;">
            Rate: ₹118 / USDT
          </div>

          <div class="small">
            Date: ${new Date(d.created_at).toLocaleString()}
          </div>

          ${action}

        </div>
      `;

    }).join('');

  }catch(e){

    console.error('Admin USDT deposits:',e);
    box.innerHTML='<div class="msg">USDT deposits load failed.</div>';

  }
}

async function changeAdminUSDTStatus(id,status){

  if(!adminToken){
    alert('Admin login required');
    return;
  }

  const action=status==='approved' ? 'approve' : 'reject';

  if(!confirm('Are you sure you want to '+action+' this USDT deposit?')){
    return;
  }

  try{

    const data=await req(
      '/admin/usdt/deposits/'+encodeURIComponent(id)+'/status',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:'Bearer '+adminToken
        },
        body:JSON.stringify({status})
      }
    );

    if(data.error){
      throw new Error(data.error);
    }

    if(status==='approved'){

      alert(
        'USDT approved: '+Number(data.usdt_amount||0).toFixed(2)+
        ' USDT = ₹'+Number(data.inr_amount||0).toFixed(2)+
        ' added to balance'
      );

    }else{

      alert('USDT deposit rejected');

    }

    await loadAdminUSDTDeposits();

    if(typeof loadAdminDashboard==='function'){
      await loadAdminDashboard();
    }

  }catch(e){

    console.error('Admin USDT status:',e);
    alert(e.message||'USDT status update failed');

  }
}

async function searchAdminUser(){

  const id=document.getElementById(
    'adminUserSearch'
  ).value.trim();

  if(!id){
    alert('User ID enter karo');
    return;
  }

  if(!adminToken){
    alert('Admin login required');
    return;
  }

  const box=document.getElementById('adminUserResult');
  box.innerHTML='<div class="msg">Searching...</div>';

  try{

    const data=await req(
      '/admin/users/'+encodeURIComponent(id),
      {
        headers:{
          Authorization:'Bearer '+adminToken
        }
      }
    );

    const u=data.user;

    box.innerHTML=`
      <div class="card">
        <strong>User ID</strong>
        <div>${escapeHtml(u.id)}</div>

        <br>

        <strong>Username</strong>
        <div>${escapeHtml(u.username)}</div>

        <br>

        <strong>Balance</strong>
        <div id="adminUserBalance">₹${Number(u.balance||0).toFixed(2)}</div>

        <br>

        <input
          id="adminBalanceAmount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Balance amount"
        >

        <button
          class="green"
          onclick="changeAdminBalance('${u.id}','add')">
          Add Balance
        </button>

        <button
          class="red"
          onclick="changeAdminBalance('${u.id}','remove')">
          Remove Balance
        </button>

        <br><br>

        <h3 style="margin:10px 0;">Withdrawal History</h3>
        <div id="adminUserWithdrawalHistory">
          Loading...
        </div>

      </div>
    `;

    loadAdminUserWithdrawalHistory(u.id);

  }catch(e){

    box.innerHTML=
      '<div class="msg">'+
      escapeHtml(e.message)+
      '</div>';

  }

}

async function loadAdminUserWithdrawalHistory(userId){
  const box=document.getElementById('adminUserWithdrawalHistory');
  if(!box) return;

  try{
    const data=await req('/admin/transactions/'+encodeURIComponent(userId),{
      headers:{Authorization:'Bearer '+adminToken}
    });

    const list=(data.transactions||[]).filter(t=>t.type==='upi_withdraw');

    if(!list.length){
      box.innerHTML='<div class="msg">No withdrawal history yet.</div>';
      return;
    }

    box.innerHTML=list.map(t=>{
      const d=new Date(t.created_at);
      return `
        <div style="
          padding:12px 4px;
          border-bottom:1px solid #eee;
        ">
          <div style="
            font-size:24px;
            font-weight:800;
            color:#dc2626;
          ">-₹${Number(t.amount||0).toFixed(2)}</div>

          <div class="small" style="margin-top:4px;">
            ${escapeHtml(t.reason||'Withdrawal')}
          </div>

          <div class="small" style="margin-top:4px;">
            ${d.toLocaleTimeString()} &nbsp; ${d.toLocaleDateString()}
          </div>

          <div class="small" style="margin-top:5px;">
            Balance: ₹${Number(t.balance_before||0).toFixed(2)}
            → ₹${Number(t.balance_after||0).toFixed(2)}
          </div>
        </div>
      `;
    }).join('');

  }catch(e){
    box.innerHTML='<div class="msg">'+escapeHtml(
      e.message||'History load nahi ho payi'
    )+'</div>';
  }
}

async function changeAdminBalance(id,action){

  if(!adminToken){
    alert('Admin login required');
    return;
  }

  const input=document.getElementById('adminBalanceAmount');
  const amount=Number(input.value);

  if(!Number.isFinite(amount)||amount<=0){
    alert('Valid amount enter karo');
    return;
  }

  try{

    const data=await req(
      '/admin/users/'+encodeURIComponent(id)+'/balance',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:'Bearer '+adminToken
        },
        body:JSON.stringify({
          action,
          amount
        })
      }
    );

    document.getElementById('adminUserBalance').textContent=
      '₹'+Number(data.user.balance||0).toFixed(2);

    input.value='';

    alert(
      action==='add'
        ? 'Balance added successfully'
        : 'Balance removed successfully'
    );

  }catch(e){
    alert(e.message);
  }

}

async function adminLogin(){

 const username=
  document.getElementById('au').value;

 const password=
  document.getElementById('ap').value;

 try{

  const data=await req('/admin/login',{
   method:'POST',
   headers:{
    'Content-Type':'application/json'
   },
   body:JSON.stringify({
    username,
    password
   })
  });

  adminToken=data.token;
  localStorage.setItem('adminToken',adminToken);

  show('admin');

  await loadAdminDashboard();
  await loadAdminPayments();

 }catch(e){

  alert(e.message);

 }
}


/* CREATE PAYMENT */


async function loadWithdrawalHistory(){
  const box=document.getElementById('withdrawalHistory');
  if(!box) return;

  box.innerHTML='Loading...';

  try{
    const data=await req('/transactions/'+encodeURIComponent(
      document.getElementById('userIdDisplay').textContent.replace('User ID: ','')
    ),{
      headers:{Authorization:'Bearer '+localStorage.token}
    });

    const list=(data.transactions||[]).filter(t=>t.type==='upi_withdraw');

    if(!list.length){
      box.innerHTML='<div class="msg">No withdrawal history yet.</div>';
      return;
    }

    box.innerHTML=list.map(t=>{
      const d=new Date(t.created_at);
      return `
        <div style="
          padding:14px 4px;
          border-bottom:1px solid #eee;
        ">
          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
          ">
            <div>
              <div style="
                font-size:26px;
                font-weight:800;
                color:#dc2626;
              ">-₹${Number(t.amount||0).toFixed(2)}</div>

              <div class="small" style="margin-top:5px;">
                ${escapeHtml(t.reason||'Withdrawal')}
              </div>
            </div>

            <div style="
              text-align:right;
              font-size:12px;
              color:#666;
              white-space:nowrap;
            ">
              ${d.toLocaleTimeString()}<br>
              ${d.toLocaleDateString()}
            </div>
          </div>

        </div>
      `;
    }).join('');

  }catch(e){
    box.innerHTML='<div class="msg">'+escapeHtml(
      e.message||'History load nahi ho payi'
    )+'</div>';
  }
}

async function openWithdrawal(){

  try{

    const data=await req('/me',{
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    const balanceEl=document.getElementById('withdrawBalance');
    if(balanceEl){
      balanceEl.textContent=Number(data.user.balance||0).toFixed(2);
    }

    const input=document.getElementById('withdrawUpi');
    if(input){
      input.value=data.user.upi_id||'';
    }

    const saved=document.getElementById('withdrawUpiSaved');
    if(saved){
      if(data.user.upi_id){
        saved.classList.remove('hidden');
      }else{
        saved.classList.add('hidden');
      }
    }

    const btn=document.getElementById('withdrawToggle');
    const text=document.getElementById('withdrawToggleText');

    const isOn=data.user.withdrawal_enabled===true;

    btn.dataset.on=isOn?'true':'false';
    btn.classList.toggle('on',isOn);

    const label=btn.querySelector('.switch-label');
    if(label){
      label.textContent=isOn?'ON':'OFF';
    }

    if(text){
      text.textContent=isOn?'ON':'OFF';
    }

    show('withdrawal');
  loadWithdrawalHistory();

  }catch(e){
    alert(e.message);
  }
}

async function saveWithdrawUpi(){

  const input=document.getElementById('withdrawUpi');
  const upi=input.value.trim();

  if(!upi){
    alert('UPI ID enter karo');
    return;
  }

  try{

    await req('/withdrawal/settings',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:'Bearer '+localStorage.token
      },
      body:JSON.stringify({
        upi_id:upi
      })
    });

    document.getElementById('withdrawUpiSaved')
      .classList.remove('hidden');

    alert('UPI ID saved successfully');

  }catch(e){
    alert(e.message);
  }
}

async function toggleWithdrawal(){

  const btn=document.getElementById('withdrawToggle');
  const text=document.getElementById('withdrawToggleText');

  const isOn=btn.dataset.on==='true';
  const next=!isOn;

  try{

    await req('/withdrawal/settings',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:'Bearer '+localStorage.token
      },
      body:JSON.stringify({
        withdrawal_enabled:next
      })
    });

    btn.dataset.on=next?'true':'false';
    btn.classList.toggle('on',next);

    const label=btn.querySelector('.switch-label');
    if(label){
      label.textContent=next?'ON':'OFF';
    }

    if(text){
      text.textContent=next?'ON':'OFF';
    }

  }catch(e){
    alert(e.message);
  }
}

async function createPayment(){

 if(!adminToken){
  alert('Admin login required');
  return;
 }

 const upi=
  document.getElementById('adminUpi')
   .value.trim();

 const amount=
  document.getElementById('adminAmount')
   .value;

 if(!upi||!amount){
  alert('UPI ID and amount required');
  return;
 }

 try{

  await req('/admin/payments',{
   method:'POST',
   headers:{
    'Content-Type':'application/json',
    Authorization:'Bearer '+adminToken
   },
   body:JSON.stringify({
    upi_id:upi,
    amount:amount
   })
  });

  alert('Payment order created');

  document.getElementById('adminUpi').value='';
  document.getElementById('adminAmount').value='';

  await loadAdminPayments();

 }catch(e){

  alert(e.message);

 }
}


/* LOAD ADMIN PAYMENTS */

async function loadAdminPayments(){

 if(!adminToken)return;

 try{

  const data=await req('/admin/payments',{
   headers:{
    Authorization:'Bearer '+adminToken
   }
  });

  const box=
   document.getElementById('adminPayments');

  if(!data.payments||data.payments.length===0){

   box.innerHTML=
    '<div class="msg">No payment orders yet.</div>';

   return;
  }

  box.innerHTML='';

  data.payments.forEach(p=>{

   const item=
    document.createElement('div');

   item.className='admin-item';

   let screenshot='';

   if(p.screenshot){

    screenshot=
     '<img src="'+
     p.screenshot+
     '" alt="Payment screenshot">';

   }

   item.innerHTML=`

    <b>UPI ID</b>
    <div>${escapeHtml(p.upi_id||'')}</div>

    <br>

    <b>Amount</b>
    <div>₹${escapeHtml(String(p.amount||0))}</div>

    <div style="font-size:11px;opacity:.65;margin-top:4px;">
      ${p.created_at ? new Date(p.created_at).toLocaleString() : ''}
    </div>

    <br>

    <b>User</b>
    <div>${escapeHtml(p.username||'Not submitted')}</div>

    <br>

    <b>Status</b>
    <div class="status">${escapeHtml(p.status||'')}</div>

    ${screenshot}

    ${p.status==='pending_review' ? `
      <button
       class="green"
       onclick="changeStatus('${p.id}','approved')">
       Approve
      </button>

      <button
       class="red"
       onclick="changeStatus('${p.id}','rejected')">
       Reject
      </button>
    ` : ''}

   `;

   box.appendChild(item);

  });

 }catch(e){

  document.getElementById('adminPayments').innerHTML=
   '<div class="msg">'+
   escapeHtml(e.message)+
   '</div>';

 }
}


/* ADMIN STATUS */

async function changeStatus(id,status){

 if(!adminToken)return;

 try{

  await req(
   '/admin/payments/'+id+'/status',
   {
    method:'POST',
    headers:{
     'Content-Type':'application/json',
     Authorization:'Bearer '+adminToken
    },
    body:JSON.stringify({status})
   }
  );

  alert(
   status==='approved'
   ?'Payment approved'
   :'Payment rejected'
  );

  await loadAdminPayments();

 }catch(e){

  alert(e.message);

 }
}


/* ADMIN LOGOUT */

function adminLogout(){

 adminToken=null;
 localStorage.removeItem('adminToken');

 document.getElementById('au').value='';
 document.getElementById('ap').value='';

 show('login');
}


/* HTML SAFETY */

function escapeHtml(value){

 return String(value)
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#039;');
}


/* START */

/* RESTORE ADMIN SESSION AFTER REFRESH */
(async function(){
  try{
    const savedAdminToken = localStorage.getItem('adminToken');

    if(savedAdminToken){
      adminToken = savedAdminToken;
      show('admin');
      await loadAdminDashboard();
      await loadAdminPayments();
    document.body.classList.remove('ac-loading');
    }
  }catch(e){
    console.error('Admin session restore failed:', e);
    localStorage.removeItem('adminToken');
    adminToken = null;
  }
})();



/* DRAG LIVE CHAT UP / DOWN */
(function(){
  const chat = document.querySelector('.ac-live-chat');
  if(!chat) return;

  let dragging = false;
  let startY = 0;
  let startTop = 0;

  chat.addEventListener('pointerdown', function(e){
    dragging = true;
    startY = e.clientY;
    startTop = chat.getBoundingClientRect().top;
    chat.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  chat.addEventListener('pointermove', function(e){
    if(!dragging) return;

    let newTop = startTop + (e.clientY - startY);

    const maxTop = window.innerHeight - chat.offsetHeight - 5;
    newTop = Math.max(5, Math.min(newTop, maxTop));

    chat.style.top = newTop + 'px';
    chat.style.bottom = 'auto';

    e.preventDefault();
  });

  chat.addEventListener('pointerup', function(e){
    dragging = false;
    try{
      chat.releasePointerCapture(e.pointerId);
    }catch(err){}
  });

  chat.addEventListener('pointercancel', function(){
    dragging = false;
  });
})();


function showTaskTab(tab){

  const newbie=document.getElementById('newbieTask');
  const team=document.getElementById('teamTask');

  const newbieTab=document.getElementById('newbieTab');
  const teamTab=document.getElementById('teamTab');

  if(tab==='team'){
    newbie.classList.add('hidden');
    team.classList.remove('hidden');
    newbieTab.classList.remove('active');
    teamTab.classList.add('active');
  }else{
    team.classList.add('hidden');
    newbie.classList.remove('hidden');
    teamTab.classList.remove('active');
    newbieTab.classList.add('active');
  }

  window.scrollTo(0,0);
}


async function openStatistics(){
  show('statistics');

  try{
    const data=await req('/statistics',{
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    document.getElementById('statBalance').textContent=
      Number(data.balance||0).toFixed(2);

    await refreshStatisticsBalance();

    document.getElementById('statSell').textContent=
      Number(data.sell||0).toFixed(2);

    document.getElementById('statDeposit').textContent=
      Number(data.deposit||0).toFixed(2);

    document.getElementById('statCommission').textContent=
      Number(data.commission||0).toFixed(2);

    document.getElementById('statUsdt').textContent=
      Number(data.usdtRate||118).toFixed(0);

    document.getElementById('statOrders').textContent=
      Number(data.inProcessOrders||0);

    document.getElementById('statProcessAmount').textContent=
      Number(data.inProcessAmount||0).toFixed(2);

    document.getElementById('statIncome').textContent=
      Number(data.estimatedIncome||0).toFixed(2);

  }catch(e){
    console.error(e);
  }
}



/* Keep Statistics balance connected to the real user balance */
async function refreshStatisticsBalance(){
  try{
    const me=await req('/me',{
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    const liveBalance=Number(me.user.balance||0).toFixed(2);

    const statBalance=document.getElementById('statBalance');
    if(statBalance){
      statBalance.textContent=liveBalance;
    }

    const mainBalance=document.getElementById('balance');
    if(mainBalance){
      mainBalance.textContent=me.user.balance;
    }
  }catch(e){
    console.error('Live balance error:',e);
  }
}


let balanceDetailsData=[];
let balanceDetailsFilter='all';

async function openBalanceDetails(){
  show('balanceDetails');

  const list=document.getElementById('balanceDetailsList');
  list.innerHTML='<div class="ac-bd-empty">Loading...</div>';

  try{
    const me=await req('/me',{
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    document.getElementById('bdBalance').textContent=
      Number(me.user.balance||0).toFixed(2);

    const data=await req('/transactions/'+me.user.id,{
      headers:{
        Authorization:'Bearer '+localStorage.token
      }
    });

    balanceDetailsData=data.transactions||[];
    renderBalanceDetails();

  }catch(e){
    console.error(e);
    list.innerHTML=
      '<div class="ac-bd-empty">Could not load transactions</div>';
  }
}

function filterBalanceDetails(type,button){
  balanceDetailsFilter=type;

  document.querySelectorAll('.ac-bd-tabs button').forEach(b=>{
    b.classList.remove('active');
  });

  if(button){
    button.classList.add('active');
  }

  renderBalanceDetails();
}

function renderBalanceDetails(){
  const list=document.getElementById('balanceDetailsList');

  let items=balanceDetailsData;

  if(balanceDetailsFilter==='deposit'){
    items=items.filter(t=>
      t.type==='payment_deposit' ||
      t.type==='admin_deposit'
    );
  }

  if(balanceDetailsFilter==='withdraw'){
    items=items.filter(t=>
      t.type==='upi_withdraw' ||
      t.type==='admin_withdraw'
    );
  }

  if(balanceDetailsFilter==='failed'){
    items=items.filter(t=>
      String(t.status||'').toLowerCase()==='failed' ||
      String(t.type||'').toLowerCase().includes('failed')
    );
  }

  if(!items.length){
    list.innerHTML='<div class="ac-bd-empty">No transactions found</div>';
    return;
  }

  list.innerHTML=items.map(t=>{
    const isWithdraw=
      t.type==='upi_withdraw' ||
      t.type==='admin_withdraw';

    const isFailed=
      String(t.status||'').toLowerCase()==='failed' ||
      String(t.type||'').toLowerCase().includes('failed');

    const kind=isFailed?'failed':(isWithdraw?'withdraw':'deposit');

    const name=
      isFailed ? 'Transaction Failed' :
      isWithdraw ? 'Withdraw' :
      (t.type==='payment_deposit' ? 'Deposit' : 'Deposit');

    const sign=isWithdraw?'−':'+';

    const amount=Number(t.amount||0).toFixed(2);

    const date=t.created_at
      ?new Date(t.created_at).toLocaleString()
      :'';

    const status=
      isFailed ? 'Failed' :
      'Completed';

    return `
      <div class="ac-bd-item">
        <div class="ac-bd-icon ${kind}">
          ${isFailed?'×':(isWithdraw?'↙':'↗')}
        </div>

        <div class="ac-bd-info">
          <div class="ac-bd-name">${name}</div>
          <div class="ac-bd-date">${date}</div>
          <div class="ac-bd-status">${status}</div>
        </div>

        <div class="ac-bd-amount ${kind}">
          ${sign}₹${amount}
        </div>
      </div>
    `;
  }).join('');
}


async function openDeposit(){
  await openPayment();

  history.replaceState({page:'deposit'},'','#deposit');

  const page=document.getElementById('payment');
  const title=document.getElementById('paymentTitle');

  if(page) page.classList.add('deposit-mode');
  if(title) title.textContent='Deposit';

  const grid=page ? page.querySelector('.grid') : null;
  if(grid) grid.style.display='none';

  window.scrollTo(0,0);
}

async function openOrder(){

  await openPayment();

  const page=document.getElementById('payment');
  const title=document.getElementById('paymentTitle');

  if(page){
    page.classList.add('deposit-mode');

    const grid=page.querySelector('.grid');
    if(grid) grid.style.display='none';
  }

  if(title){
    title.textContent='Order';
  }

  if(!restoringPage){
    history.replaceState({page:'order'},'','#order');
  }

  window.scrollTo(0,0);
}


async function openMainPayment(){
  await openPayment();

  const page=document.getElementById('payment');

  if(page){
    page.classList.remove('deposit-mode');

    const grid=page.querySelector('.grid');
    if(grid) grid.style.display='';

    const title=document.getElementById('paymentTitle');
    if(title) title.textContent='Payment';
  }

  if(!bottomNavigation){
    history.replaceState({page:'payment'},'','#payment');
  }

  window.scrollTo(0,0);
}
