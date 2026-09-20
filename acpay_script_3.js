
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
