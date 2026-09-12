const express=require("express");
const {hashPassword}=require("../security/password");
const db=require("../db/database");
const {auth,allow,teacherScope,displayName}=require("../middleware/auth");
const router=express.Router();
function staff(u){const {password_hash,...s}=u;return {...s,name:displayName(u),display_name:displayName(u)}}
router.get("/",auth,allow("owner","sub-owner","manager"),(req,res)=>{
  res.json({teachers:db.findAll("users",u=>["teacher","manager"].includes(u.role)).sort((a,b)=>a.name.localeCompare(b.name)).map(staff)});
});
router.get("/my-classes",auth,(req,res)=>{
  if(!["teacher","manager"].includes(req.user.role))return res.status(403).json({error:"Teaching staff only."});
  const ids=db.teacherClassIds(req.user.id);
  const classes=db.findAll("classes",c=>ids.includes(Number(c.id))).map(c=>({...c,is_class_teacher:Number(c.class_teacher_id)===Number(req.user.id)}));
  res.json({classes});
});
router.post("/my-classes",auth,allow("teacher"),(req,res)=>{
  const ids=Array.isArray(req.body?.classIds)?req.body.classIds.map(Number).filter(Number.isInteger):[];
  db.remove("teacher_classes",x=>Number(x.teacher_id)===Number(req.user.id));
  for(const id of ids)db.uniqueInsert("teacher_classes",{teacher_id:req.user.id,class_id:id},["teacher_id","class_id"]);
  res.json({message:"Teaching classes updated."});
});
router.post("/class-teacher",auth,allow("teacher"),(req,res)=>{
  const id=Number(req.body?.classId);if(!Number.isInteger(id))return res.status(400).json({error:"Class is required."});
  if(!db.canTeach(req.user,id))return res.status(403).json({error:"You can only choose a class you teach."});
  const c=db.findOne("classes",x=>Number(x.id)===id);if(!c)return res.status(404).json({error:"Class not found."});
  db.update("classes",x=>Number(x.id)===id,{class_teacher_id:req.user.id});
  res.json({message:"You are now the Class Teacher for this class."});
});
router.get("/class-teachers",auth,(req,res)=>{
  const out=db.findAll("classes").sort((a,b)=>a.id-b.id).map(c=>{const u=db.findOne("users",x=>Number(x.id)===Number(c.class_teacher_id));return {id:c.id,name:c.name,class_teacher:u?.name||null,class_teacher_uid:u?.uid||null}});res.json({classes:out});
});
router.post("/students",auth,allow("teacher"),async(req,res)=>{
  const {student_uid,name,class_id,roll_no,parent_name,parent_phone,password}=req.body||{};
  if(!student_uid||!name||!class_id)return res.status(400).json({error:"Student User ID, name and class are required."});
  if(!db.canTeach(req.user,class_id))return res.status(403).json({error:"You can only add students to your assigned classes."});
  if(db.findOne("students",s=>s.student_uid===student_uid)||db.findOne("users",u=>u.uid===student_uid))return res.status(409).json({error:"Student User ID already exists."});
  db.insert("students",{student_uid:String(student_uid).trim(),name:String(name).trim(),password_hash:password?hashPassword(String(password)):null,class_id:Number(class_id),roll_no:roll_no?Number(roll_no):null,parent_name:parent_name||"",parent_phone:parent_phone||""});
  res.status(201).json({message:"Student added."});
});
router.post("/",auth,allow("owner","sub-owner","manager"),async(req,res)=>{
  const {name,uid,password,role,work,category,accessDescription,accessToClass,classId}=req.body||{};
  if(!name||!uid||!password)return res.status(400).json({error:"Name, User ID and password are required."});
  if(!["teacher","manager"].includes(role))return res.status(400).json({error:"Invalid staff role."});
  if(db.findOne("users",u=>u.uid===uid))return res.status(409).json({error:"User ID already exists."});
  const u=db.insert("users",{name,uid,password_hash:hashPassword(password),role,work,category,access_description:accessDescription,access_to_class:accessToClass});
  if(role==="teacher"&&classId)db.uniqueInsert("teacher_classes",{teacher_id:u.id,class_id:Number(classId)},["teacher_id","class_id"]);
  res.status(201).json({id:u.id});
});

router.get("/head-teach",auth,allow("teacher"),(req,res)=>{
  const assigned=db.teacherClassIds(req.user.id);
  const classes=db.findAll("classes").sort((a,b)=>a.id-b.id).map(c=>{
    const teacher=db.findOne("users",u=>Number(u.id)===Number(c.class_teacher_id));
    return {id:c.id,name:c.name,assigned:assigned.includes(Number(c.id)),isMine:Number(c.class_teacher_id)===Number(req.user.id),classTeacher:teacher?{id:teacher.id,name:teacher.name,uid:teacher.uid}:null};
  });
  res.json({classes});
});
router.post("/head-teach",auth,allow("teacher"),(req,res)=>{
  const id=Number(req.body?.classId);
  if(!Number.isInteger(id))return res.status(400).json({error:"Please select a class."});
  if(!db.canTeach(req.user,id))return res.status(403).json({error:"You can only become Class Teacher for a class you teach."});
  const c=db.findOne("classes",x=>Number(x.id)===id);if(!c)return res.status(404).json({error:"Class not found."});
  // Head Teach is a single changeable class-teacher assignment per teacher.
  db.update("classes",x=>Number(x.class_teacher_id)===Number(req.user.id),{class_teacher_id:null});
  db.remove("class_teacher_assignments",x=>Number(x.teacher_id)===Number(req.user.id));
  db.update("classes",x=>Number(x.id)===id,{class_teacher_id:req.user.id});
  db.insert("class_teacher_assignments",{teacher_id:req.user.id,class_name:c.name,assigned_by:req.user.id,assigned_at:new Date().toISOString()});
  res.json({ok:true,message:`You are now Class Teacher of ${c.name}.`});
});
router.delete("/head-teach/:id",auth,allow("teacher"),(req,res)=>{
  const id=Number(req.params.id), c=db.findOne("classes",x=>Number(x.id)===id);
  if(!c||Number(c.class_teacher_id)!==Number(req.user.id))return res.status(403).json({error:"You are not the Class Teacher of this class."});
  db.update("classes",x=>Number(x.id)===id,{class_teacher_id:null});
  res.json({ok:true});
});
module.exports=router;
