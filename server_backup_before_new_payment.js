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

/* USER REGISTER */

app.post("/api/register",async(req,res)=>{
  try{
    const {username,password}=req.body||{};

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

    users.push({
      id:Date.now().toString(),
      username,
      password_hash,
      balance:0,
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
      created_at:u.created_at
    }
  });
});

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

        user.balance=
          Number(user.balance||0)+
          Number(payment.amount||0);

        writeUsers(users);
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

/* SERVER */

const port=process.env.PORT||3000;

app.listen(port,()=>{
  console.log(
    "ACPay running on port "+port
  );
});
