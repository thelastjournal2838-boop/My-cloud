const express=require("express");
const path=require("path");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
require("dotenv").config();

const app=express();
const SECRET=process.env.JWT_SECRET||"change-this-secret";

// Simple JSON file storage for Termux/demo use.
// For production on Render, use a persistent managed database such as PostgreSQL.
const fs=require("fs");
const DB_FILE=process.env.DB_FILE||path.join(__dirname,"users.json");
function readUsers(){try{return JSON.parse(fs.readFileSync(DB_FILE,"utf8"))}catch(e){return []}}
function writeUsers(u){fs.writeFileSync(DB_FILE,JSON.stringify(u,null,2))}
if(!fs.existsSync(DB_FILE))writeUsers([]);

app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));

app.post("/api/register",async(req,res)=>{
 const {username,password}=req.body||{};
 if(!username||!password||username.length<3||password.length<6)
   return res.status(400).json({error:"Username must be 3+ chars and password 6+ chars"});
 const users=readUsers();
 if(users.some(u=>u.username===username)) return res.status(400).json({error:"Username already exists"});
 const password_hash=await bcrypt.hash(password,10);
 const user={id:Date.now().toString(),username,password_hash,balance:0,created_at:new Date().toISOString()};
 users.push(user);writeUsers(users);
 res.json({ok:true});
});

app.post("/api/login",async(req,res)=>{
 const {username,password}=req.body||{};
 const u=readUsers().find(x=>x.username===username);
 if(!u||!(await bcrypt.compare(password||"",u.password_hash)))
   return res.status(401).json({error:"Invalid username or password"});
 res.json({token:jwt.sign({id:u.id},SECRET,{expiresIn:"7d"})});
});

function auth(req,res,next){
 try{
  const h=req.headers.authorization||"";
  const t=h.startsWith("Bearer ")?h.slice(7):"";
  req.uid=jwt.verify(t,SECRET).id;next();
 }catch(e){res.status(401).json({error:"Unauthorized"})}
}
app.get("/api/me",auth,(req,res)=>{
 const u=readUsers().find(x=>x.id===req.uid);
 if(!u)return res.status(404).json({error:"User not found"});
 res.json({user:{id:u.id,username:u.username,balance:u.balance,created_at:u.created_at}});
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

const port=process.env.PORT||3000;
app.listen(port,()=>console.log("ACPay running on port "+port));