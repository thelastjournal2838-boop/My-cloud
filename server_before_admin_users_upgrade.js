const express=require("express");
const path=require("path");
const multer=require("multer");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const fs=require("fs");
require("dotenv").config();

const app=express();

const SECRET=process.env.JWT_SECRET||"change-this-secret";
const ADMIN_USER=process.env.ADMIN_USER||"amit";
const ADMIN_PASS=process.env.ADMIN_PASS||"781784";

const DB_FILE=process.env.DB_FILE||path.join(__dirname,"users.json");
const PAYMENT_FILE=path.join(__dirname,"payments.json");
const UPLOAD_DIR=path.join(__dirname,"public","uploads");

if(!fs.existsSync(UPLOAD_DIR)){
  fs.mkdirSync(UPLOAD_DIR,{recursive:true});
}

if(!fs.existsSync(DB_FILE)){
  fs.writeFileSync(DB_FILE,"[]");
}

if(!fs.existsSync(PAYMENT_FILE)){
  fs.writeFileSync(PAYMENT_FILE,"[]");
}

function readUsers(){
  try{
    return JSON.parse(fs.readFileSync(DB_FILE,"utf8"));
  }catch(e){
    return [];
  }
}

function writeUsers(data){
  fs.writeFileSync(DB_FILE,JSON.stringify(data,null,2));
}

function readPayments(){
  try{
    return JSON.parse(fs.readFileSync(PAYMENT_FILE,"utf8"));
  }catch(e){
    return [];
  }
}

function writePayments(data){
  fs.writeFileSync(PAYMENT_FILE,JSON.stringify(data,null,2));
}

const INCOME_RATE=0.085;
const ORDER_LIMIT_MS=15*60*1000;

function expireOldPayments(){
  const payments=readPayments();
  const now=Date.now();
  let changed=false;

  payments.forEach(p=>{

    // Old orders created before expiry support was added
    // get a 15-minute expiry automatically.
    if(
      !p.expires_at &&
      (p.status==="active" || p.status==="claimed")
    ){
      const baseTime =
        p.status==="claimed" && p.claimed_at
          ? new Date(p.claimed_at).getTime()
          : new Date(p.created_at).getTime();

      if(!isNaN(baseTime)){
        p.expires_at=
          new Date(baseTime+ORDER_LIMIT_MS).toISOString();
        changed=true;
      }
    }

    // Give old orders a payment code if they don't have one.
    if(!p.code){
      p.code=Math.random().toString(36).slice(2,8).toUpperCase();
      changed=true;
    }

    if(
      (p.status==="active" || p.status==="claimed") &&
      p.expires_at &&
      new Date(p.expires_at).getTime()<=now &&
      !p.screenshot
    ){
      p.status="expired";
      p.expired_at=new Date().toISOString();
      changed=true;
    }
  });

  if(changed) writePayments(payments);
  return payments;
}

/* FILE UPLOAD */

const storage=multer.diskStorage({
  destination:(req,file,cb)=>{
    cb(null,UPLOAD_DIR);
  },
  filename:(req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    cb(
      null,
      Date.now()+"-"+Math.random().toString(36).slice(2)+ext
    );
  }
});

const upload=multer({
  storage,
  limits:{
    fileSize:5*1024*1024
  },
  fileFilter:(req,file,cb)=>{
    const allowed=[
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if(allowed.includes(file.mimetype)){
      cb(null,true);
    }else{
      cb(new Error("Only JPG, PNG or WEBP images are allowed"));
    }
  }
});

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));


/* REFERRAL SYSTEM */

function makeReferralCode(username,id){
  const clean=String(username||"USER")
    .replace(/[^a-zA-Z0-9]/g,"")
    .toUpperCase()
    .slice(0,6);

  return clean + String(id).slice(-4);
}

function getReferralStats(userId){
  const users=readUsers();

  const direct=users.filter(
    u=>String(u.referrer_id||"")===String(userId)
  );

  const levelBIds=direct.map(u=>u.id);

  const levelB=users.filter(
    u=>levelBIds.includes(u.referrer_id)
  );

  const levelBIds2=levelB.map(u=>u.id);

  const levelC=users.filter(
    u=>levelBIds2.includes(u.referrer_id)
  );

  return {
    direct,
    levelB,
    levelC
  };
}

/* TEAM DATA */

