const express=require("express");
const db=require("../db/database");
const { attendanceOnceToday } = db;
const {auth,requireOwner,displayName}=require("../middleware/auth");
const router=express.Router();
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const multer=require("multer");
const { UPLOAD_DIR, ensureStorage } = require("../storage");
ensureStorage();
const storage=multer.diskStorage({destination:(_req,_file,cb)=>cb(null,UPLOAD_DIR),filename:(_req,file,cb)=>{const ext=path.extname(file.originalname||"").toLowerCase();cb(null,`${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`)}});
const imageUpload=multer({storage,limits:{fileSize:5*1024*1024,files:6},fileFilter:(_req,file,cb)=>cb(null,/^image\/(jpeg|png|webp|gif)$/.test(String(file.mimetype||"")))});
const WORKS=[
 ["attendance","Attendance"],["syllabus","Syllabus"],["homework","Homework"],["results","Results"],["fees","Fees"],
 ["students","Student Management"],["class_management","Class Management"],["parent_management","Parent Management"],
 ["teacher_registry","Teacher Registry"],["reports","Reports"]
];
router.use(auth,requireOwner);

router.get("/directory",(_req,res)=>{
  const users=db.findAll("users").map(u=>({...u,name:displayName(u),password_hash:undefined}));
  const students=db.findAll("students").map(s=>({...s,password_hash:undefined}));
  res.json({users,students});
});
router.post("/users",(req,res)=>{
  const {name,uid,password,role="teacher",work="Teaching",category="Teaching",accessDescription="",accessToClass=""}=req.body||{};
  if(!name||!uid||!password)return res.status(400).json({error:"Name, UID and password are required."});
  if(password.length<8)return res.status(400).json({error:"Password must contain at least 8 characters."});
  const cleanUid=String(uid).trim().toLowerCase();
  if(db.findOne("users",u=>String(u.uid).toLowerCase()===cleanUid)||db.findOne("students",s=>String(s.student_uid).toLowerCase()===cleanUid))return res.status(409).json({error:"That ID already exists."});
  if(!["teacher","manager","parent"].includes(role))return res.status(400).json({error:"Only teacher, manager or parent IDs can be created here."});
  const {hashPassword}=require("../security/password");
  const u=db.insert("users",{name:String(name).trim(),uid:cleanUid,password_hash:hashPassword(String(password)),role,work,category,access_description:accessDescription,access_to_class:accessToClass});
  db.insert("developer_console_audit",{owner_id:req.user.id,action:"create_user",target_uid:cleanUid,details:JSON.stringify({role})});
  res.status(201).json({ok:true,user:{...u,password_hash:undefined,name:displayName(u)}});
});
router.put("/users/:id/password",(req,res)=>{
  const user=db.findOne("users",u=>Number(u.id)===Number(req.params.id)); if(!user)return res.status(404).json({error:"User not found."});
  const password=String(req.body?.password||""); if(password.length<8)return res.status(400).json({error:"Password must contain at least 8 characters."});
  const {hashPassword}=require("../security/password"); db.update("users",u=>u.id===user.id,{password_hash:hashPassword(password),updated_at:new Date().toISOString()});
  db.insert("developer_console_audit",{owner_id:req.user.id,action:"change_password",target_uid:user.uid,details:"Password changed by owner administrator"});
  res.json({ok:true});
});
router.delete("/users/:id",(req,res)=>{
  const user=db.findOne("users",u=>Number(u.id)===Number(req.params.id)); if(!user)return res.status(404).json({error:"User not found."});
  if(["owner@principle","owner@director"].includes(String(user.uid).toLowerCase()))return res.status(403).json({error:"Owner accounts cannot be removed."});
  db.remove("users",u=>u.id===user.id);
  db.remove("teacher_classes",x=>Number(x.teacher_id)===Number(user.id)); db.remove("teacher_work_access",x=>Number(x.teacher_id)===Number(user.id)); db.remove("teacher_access_grants",x=>Number(x.teacher_id)===Number(user.id));
  db.remove("class_teacher_assignments",x=>Number(x.teacher_id)===Number(user.id));
  db.insert("developer_console_audit",{owner_id:req.user.id,action:"remove_user",target_uid:user.uid,details:"User removed"});
  res.json({ok:true});
});

