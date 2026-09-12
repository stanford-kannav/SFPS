const express=require("express");
const {hashPassword}=require("../security/password");
const db=require("../db/database");
const {auth,allow,teacherScope}=require("../middleware/auth");
const router=express.Router();
function row(s){const c=db.findOne("classes",x=>Number(x.id)===Number(s.class_id));return {...s,class_name:c?.name||null,password_hash:undefined}}
router.get("/",auth,(req,res)=>{
  let students=db.findAll("students");
  if(req.user.role==="teacher")students=students.filter(s=>db.teacherClassIds(req.user.id).includes(Number(s.class_id)));
  if(req.user.role==="parent")students=students.filter(s=>Number(s.parent_user_id)===Number(req.user.id));
  if(req.user.role==="student")students=students.filter(s=>s.student_uid===req.user.uid);
  res.json({students:students.map(row)});
});
router.post("/",auth,allow("owner","sub-owner","manager"),async(req,res)=>{
  try{
    const {student_uid,name,class_id,roll_no,parent_name,parent_phone,password}=req.body||{};
    if(!student_uid||!name||!class_id)return res.status(400).json({error:"Student User ID, name and class are required."});
    if(db.findOne("students",s=>s.student_uid===student_uid)||db.findOne("users",u=>u.uid===student_uid))return res.status(409).json({error:"Student User ID already exists."});
    db.insert("students",{student_uid:String(student_uid).trim(),name:String(name).trim(),password_hash:password?hashPassword(String(password)):null,class_id:Number(class_id),roll_no:roll_no==null||roll_no===""?null:Number(roll_no),parent_name:parent_name||"",parent_phone:parent_phone||""});
    res.status(201).json({message:"Student created."});
  }catch(e){res.status(400).json({error:e.message})}
});
router.get("/mine",auth,(req,res)=>{
  if(req.user.role!=="student")return res.status(403).json({error:"Student only."});
  const s=db.findOne("students",x=>x.student_uid===req.user.uid); if(!s)return res.status(404).json({error:"Student not found."});
  res.json({student:row(s)});
});
router.get("/classes",auth,(req,res)=>res.json({classes:db.findAll("classes").sort((a,b)=>a.id-b.id)}));
module.exports=router;