app.get("/api/team",auth,(req,res)=>{
  try{
    const users=readUsers();
    const me=users.find(u=>u.id===req.uid);

    if(!me){
      return res.status(404).json({
        error:"User not found"
      });
    }

    if(!me.referral_code){
      me.referral_code=makeReferralCode(me.username,me.id);
      writeUsers(users);
    }

    const stats=getReferralStats(req.uid);

    const transactions=readTransactions();

    const commissions=transactions.filter(t=>
      t.user_id===req.uid &&
      (
        t.type==="referral_b_commission" ||
        t.type==="referral_c_commission"
      )
    );

    const now=new Date();

    const todayStart=new Date(now);
    todayStart.setHours(0,0,0,0);

    const yesterdayStart=new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate()-1);

    const todayCommission=commissions
      .filter(t=>new Date(t.created_at)>=todayStart)
      .reduce((sum,t)=>sum+Number(t.amount||0),0);

    const yesterdayCommission=commissions
      .filter(t=>{
        const d=new Date(t.created_at);
        return d>=yesterdayStart && d<todayStart;
      })
      .reduce((sum,t)=>sum+Number(t.amount||0),0);

    const totalCommission=commissions
      .reduce((sum,t)=>sum+Number(t.amount||0),0);

    const teamIds=[
      ...stats.direct.map(u=>u.id),
      ...stats.levelB.map(u=>u.id),
      ...stats.levelC.map(u=>u.id)
    ];

    const teamDeposits=transactions
      .filter(t=>
        teamIds.includes(t.user_id) &&
        t.type==="payment_deposit"
      )
      .reduce((sum,t)=>sum+Number(t.amount||0),0);

    res.json({
      ok:true,

      user:{
        id:me.id,
        username:me.username,
        referral_code:me.referral_code||""
      },

      invitation_link:
        "/#register?ref="+encodeURIComponent(me.referral_code||""),

      summary:{
        total_commission:Number(totalCommission.toFixed(2)),
        today_commission:Number(todayCommission.toFixed(2)),
        yesterday_commission:Number(yesterdayCommission.toFixed(2)),
        total_members:
          stats.direct.length+
          stats.levelB.length+
          stats.levelC.length,
        total_team_deposit:Number(teamDeposits.toFixed(2))
      },

      levels:{
        A:stats.direct.map(u=>({
          id:u.id,
          username:u.username,
          created_at:u.created_at
        })),

        B:stats.levelB.map(u=>({
          id:u.id,
          username:u.username,
          created_at:u.created_at
        })),

        C:stats.levelC.map(u=>({
          id:u.id,
          username:u.username,
          created_at:u.created_at
        }))
      },

      commissions
    });

  }catch(e){
    console.error(e);
    res.status(500).json({
      error:"Could not load team"
    });
  }
});

/* USER REGISTER */

app.post("/api/register",async(req,res)=>{
  try{
    const {username,password,referral_code}=req.body||{};

    if(
      !username||
      !password||
      username.length<3||
      password.length<6
    ){
      return res.status(400).json({
        error:"Username must be 3+ chars and password 6+ chars"
      });
    }

    const users=readUsers();

    if(users.some(u=>u.username===username)){
      return res.status(400).json({
        error:"Username already exists"
      });
    }

    const password_hash=await bcrypt.hash(password,10);

    let referrer_id=null;

    if(referral_code){
      const sponsor=users.find(
        u=>String(u.referral_code||"").toUpperCase()===
           String(referral_code).trim().toUpperCase()
      );

      if(!sponsor){
        return res.status(400).json({
          error:"Invalid referral code"
        });
      }

      referrer_id=sponsor.id;
    }

    let userId;
    do{
      userId=String(
        Math.floor(100000+Math.random()*900000)
      );
    }while(users.some(u=>u.id===userId));

    const referralCode=makeReferralCode(username,userId);

    users.push({
      id:userId,
      username,
      password_hash,
      balance:0,
      referral_code:referralCode,
      referrer_id,
      created_at:new Date().toISOString()
    });

    writeUsers(users);

    res.json({ok:true});

  }catch(e){
    res.status(500).json({
      error:"Registration failed"
    });
  }
});

/* USER LOGIN */

app.post("/api/login",async(req,res)=>{
  try{
    const {username,password}=req.body||{};

    const user=readUsers().find(
      x=>x.username===username
    );

    if(
      !user||
      !(await bcrypt.compare(
        password||"",
        user.password_hash
      ))
    ){
      return res.status(401).json({
        error:"Invalid username or password"
      });
    }

    res.json({
      token:jwt.sign(
        {
          id:user.id,
          type:"user"
        },
        SECRET,
        {
          expiresIn:"7d"
        }
      )
    });

  }catch(e){
    res.status(500).json({
      error:"Login failed"
    });
  }
});

/* USER AUTH */

function auth(req,res,next){
  try{
    const h=req.headers.authorization||"";
    const token=h.startsWith("Bearer ")
      ?h.slice(7)
      :"";

    const data=jwt.verify(token,SECRET);

    if(data.type!=="user"){
      return res.status(401).json({
        error:"Unauthorized"
      });
    }

    req.uid=data.id;

    next();

  }catch(e){
    res.status(401).json({
      error:"Unauthorized"
    });
  }
}

