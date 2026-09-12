const express=require("express");
const db=require("../db/database");
const {auth}=require("../middleware/auth");
const router=express.Router();
function withClass(s){const c=db.findOne("classes",x=>Number(x.id)===Number(s.class_id));return {...s,class_name:c?.name||null}}
router.get("/summary",auth,(req,res)=>{
  if(req.user.role==="student"){
    const s=db.findOne("students",x=>Number(x.id)===Number(req.user.student_id)||x.student_uid===req.user.uid);
    return res.json({cards:{students:1,teachers:0,classes:s?.class_id?1:0,announcements:0},recentStudents:s?[withClass(s)]:[],recentAnnouncements:[]});
  }
  const students=db.findAll("students").map(withClass).sort((a,b)=>b.id-a.id).slice(0,8);
  const anns=db.findAll("announcements").map(a=>({...a,author:db.findOne("users",u=>Number(u.id)===Number(a.created_by))?.name||"SFPS"})).sort((a,b)=>b.id-a.id).slice(0,5);
  res.json({cards:{students:db.findAll("students").length,teachers:db.findAll("users",u=>["teacher","manager"].includes(u.role)).length,classes:db.findAll("classes").length,announcements:db.findAll("announcements").length},recentStudents:students,recentAnnouncements:anns});
});
router.get("/classes",auth,(req,res)=>{
  const order={LKG:1,NUR:2,UKG:3,"1":4,"2":5,"3":6,"4":7,"5":8,"6":9,"7":10,"8":11,"9":12,"10":13};
  const classes=db.findAll("classes").sort((a,b)=>(order[String(a.name)]||999)-(order[String(b.name)]||999)||Number(a.id)-Number(b.id));
  res.json({classes,count:classes.length});
});
module.exports=router;