router.post("/parent-account",imageUpload.fields([{name:"parentImage",maxCount:1},{name:"studentImages",maxCount:5}]),(req,res)=>{
  try{
    const body=req.body||{};
    const parentName=String(body.parentName||"").trim();
    const parentUid=String(body.parentUid||"").trim().toLowerCase();
    const parentPassword=String(body.parentPassword||"");
    const whatsappNo=String(body.whatsappNo||"").trim();
    const parentAge=Number(body.parentAge);
    let students=[];
    try{students=JSON.parse(body.students||"[]")}catch{students=[]}
    if(!parentName||!parentUid||!parentPassword)return res.status(400).json({error:"Parent name, Parent ID and password are required."});
    if(!Number.isInteger(parentAge)||parentAge<18||parentAge>120)return res.status(400).json({error:"Parent age must be between 18 and 120."});
    if(!whatsappNo)return res.status(400).json({error:"Parent WhatsApp number is required."});
    if(parentPassword.length<8)return res.status(400).json({error:"Parent password must contain at least 8 characters."});
    if(!Array.isArray(students)||students.length<1||students.length>5)return res.status(400).json({error:"A Parent ID can contain 1 to 5 students."});
    if(db.findOne("users",u=>String(u.uid).toLowerCase()===parentUid)||db.findOne("students",st=>String(st.student_uid).toLowerCase()===parentUid))return res.status(409).json({error:"Parent ID already exists."});
    const classRows=db.findAll("classes");
    const imageFiles=req.files?.studentImages||[];
    const parentImage=req.files?.parentImage?.[0];
    const normalized=students.map((st,i)=>({
      name:String(st.name||"").trim(), uid:String(st.uid||"").trim().toLowerCase(), password:String(st.password||""),
      classId:Number(st.classId), rollNo:st.rollNo===""||st.rollNo==null?null:Number(st.rollNo), age:Number(st.age), imageIndex:i
    }));
    if(normalized.some(st=>!st.name||!st.uid||st.password.length<8||!Number.isInteger(st.classId)||!Number.isInteger(st.age)||st.age<2||st.age>25))return res.status(400).json({error:"Every student needs name, Student ID, password (8+), valid class and age (2-25)."});
    if(new Set(normalized.map(st=>st.uid)).size!==normalized.length)return res.status(400).json({error:"Student IDs must be unique."});
    for(const st of normalized){if(!classRows.some(c=>Number(c.id)===st.classId))return res.status(400).json({error:`Invalid class for ${st.name}.`});if(db.findOne("users",u=>String(u.uid).toLowerCase()===st.uid)||db.findOne("students",x=>String(x.student_uid).toLowerCase()===st.uid))return res.status(409).json({error:`Student ID ${st.uid} already exists.`});}
    if(imageFiles.length!==normalized.length)return res.status(400).json({error:"Please upload one student image for every student."});
    const {hashPassword}=require("../security/password");
    const parent=db.insert("users",{name:parentName,uid:parentUid,password_hash:hashPassword(parentPassword),role:"parent",whatsapp_no:whatsappNo,parent_age:parentAge,parent_image:parentImage?`/uploads/profiles/${parentImage.filename}`:null,work:"Parent",category:"Parent Account",access_description:"Login with Developer-issued Parent ID and password; access linked students only.",access_to_class:"Linked students",created_by:req.user.id});
    for(const st of normalized){const c=classRows.find(x=>Number(x.id)===st.classId);const img=imageFiles[st.imageIndex];db.insert("students",{student_uid:st.uid,name:st.name,password_hash:hashPassword(st.password),class_id:st.classId,roll_no:st.rollNo,parent_user_id:parent.id,parent_name:parent.name,parent_phone:whatsappNo,parent_age:parentAge,age:st.age,student_image:`/uploads/profiles/${img.filename}`});}
    db.insert("developer_console_audit",{owner_id:req.user.id,action:"create_parent_account",target_uid:parentUid,details:JSON.stringify({student_count:normalized.length})});
    res.status(201).json({ok:true,parent:{id:parent.id,uid:parent.uid,name:parent.name},students:normalized.map(st=>({uid:st.uid,name:st.name,class_name:classRows.find(c=>Number(c.id)===st.classId)?.name||""}))});
  }catch(e){console.error("Parent account creation failed:",e);res.status(400).json({error:e.message||"Unable to create Parent ID."})}
});
router.post("/parent-student",(req,res)=>{
  const {parentName,parentUid,parentPassword,studentName,studentUid,studentPassword,classId,rollNo}=req.body||{};
  if(!parentName||!parentUid||!parentPassword||!studentName||!studentUid||!studentPassword||!classId)return res.status(400).json({error:"Parent and student details plus class are required."});
  if(parentPassword.length<8||studentPassword.length<8)return res.status(400).json({error:"Passwords must contain at least 8 characters."});
  if(db.findOne("users",u=>u.uid===parentUid)||db.findOne("students",s=>s.student_uid===parentUid)||db.findOne("users",u=>u.uid===studentUid)||db.findOne("students",s=>s.student_uid===studentUid))return res.status(409).json({error:"Parent or Student ID already exists."});
  const {hashPassword}=require("../security/password");
  const parent=db.insert("users",{name:parentName.trim(),uid:String(parentUid).trim().toLowerCase(),password_hash:hashPassword(parentPassword),role:"parent",work:"Parent",category:"Parent Account",access_description:"Manage linked students",access_to_class:"Linked students"});
  const student=db.insert("students",{student_uid:String(studentUid).trim().toLowerCase(),name:studentName.trim(),password_hash:hashPassword(studentPassword),class_id:Number(classId),roll_no:rollNo==null||rollNo===""?null:Number(rollNo),parent_user_id:parent.id,parent_name:parent.name});
  res.status(201).json({ok:true,parent_id:parent.id,student_id:student.id});
});
router.delete("/students/:id",(req,res)=>{const s=db.findOne("students",x=>Number(x.id)===Number(req.params.id));if(!s)return res.status(404).json({error:"Student not found."});db.remove("students",x=>x.id===s.id);db.remove("attendance",x=>Number(x.student_id)===s.id);db.remove("attendance_history",x=>Number(x.student_id)===s.id);db.insert("developer_console_audit",{owner_id:req.user.id,action:"remove_student",target_uid:s.student_uid,details:"Student removed"});res.json({ok:true})});