/* ADMIN AUTH */

function adminAuth(req,res,next){
  try{
    const h=req.headers.authorization||"";
    const token=h.startsWith("Bearer ")
      ?h.slice(7)
      :"";

    const data=jwt.verify(token,SECRET);

    if(data.type!=="admin"){
      return res.status(401).json({
        error:"Admin access required"
      });
    }

    next();

  }catch(e){
    res.status(401).json({
      error:"Admin access required"
    });
  }
}

/* UPI WITHDRAWAL SYSTEM */

const TRANSACTION_FILE=path.join(__dirname,"transactions.json");

function readTransactions(){
  try{
    return JSON.parse(fs.readFileSync(TRANSACTION_FILE,"utf8"));
  }catch(e){
    return [];
  }
}

function writeTransactions(data){
  fs.writeFileSync(
    TRANSACTION_FILE,
    JSON.stringify(data,null,2)
  );
}

/* Admin: list users who have enabled UPI withdrawal */
app.get("/api/admin/withdrawals",adminAuth,(req,res)=>{
  try{
    const users=readUsers();

    const list=users
      .filter(u=>u.withdrawal_enabled===true && u.upi_id)
      .map(u=>({
        id:u.id,
        username:u.username,
        upi_id:u.upi_id,
        balance:Number(u.balance||0)
      }));

    res.json({
      ok:true,
      withdrawals:list
    });
  }catch(e){
    res.status(500).json({
      error:"Could not load withdrawal users"
    });
  }
});

/* Admin: manually deduct withdrawal amount */
app.post("/api/admin/withdrawals/:id/deduct",adminAuth,(req,res)=>{
  try{
    const amount=Number(req.body?.amount);
    const reason=String(req.body?.reason||"").trim();

    if(!Number.isFinite(amount) || amount<=0){
      return res.status(400).json({
        error:"Valid amount enter karo"
      });
    }

    if(!reason){
      return res.status(400).json({
        error:"Reason required"
      });
    }

    const users=readUsers();
    const user=users.find(u=>u.id===req.params.id);

    if(!user){
      return res.status(404).json({
        error:"User not found"
      });
    }

    if(user.withdrawal_enabled!==true){
      return res.status(400).json({
        error:"User withdrawal OFF hai"
      });
    }

    const oldBalance=Number(user.balance||0);

    if(amount>oldBalance){
      return res.status(400).json({
        error:"Balance se zyada amount deduct nahi kar sakte"
      });
    }

    user.balance=Number((oldBalance-amount).toFixed(2));

    writeUsers(users);

    const transactions=readTransactions();

    transactions.push({
      id:Date.now().toString(),
      user_id:user.id,
      username:user.username,
      type:"upi_withdraw",
      amount:Number(amount.toFixed(2)),
      reason,
      balance_before:Number(oldBalance.toFixed(2)),
      balance_after:user.balance,
      created_at:new Date().toISOString()
    });

    writeTransactions(transactions);

    res.json({
      ok:true,
      message:"Withdrawal amount deducted successfully",
      user:{
        id:user.id,
        username:user.username,
        balance:user.balance
      }
    });

  }catch(e){
    res.status(500).json({
      error:"Withdrawal deduction failed"
    });
  }
});

/* User/Admin: transaction history */
app.get("/api/transactions/:id",auth,(req,res)=>{
  try{
    if(req.uid!==req.params.id){
      return res.status(403).json({
        error:"Access denied"
      });
    }

    const transactions=readTransactions()
      .filter(t=>t.user_id===req.params.id)
      .sort((a,b)=>
        new Date(b.created_at)-new Date(a.created_at)
      );

    res.json({
      ok:true,
      transactions
    });

  }catch(e){
    res.status(500).json({
      error:"Could not load transactions"
    });
  }
});

/* Admin: transaction history for a user */
app.get("/api/admin/transactions/:id",adminAuth,(req,res)=>{
  try{
    const transactions=readTransactions()
      .filter(t=>t.user_id===req.params.id)
      .sort((a,b)=>
        new Date(b.created_at)-new Date(a.created_at)
      );

    res.json({
      ok:true,
      transactions
    });

  }catch(e){
    res.status(500).json({
      error:"Could not load transaction history"
    });
  }
});

/* USER PROFILE */

app.get("/api/me",auth,(req,res)=>{
  const u=readUsers().find(
    x=>x.id===req.uid
  );

  if(!u){
    return res.status(404).json({
      error:"User not found"
    });
  }

  res.json({
    user:{
      id:u.id,
      username:u.username,
      balance:u.balance,
      created_at:u.created_at,
      upi_id:u.upi_id||"",
      withdrawal_enabled:u.withdrawal_enabled===true
    }
  });
});

