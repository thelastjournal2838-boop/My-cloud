
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
