const express=require("express");
const path=require("path");
const multer=require("multer");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const fs=require("fs");
require("dotenv").config();

const app=express();
const SECRET=process.env.JWT_SECRET||"change-this-secret";

const DB_FILE=process.env.DB_FILE||path.join(__dirname,"users.json");
const PAYMENT_FILE=path.join(__dirname,"payments.json");
const UPLOAD_DIR=path.join(__dirname,"public","uploads");

if(!fs.existsSync(UPLOAD_DIR))fs.mkdirSync(UPLOAD_DIR,{recursive:true});
if(!fs.existsSync(DB_FILE))fs.writeFileSync(DB_FILE,"[]");
if(!fs.existsSync(PAYMENT_FILE))fs.writeFileSync(PAYMENT_FILE,"[]");

function readUsers(){
 try{return JSON.parse(fs.readFileSync(DB_FILE,"utf8"))}
 catch(e){return []}
}

function writeUsers(u){
 fs.writeFileSync(DB_FILE,JSON.stringify(u,null,2))
}

function readPayments(){
 try{return JSON.parse(fs.readFileSync(PAYMENT_FILE,"utf8"))}
 catch(e){return []}
}

function writePayments(p){
 fs.writeFileSync(PAYMENT_FILE,JSON.stringify(p,null,2))
}

const storage=multer.diskStorage({
 destination:(req,file,cb)=>{
  cb(null,UPLOAD_DIR)
 },
 filename:(req,file,cb)=>{
  const ext=path.extname(file.originalname).toLowerCase();
  cb(null,Date.now()+"-"+Math.random().toString(36).slice(2)+ext)
 }
});

const upload=multer({
 storage,
 limits:{fileSize:5*1024*1024},
 fileFilter:(req,file,cb)=>{
  const allowed=["image/jpeg","image/png","image/webp"];
  if(allowed.includes(file.mimetype))cb(null,true);
  else cb(new Error("Only JPG, PNG or WEBP images are allowed"));
 }
});

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

app.post("/api/register",async(req,res)=>{
 try{
  const {username,password}=req.body||{};

  if(!username||!password||username.length<3||password.length<6)
   return res.status(400).json({
    error:"Username must be 3+ chars and password 6+ chars"
   });

  const users=readUsers();

  if(users.some(u=>u.username===username))
   return res.status(400).json({
    error:"Username already exists"
   });

  const password_hash=await bcrypt.hash(password,10);

  const user={
   id:Date.now().toString(),
   username,
   password_hash,
   balance:0,
   created_at:new Date().toISOString()
  };

  users.push(user);
  writeUsers(users);

  res.json({ok:true});
 }catch(e){
  res.status(500).json({error:"Registration failed"});
 }
});

app.post("/api/login",async(req,res)=>{
 try{
  const {username,password}=req.body||{};
  const u=readUsers().find(x=>x.username===username);

  if(!u||!(await bcrypt.compare(password||"",u.password_hash)))
   return res.status(401).json({
    error:"Invalid username or password"
   });

  res.json({
   token:jwt.sign({id:u.id},SECRET,{expiresIn:"7d"})
  });
 }catch(e){
  res.status(500).json({error:"Login failed"});
 }
});

function auth(req,res,next){
 try{
  const h=req.headers.authorization||"";
  const t=h.startsWith("Bearer ")?h.slice(7):"";

  req.uid=jwt.verify(t,SECRET).id;
  next();
 }catch(e){
  res.status(401).json({error:"Unauthorized"});
 }
}

app.get("/api/me",auth,(req,res)=>{
 const u=readUsers().find(x=>x.id===req.uid);

 if(!u)
  return res.status(404).json({error:"User not found"});

 res.json({
  user:{
   id:u.id,
   username:u.username,
   balance:u.balance,
   created_at:u.created_at
  }
 });
});

/* PAYMENT ORDERS */

app.get("/api/payments",auth,(req,res)=>{
 const payments=readPayments()
  .filter(x=>x.user_id===req.uid)
  .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

 res.json({payments});
});

/* USER SUBMITS PAYMENT PROOF */

app.post("/api/payments/:id/proof",auth,upload.single("screenshot"),(req,res)=>{
 try{
  if(!req.file)
   return res.status(400).json({
    error:"Please upload payment screenshot"
   });

  const payments=readPayments();
  const payment=payments.find(x=>
   x.id===req.params.id && x.user_id===req.uid
  );

  if(!payment){
   try{fs.unlinkSync(req.file.path)}catch(e){}
   return res.status(404).json({
    error:"Payment order not found"
   });
  }

  if(payment.status==="approved"){
   try{fs.unlinkSync(req.file.path)}catch(e){}
   return res.status(400).json({
    error:"Payment already approved"
   });
  }

  payment.screenshot="/uploads/"+req.file.filename;
  payment.status="pending_review";
  payment.submitted_at=new Date().toISOString();

  writePayments(payments);

  res.json({
   ok:true,
   message:"Payment proof submitted successfully",
   payment
  });
 }catch(e){
  if(req.file){
   try{fs.unlinkSync(req.file.path)}catch(x){}
  }

  res.status(500).json({
   error:"Could not submit payment proof"
  });
 }
});

/* ADMIN DEMO API
   Admin panel will be added next.
*/

app.get("*",(req,res)=>{
 res.sendFile(path.join(__dirname,"public","index.html"));
});

const port=process.env.PORT||3000;

app.listen(port,()=>{
 console.log("ACPay running on port "+port);
});