/* USER WITHDRAWAL SETTINGS */

app.post(
  "/api/withdrawal/settings",
  auth,
  (req,res)=>{
    try{
      const {upi_id,withdrawal_enabled}=req.body||{};
      const users=readUsers();

      const user=users.find(
        u=>u.id===req.uid
      );

      if(!user){
        return res.status(404).json({
          error:"User not found"
        });
      }

      if(typeof upi_id==="string"){
        user.upi_id=upi_id.trim();
      }

      if(typeof withdrawal_enabled==="boolean"){
        user.withdrawal_enabled=withdrawal_enabled;
      }

      writeUsers(users);

      res.json({
        ok:true,
        upi_id:user.upi_id||"",
        withdrawal_enabled:user.withdrawal_enabled===true
      });

    }catch(e){
      console.error(e);
      res.status(500).json({
        error:"Could not save withdrawal settings"
      });
    }
  }
);

/* ADMIN LOGIN */

app.post("/api/admin/login",(req,res)=>{
  const {username,password}=req.body||{};

  if(
    username!==ADMIN_USER||
    password!==ADMIN_PASS
  ){
    return res.status(401).json({
      error:"Invalid admin username or password"
    });
  }

  res.json({
    token:jwt.sign(
      {
        type:"admin"
      },
      SECRET,
      {
        expiresIn:"7d"
      }
    )
  });
});

/* ADMIN CREATE PAYMENT ORDER */

app.post(
  "/api/admin/payments",
  adminAuth,
  (req,res)=>{
    const {upi_id,amount}=req.body||{};

    if(!upi_id||!amount){
      return res.status(400).json({
        error:"UPI ID and amount are required"
      });
    }

    const numericAmount=Number(amount);

    if(
      !Number.isFinite(numericAmount)||
      numericAmount<=0
    ){
      return res.status(400).json({
        error:"Invalid amount"
      });
    }

    const payments=readPayments();

    const payment={
      id:Date.now().toString(),
      user_id:null,
      upi_id:String(upi_id).trim(),
      amount:numericAmount,
      status:"active",
      screenshot:null,
      created_at:new Date().toISOString()
    };

    payments.push(payment);

    writePayments(payments);

    res.json({
      ok:true,
      payment
    });
  }
);

/* USER GET PAYMENTS */

app.get("/api/payments",auth,(req,res)=>{
  const payments=readPayments();

  const active=payments
    .filter(x=>
      x.status==="active"&&
      !x.user_id
    )
    .sort(
      (a,b)=>
        new Date(b.created_at)-
        new Date(a.created_at)
    );

  const own=payments
    .filter(x=>x.user_id===req.uid)
    .sort(
      (a,b)=>
        new Date(b.created_at)-
        new Date(a.created_at)
    );

  res.json({
    payments:[
      ...own,
      ...active
    ]
  });
});

/* USER CLAIMS PAYMENT ORDER */

app.post("/api/payments/:id/claim",auth,(req,res)=>{
  try{
    const payments=expireOldPayments();
    const now=Date.now();

    const open=payments.filter(x=>
      x.user_id===req.uid &&
      x.status==="claimed" &&
      (!x.expires_at || new Date(x.expires_at).getTime()>now)
    );

    if(open.length>=2){
      return res.status(400).json({
        error:"You already have 2 open orders"
      });
    }

    const payment=payments.find(x=>
      x.id===req.params.id &&
      x.status==="active" &&
      !x.user_id &&
      (!x.expires_at || new Date(x.expires_at).getTime()>now)
    );

    if(!payment){
      return res.status(409).json({
        error:"This payment order is no longer available"
      });
    }

    payment.user_id=req.uid;
    payment.status="claimed";

    const claimedAt=new Date();
    payment.claimed_at=claimedAt.toISOString();
    payment.expires_at=
      new Date(claimedAt.getTime()+ORDER_LIMIT_MS).toISOString();

    writePayments(payments);

    res.json({ok:true,payment});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Could not claim payment order"});
  }
});

/* USER CANCELS PAYMENT ORDER */

app.post("/api/payments/:id/cancel",auth,(req,res)=>{
  try{
    const payments=expireOldPayments();

    const payment=payments.find(x=>
      x.id===req.params.id &&
      x.user_id===req.uid
    );

    if(!payment){
      return res.status(404).json({
        error:"Payment order not found"
      });
    }

    if(payment.status!=="claimed"){
      return res.status(400).json({
        error:"This payment order cannot be cancelled"
      });
    }

    payment.status="cancelled";
    payment.cancelled_at=new Date().toISOString();

    writePayments(payments);

    res.json({ok:true,message:"Payment order cancelled"});
  }catch(e){
    console.error(e);
    res.status(500).json({
      error:"Could not cancel payment order"
    });
  }
});

