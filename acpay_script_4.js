
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

  history.replaceState({page:'order'},'','#order');
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