router.get("/teachers",(req,res)=>res.json({teachers:db.findAll("users",u=>u.role==="teacher").sort((a,b)=>a.name.localeCompare(b.name))}));
router.get("/works",(_req,res)=>res.json({works:WORKS}));
router.get("/access",(_req,res)=>res.json({access:db.findAll("teacher_work_access").map(a=>{const u=db.findOne("users",u=>Number(u.id)===Number(a.teacher_id));return {...a,uid:u?.uid,name:u?.name}})}));
router.post("/access",(req,res)=>{
 const {teacher_uid,work_key,enabled=true}=req.body||{};if(!teacher_uid||!WORKS.some(w=>w[0]===work_key))return res.status(400).json({error:"Invalid teacher or work."});
 const t=db.findOne("users",u=>u.uid===teacher_uid&&u.role==="teacher");if(!t)return res.status(404).json({error:"Teacher not found."});
 if(enabled)db.uniqueInsert("teacher_work_access",{teacher_id:t.id,work_key,granted_by:req.user.id,granted_at:new Date().toISOString()},["teacher_id","work_key"]);
 else db.remove("teacher_work_access",a=>Number(a.teacher_id)===Number(t.id)&&a.work_key===work_key);
 db.insert("developer_console_audit",{owner_id:req.user.id,action:enabled?"grant_work":"remove_work",target_uid:teacher_uid,details:JSON.stringify({work_key})});
 res.json({ok:true});
});
router.get("/class-teachers",(_req,res)=>{
 const assignments=db.findAll("class_teacher_assignments").map(a=>{const u=db.findOne("users",u=>Number(u.id)===Number(a.teacher_id));return {...a,uid:u?.uid,name:u?.name}}).sort((a,b)=>String(a.class_name).localeCompare(String(b.class_name)));
 res.json({assignments});
});
router.delete("/class-teacher/:id",(req,res)=>{const a=db.findOne("class_teacher_assignments",x=>Number(x.id)===Number(req.params.id));if(!a)return res.status(404).json({error:"Assignment not found."});db.remove("class_teacher_assignments",x=>Number(x.id)===Number(a.id));const c=db.findOne("classes",x=>x.name===a.class_name);if(c&&Number(c.class_teacher_id)===Number(a.teacher_id))db.update("classes",x=>Number(x.id)===Number(c.id),{class_teacher_id:null});res.json({ok:true})});
router.get("/audit",(_req,res)=>res.json({audit:db.findAll("developer_console_audit").sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,200)}));
module.exports=router;