/* USER SUBMITS PAYMENT SCREENSHOT */

app.post(
  "/api/payments/:id/proof",
  auth,
  upload.single("screenshot"),
  (req,res)=>{
    try{

      if(!req.file){
        return res.status(400).json({
          error:"Please upload payment screenshot"
        });
      }

      const payments=readPayments();

      const payment=payments.find(
        x=>
          x.id===req.params.id&&
          (!x.user_id||x.user_id===req.uid)
      );

      if(!payment){

        try{
          fs.unlinkSync(req.file.path);
        }catch(e){}

        return res.status(404).json({
          error:"Payment order not found"
        });
      }

      if(payment.status==="expired"){
          try{ fs.unlinkSync(req.file.path); }catch(e){}
          return res.status(400).json({
            error:"This payment order has expired"
          });
        }

        if(payment.status==="approved"){

        try{
          fs.unlinkSync(req.file.path);
        }catch(e){}

        return res.status(400).json({
          error:"Payment already approved"
        });
      }

      payment.user_id=req.uid;
      payment.screenshot=
        "/uploads/"+req.file.filename;

      payment.status="pending_review";

      payment.submitted_at=
        new Date().toISOString();

      writePayments(payments);

      res.json({
        ok:true,
        message:"Payment proof submitted successfully"
      });

    }catch(e){

      if(req.file){
        try{
          fs.unlinkSync(req.file.path);
        }catch(x){}
      }

      res.status(500).json({
        error:"Could not submit payment proof"
      });
    }
  }
);

/* ADMIN DASHBOARD */

app.get("/api/admin/dashboard",adminAuth,(req,res)=>{
  try{

    const users=readUsers();
    const payments=expireOldPayments();

    const totalBalance=users.reduce(
      (sum,u)=>sum+Number(u.balance||0),
      0
    );

    const pendingOrders=payments.filter(
      p=>p.status==="pending_review"
    ).length;

    res.json({
      ok:true,
      totalUsers:users.length,
      totalBalance:Number(totalBalance.toFixed(2)),
      pendingOrders,
      pendingWithdrawals:0
    });

  }catch(e){

    console.error(e);

    res.status(500).json({
      error:"Could not load admin dashboard"
    });

  }
});

/* ADMIN VIEW ALL PAYMENTS */

app.get(
  "/api/admin/payments",
  adminAuth,
  (req,res)=>{
    const payments=readPayments();
    const users=readUsers();

    const result=payments
      .sort(
        (a,b)=>
          new Date(b.created_at)-
          new Date(a.created_at)
      )
      .map(p=>({
        ...p,
        username:
          users.find(
            u=>u.id===p.user_id
          )?.username||
          "Not submitted"
      }));

    res.json({
      payments:result
    });
  }
);

/* ADMIN APPROVE / REJECT PAYMENT */

app.post(
  "/api/admin/payments/:id/status",
  adminAuth,
  (req,res)=>{
    try{

      const {status}=req.body||{};

      if(
        ![
          "active",
          "approved",
          "rejected"
        ].includes(status)
      ){
        return res.status(400).json({
          error:"Invalid status"
        });
      }

      const payments=readPayments();

      const payment=payments.find(
        x=>x.id===req.params.id
      );

      if(!payment){
        return res.status(404).json({
          error:"Payment not found"
        });
      }

      /* PREVENT DOUBLE APPROVAL */

      if(
        status==="approved"&&
        payment.status==="approved"
      ){
        return res.status(400).json({
          error:"Payment already approved"
        });
      }

      /* APPROVED PAYMENT CANNOT BE CHANGED */

      if(
        payment.status==="approved"&&
        status!=="approved"
      ){
        return res.status(400).json({
          error:"Approved payment cannot be changed"
        });
      }

      /* ADD MONEY TO USER BALANCE */

      if(status==="approved"){

        if(!payment.user_id){
          return res.status(400).json({
            error:"Payment is not linked to a user"
          });
        }

        const users=readUsers();

        const user=users.find(
          u=>u.id===payment.user_id
        );

        if(!user){
          return res.status(400).json({
            error:"User not found"
          });
        }

        const baseAmount=Number(payment.amount||0);
        const income=Number(
          (baseAmount*INCOME_RATE).toFixed(2)
        );

        payment.income=income;

        const balanceBefore=Number(user.balance||0);

        user.balance=
          Number(
            balanceBefore+
            baseAmount+
            income
          );

        const transactions=readTransactions();

        transactions.push({
          id:Date.now().toString(),
          user_id:user.id,
          username:user.username,
          type:"payment_deposit",
          amount:Number(baseAmount.toFixed(2)),
          income:Number(income.toFixed(2)),
          reason:"Payment approved",
          balance_before:Number(balanceBefore.toFixed(2)),
          balance_after:user.balance,
          created_at:new Date().toISOString()
        });

        writeUsers(users);
        writeTransactions(transactions);
      }

      payment.status=status;

      payment.reviewed_at=
        new Date().toISOString();

      writePayments(payments);

      res.json({
        ok:true,
        payment
      });

    }catch(e){

      console.error(e);

      res.status(500).json({
        error:"Could not update payment status"
      });
    }
  }
);

