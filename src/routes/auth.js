const express=require("express");
const {hashPassword,verifyPassword}=require("../security/password");
const db=require("../db/database");
const { attendanceOnceToday } = db;
const {auth,loginCookie,logout,displayName,requireOwner}=require("../middleware/auth");
const router=express.Router();

function publicUser(u){
  if(!u)return null;
  const {password_hash,...safe}=u;
  safe.display_name=displayName(u);
  const uid=String(u.uid||"").toLowerCase();
  safe.is_developer=["owner@principle","owner@director"].includes(uid);
  safe.is_primary_developer=uid==="owner@principle";
  safe.is_ajeet=uid==="ajeet@sir";
  delete safe.uid;
  return safe;
}
router.get("/classes",(req,res)=>res.json({classes:db.findAll("classes").sort((a,b)=>a.id-b.id)}));
router.get("/account-type",(req,res)=>{
  const uid=String(req.query?.uid||"").trim().toLowerCase();
  if(!uid)return res.json({found:false});
  const user=db.findOne("users",u=>String(u.uid||"").toLowerCase()===uid);
  if(user)return res.json({found:true,role:user.role||"user",requiresClass:false});
  const student=db.findOne("students",s=>String(s.student_uid||"").toLowerCase()===uid);
  if(student)return res.json({found:true,role:"student",requiresClass:true,classId:student.class_id});
  return res.json({found:false});
});
router.post("/login",async(req,res)=>{
  try{
    const body = req.body || {};
    const uid = String(body.uid ?? body.userId ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const selectedClassId = Number(body.classId ?? body.class_id ?? 0);
    if (!uid && !password) return res.status(400).json({error:"User ID and password are required."});
    if (!uid) return res.status(400).json({error:"User ID is required."});
    if (!password) return res.status(400).json({error:"Password is required."});
    let user=db.findOne("users",u=>String(u.uid).toLowerCase()===uid);
    if(user){
      const ok=user.password_hash ? verifyPassword(password,user.password_hash) : false;
      if(!ok)return res.status(401).json({error:"Invalid User ID or password."});
      if(selectedClassId){
        const cls=db.findOne("classes",x=>Number(x.id)===selectedClassId);
        if(!cls)return res.status(400).json({error:"Please select a valid SFPS class."});
        if(user.role==="teacher"&&!db.canTeach(user,selectedClassId))return res.status(403).json({error:"That class is not assigned to this teacher."});
      }
      loginCookie(res,user); return res.json({message:"Login successful",user:publicUser(user)});
    }
    const student=db.findOne("students",s=>String(s.student_uid).toLowerCase()===uid);
    if(student?.password_hash){
      if(!selectedClassId)return res.status(400).json({error:"Students must select their class before signing in."});
      if(Number(student.class_id)!==selectedClassId)return res.status(403).json({error:"The selected class does not match this student account."});
      const ok=verifyPassword(password,student.password_hash);
      if(!ok)return res.status(401).json({error:"Invalid User ID or password."});
      const c=db.findOne("classes",x=>Number(x.id)===Number(student.class_id));
      const u={id:student.id,name:student.name,uid:student.student_uid,role:"student",
        whatsapp_no:student.parent_phone||null,work:"Student",category:"Public/Student ID",
        access_description:"View own dashboard, attendance, homework, syllabus and results.",access_to_class:c?.name||null,
        student_id:student.id};
      u.display_name=displayName(u);
      loginCookie(res,u); return res.json({message:"Login successful",user:u});
    }
    return res.status(401).json({error:"Invalid User ID or password."});
  }catch(e){console.error(e);res.status(500).json({error:"Login failed."})}
});
router.post("/register-parent",auth,requireOwner,async(req,res)=>{
  try{
    const {parentName,whatsappNo,uid,password,faceCaptured,students}=req.body||{};
    if(!parentName||!uid||!password)return res.status(400).json({error:"Parent name, User ID and password are required."});
    if(!Array.isArray(students)||students.length<1||students.length>5)return res.status(400).json({error:"A parent account must contain between 1 and 5 students."});
    if(password.length<8)return res.status(400).json({error:"Password must contain at least 8 characters."});
    if(db.findOne("users",u=>u.uid===uid)||db.findOne("students",s=>s.student_uid===uid))return res.status(409).json({error:"That User ID already exists."});
    const clean=students.map(s=>({name:String(s.name||"").trim(),classId:Number(s.classId),rollNo:s.rollNo===""||s.rollNo==null?null:Number(s.rollNo),uid:String(s.uid||"").trim(),password:String(s.password||"")}));
    if(clean.some(s=>!s.name||!s.classId||!s.uid||s.password.length<8))return res.status(400).json({error:"Every student needs name, class, User ID and a password of at least 8 characters."});
    if(new Set(clean.map(s=>s.uid)).size!==clean.length)return res.status(400).json({error:"Student User IDs must be unique."});
    for(const s of clean)if(db.findOne("users",u=>u.uid===s.uid)||db.findOne("students",x=>x.student_uid===s.uid))return res.status(409).json({error:`Student User ID ${s.uid} already exists.`});
    const hash=hashPassword(password);
    const parent=db.insert("users",{name:parentName.trim(),uid:uid.trim(),password_hash:hash,role:"parent",whatsapp_no:whatsappNo||null,face_captured:Boolean(faceCaptured),work:"Parent",category:"Parent Account",access_description:"Manage up to 5 linked students",access_to_class:"Linked students"});
    for(const s of clean){
      const sh=hashPassword(s.password);
      db.insert("students",{student_uid:s.uid,name:s.name,password_hash:sh,class_id:s.classId,roll_no:s.rollNo,parent_user_id:parent.id,parent_name:parent.name,parent_phone:whatsappNo||null});
    }
    res.status(201).json({message:"Parent account created successfully."});
  }catch(e){console.error(e);res.status(400).json({error:e.message})}
});
router.get("/me",auth,(req,res)=>res.json({user:publicUser(req.user)}));
router.post("/logout",(req,res)=>{logout(req,res);res.json({message:"Logged out."})});
module.exports=router;
