const express=require("express");
const db=require("../db/database");
const { attendanceOnceToday } = db;
const {auth,requireOwner,requireAdmin}=require("../middleware/auth");
const router=express.Router();
const GRANTABLE=new Set(["syllabus","homework","attendance","results","fees","class_management","students","reports","teacher_registry"]);
router.get("/teachers",auth,requireAdmin,(req,res)=>res.json({teachers:db.findAll("users",u=>u.role==="teacher").sort((a,b)=>a.name.localeCompare(b.name))}));
router.get("/grants",auth,requireAdmin,(req,res)=>{
  const rows=db.findAll("teacher_access_grants").map(g=>{const u=db.findOne("users",u=>Number(u.id)===Number(g.teacher_id));return {...g,name:u?.name,uid:u?.uid}});res.json({grants:rows});
});
router.post("/grant",auth,requireAdmin,(req,res)=>{
  const {teacher_uid,feature_key}=req.body||{};if(!teacher_uid||!GRANTABLE.has(feature_key))return res.status(400).json({error:"Invalid teacher or feature."});
  const t=db.findOne("users",u=>u.uid===teacher_uid&&u.role==="teacher");if(!t)return res.status(404).json({error:"Teacher not found."});
  db.uniqueInsert("teacher_access_grants",{teacher_id:t.id,feature_key,granted_by:req.user.id,granted_at:new Date().toISOString()},["teacher_id","feature_key"]);
  res.json({ok:true});
});
router.delete("/grant",auth,requireAdmin,(req,res)=>{
  const {teacher_uid,feature_key}=req.body||{};const t=db.findOne("users",u=>u.uid===teacher_uid&&u.role==="teacher");if(!t)return res.status(404).json({error:"Teacher not found."});
  db.remove("teacher_access_grants",x=>Number(x.teacher_id)===Number(t.id)&&x.feature_key===feature_key);res.json({ok:true});
});
router.get("/seat-planning",auth,(req,res)=>{const ownerAllowed=db.setting("seat_planning_enabled","false")==="true";res.json({allowed:["ajeet@sir","owner@principle","owner@director"].includes(String(req.user.uid||"").toLowerCase())&&ownerAllowed,ownerAllowed})});
router.post("/seat-planning",auth,requireOwner,(req,res)=>{const enabled=Boolean(req.body?.enabled);db.setSetting("seat_planning_enabled",enabled,req.user.id);res.json({ok:true,enabled})});
module.exports=router;