/* ADMIN USER SEARCH */

app.get(
  "/api/admin/users/:id",
  adminAuth,
  (req,res)=>{
    try{
      const users=readUsers();

      const user=users.find(
        u=>u.id===req.params.id
      );

      if(!user){
        return res.status(404).json({
          error:"User not found"
        });
      }

      res.json({
        ok:true,
        user:{
          id:user.id,
          username:user.username,
          balance:Number(user.balance||0),
          created_at:user.created_at
        }
      });

    }catch(e){
      console.error(e);
      res.status(500).json({
        error:"Could not find user"
      });
    }
  }
);

/* ADMIN USER BALANCE */

app.post(
  "/api/admin/users/:id/balance",
  adminAuth,
  (req,res)=>{
    try{
      const {action,amount,reason}=req.body||{};
      const value=Number(amount);
      const note=String(reason||"").trim();

      if(!["add","remove"].includes(action)){
        return res.status(400).json({error:"Invalid balance action"});
      }

      if(!Number.isFinite(value)||value<=0){
        return res.status(400).json({error:"Invalid amount"});
      }

      if(!note){
        return res.status(400).json({error:"Reason required"});
      }

      const users=readUsers();
      const user=users.find(u=>u.id===req.params.id);

      if(!user){
        return res.status(404).json({error:"User not found"});
      }

      const oldBalance=Number(user.balance||0);

      if(action==="remove" && value>oldBalance){
        return res.status(400).json({
          error:"Insufficient user balance"
        });
      }

      const newBalance=
        action==="add"
          ? oldBalance+value
          : oldBalance-value;

      user.balance=Number(newBalance.toFixed(2));
      writeUsers(users);

      const transactions=readTransactions();

      transactions.push({
        id:Date.now().toString(),
        user_id:user.id,
        username:user.username,
        type:action==="add" ? "admin_deposit" : "admin_withdraw",
        amount:Number(value.toFixed(2)),
        reason:note,
        balance_before:Number(oldBalance.toFixed(2)),
        balance_after:user.balance,
        created_at:new Date().toISOString()
      });

      writeTransactions(transactions);

      res.json({
        ok:true,
        user:{
          id:user.id,
          username:user.username,
          balance:user.balance
        }
      });

    }catch(e){
      console.error(e);
      res.status(500).json({
        error:"Balance update failed"
      });
    }
  }
);


/* SERVER */

const port=process.env.PORT||3000;


// ================= USDT DEPOSIT SYSTEM =================
const USDT_FILE=path.join(__dirname,"usdt.json");

function readUSDT(){
  try{
    return JSON.parse(fs.readFileSync(USDT_FILE,"utf8"));
  }catch(e){
    return {
      settings:{wallet_address:"",min:5,max:10},
      deposits:[]
    };
  }
}

function writeUSDT(data){
  fs.writeFileSync(USDT_FILE,JSON.stringify(data,null,2));
}

// Admin: save USDT deposit settings
app.post("/api/admin/usdt/settings",adminAuth,(req,res)=>{
  try{
    const {wallet_address,min,max}=req.body||{};
    const data=readUSDT();

    const wallet=String(wallet_address||"").trim();
    const minAmount=Number(min);
    const maxAmount=Number(max);

    if(!wallet){
      return res.status(400).json({error:"USDT wallet address required"});
    }

    if(!Number.isFinite(minAmount) || !Number.isFinite(maxAmount)){
      return res.status(400).json({error:"Invalid USDT limits"});
    }

    if(minAmount<=0 || maxAmount<=0 || minAmount>maxAmount){
      return res.status(400).json({
        error:"Invalid USDT limits"
      });
    }

    data.settings={
      wallet_address:wallet,
      min:minAmount,
      max:maxAmount
    };

    writeUSDT(data);

    res.json({
      ok:true,
      settings:data.settings
    });
  }catch(e){
    res.status(500).json({error:"USDT settings save failed"});
  }
});

// Admin: save USDT wallet only
app.post("/api/admin/usdt/wallet",adminAuth,(req,res)=>{
  try{
    const wallet=String(req.body?.wallet_address||"").trim();

    if(!wallet){
      return res.status(400).json({
        error:"USDT wallet address required"
      });
    }

    const data=readUSDT();

    data.settings.wallet_address=wallet;

    writeUSDT(data);

    res.json({
      ok:true,
      wallet_address:data.settings.wallet_address
    });

  }catch(e){
    console.error("USDT wallet save error:",e);
    res.status(500).json({
      error:"USDT wallet save failed"
    });
  }
});

// Admin: save USDT limits only
app.post("/api/admin/usdt/limits",adminAuth,(req,res)=>{
  try{
    const min=Number(req.body?.min);
    const max=Number(req.body?.max);

    if(
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min<=0 ||
      max<=0 ||
      min>max
    ){
      return res.status(400).json({
        error:"Invalid USDT limits"
      });
    }

    const data=readUSDT();

    data.settings.min=min;
    data.settings.max=max;

    writeUSDT(data);

    res.json({
      ok:true,
      min:data.settings.min,
      max:data.settings.max
    });

  }catch(e){
    console.error("USDT limits save error:",e);
    res.status(500).json({
      error:"USDT limits save failed"
    });
  }
});

// Admin: get USDT settings
app.get("/api/admin/usdt/settings",adminAuth,(req,res)=>{
  try{
    const data=readUSDT();

    res.json({
      ok:true,
      wallet_address:data.settings.wallet_address||"",
      min:Number(data.settings.min||5),
      max:Number(data.settings.max||10)
    });

  }catch(e){
    console.error("Admin USDT settings load error:",e);
    res.status(500).json({
      error:"USDT settings load failed"
    });
  }
});


// User: get USDT deposit settings
app.get("/api/usdt/settings",auth,(req,res)=>{
  try{
    const data=readUSDT();

    res.json({
      ok:true,
      wallet_address:data.settings.wallet_address||"",
      min:Number(data.settings.min||5),
      max:Number(data.settings.max||10)
    });
  }catch(e){
    res.status(500).json({error:"USDT settings load failed"});
  }
});

// User: submit USDT deposit request
app.post("/api/usdt/deposit",auth,(req,res)=>{
  try{
    const amount=Number(req.body?.amount);
    const data=readUSDT();

    const min=Number(data.settings.min||5);
    const max=Number(data.settings.max||10);

    if(!Number.isFinite(amount) || amount<=0){
      return res.status(400).json({error:"Valid USDT amount enter karo"});
    }

    if(amount<min){
      return res.status(400).json({
        error:`Minimum deposit ${min} USDT hai`
      });
    }

    if(amount>max){
      return res.status(400).json({
        error:`Maximum deposit ${max} USDT hai`
      });
    }

    const deposit={
      id:Date.now().toString(),
      user_id:req.uid,
      amount:Number(amount.toFixed(2)),
      status:"pending",
      created_at:new Date().toISOString()
    };

    data.deposits.push(deposit);
    writeUSDT(data);

    res.json({
      ok:true,
      message:"USDT deposit request submitted"
    });
  }catch(e){
    res.status(500).json({error:"USDT deposit submit failed"});
  }
});


// Admin: get USDT deposit requests
app.get("/api/admin/usdt/deposits",adminAuth,(req,res)=>{
  try{
    const data=readUSDT();
    const users=readUsers();

    const deposits=data.deposits.map(d=>{
      const user=users.find(u=>String(u.id)===String(d.user_id));

      return {
        ...d,
        username:user?.username||"Unknown"
      };
    });

    deposits.sort((a,b)=>
      new Date(b.created_at)-new Date(a.created_at)
    );

    res.json({
      ok:true,
      deposits
    });
  }catch(e){
    console.error("USDT admin list error:",e);
    res.status(500).json({error:"USDT deposits load failed"});
  }
});

// Admin: approve/reject USDT deposit
app.post("/api/admin/usdt/deposits/:id/status",adminAuth,(req,res)=>{
  try{
    const {status}=req.body||{};

    if(!["approved","rejected"].includes(status)){
      return res.status(400).json({error:"Invalid USDT status"});
    }

    const data=readUSDT();

    const deposit=data.deposits.find(
      d=>String(d.id)===String(req.params.id)
    );

    if(!deposit){
      return res.status(404).json({error:"USDT deposit not found"});
    }

    // Already approved/rejected request cannot be changed
    if(deposit.status==="approved"){
      return res.status(400).json({
        error:"Approved USDT deposit cannot be changed"
      });
    }

    if(deposit.status==="rejected"){
      return res.status(400).json({
        error:"Rejected USDT deposit cannot be changed"
      });
    }

    if(status==="rejected"){
      deposit.status="rejected";
      deposit.reviewed_at=new Date().toISOString();

      writeUSDT(data);

      return res.json({
        ok:true,
        message:"USDT deposit rejected"
      });
    }

    // APPROVED
    const users=readUsers();

    const user=users.find(
      u=>String(u.id)===String(deposit.user_id)
    );

    if(!user){
      return res.status(404).json({error:"User not found"});
    }

    const usdtAmount=Number(deposit.amount||0);
    const rate=118;
    const inrAmount=Number((usdtAmount*rate).toFixed(2));

    const balanceBefore=Number(user.balance||0);
    const balanceAfter=Number((balanceBefore+inrAmount).toFixed(2));

    user.balance=balanceAfter;

    const transactions=readTransactions();

    transactions.push({
      id:Date.now().toString(),
      user_id:user.id,
      username:user.username,
      type:"usdt_deposit",
      amount:inrAmount,
      usdt_amount:usdtAmount,
      usdt_rate:rate,
      reason:"USDT deposit approved",
      balance_before:Number(balanceBefore.toFixed(2)),
      balance_after:balanceAfter,
      created_at:new Date().toISOString()
    });

    deposit.status="approved";
    deposit.inr_amount=inrAmount;
    deposit.usdt_rate=rate;
    deposit.reviewed_at=new Date().toISOString();

    writeUsers(users);
    writeTransactions(transactions);
    writeUSDT(data);

    res.json({
      ok:true,
      message:"USDT deposit approved",
      usdt_amount:usdtAmount,
      inr_amount:inrAmount,
      balance:balanceAfter
    });

  }catch(e){
    console.error("USDT status error:",e);
    res.status(500).json({error:"USDT deposit status update failed"});
  }
});


// User: get own USDT deposit history
app.get("/api/usdt/my-deposits",auth,(req,res)=>{
  try{
    const data=readUSDT();

    const deposits=data.deposits.filter(
      d=>String(d.user_id)===String(req.uid)
    );

    res.json({
      ok:true,
      deposits
    });

  }catch(e){
    console.error("User USDT deposits error:",e);
    res.status(500).json({
      error:"USDT deposit history load failed"
    });
  }
});

// ================= END USDT DEPOSIT SYSTEM =================


// ================= STATISTICS =================
app.get("/api/statistics",auth,(req,res)=>{
  try{
    const users=readUsers();
    const user=users.find(u=>u.id===req.uid);

    if(!user){
      return res.status(404).json({error:"User not found"});
    }

    const payments=expireOldPayments();

    const now=new Date();
    const start=new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const end=new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()+1
    );

    const transactions=readTransactions();

    // Today's UPI withdrawals
    const sell=transactions
      .filter(t=>
        t.user_id===req.uid &&
        t.type==="upi_withdraw" &&
        new Date(t.created_at)>=start &&
        new Date(t.created_at)<end
      )
      .reduce((sum,t)=>sum+Number(t.amount||0),0);

    // Approved payment deposits today
    const paymentDeposit=payments
      .filter(p=>
        p.user_id===req.uid &&
        p.status==="approved" &&
        new Date(p.reviewed_at||p.created_at)>=start &&
        new Date(p.reviewed_at||p.created_at)<end
      )
      .reduce((sum,p)=>sum+Number(p.amount||0),0);

    // Approved USDT deposits today
    const usdtData=readUSDT();
    const usdtDeposit=usdtData.deposits
      .filter(d=>
        String(d.user_id)===String(req.uid) &&
        d.status==="approved" &&
        new Date(d.reviewed_at||d.created_at)>=start &&
        new Date(d.reviewed_at||d.created_at)<end
      )
      .reduce((sum,d)=>{
        const usdtAmount=Number(d.amount||0);
        const rate=Number(d.usdt_rate||118);
        return sum+(usdtAmount*rate);
      },0);

    // Total Deposit = normal approved payment + approved USDT
    const deposit=paymentDeposit+usdtDeposit;

    // Current in-process orders
    const inProcess=payments.filter(p=>
      p.user_id===req.uid &&
      (
        p.status==="claimed" ||
        p.status==="pending_review"
      )
    );

    const inProcessAmount=inProcess.reduce(
      (sum,p)=>sum+Number(p.amount||0),0
    );

    const commissionRate=8.5;
    const estimatedIncome=Number(
      (inProcessAmount*commissionRate/100).toFixed(2)
    );

    res.json({
      balance:Number(user.balance||0),
      sell:Number(sell.toFixed(2)),
      deposit:Number(deposit.toFixed(2)),
      commission:0,
      usdtRate:118,
      inProcessOrders:inProcess.length,
      inProcessAmount:Number(inProcessAmount.toFixed(2)),
      commissionRate,
      estimatedIncome
    });

  }catch(e){
    console.error(e);
    res.status(500).json({error:"Statistics load failed"});
  }
});

// ================= END STATISTICS =================

/* FRONTEND */
app.get("*",(req,res)=>{
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

app.listen(port,()=>{
  console.log(
    "ACPay running on port "+port
  );
});
