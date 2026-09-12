const express=require("express");
const db=require("../db/database");
const { attendanceOnceToday, isSundayOrHoliday } = db;
const {auth,allow}=require("../middleware/auth");
const router=express.Router();

function today(){return new Date().toISOString().slice(0,10)}
function studentView(s){
  const c=db.findOne("classes",x=>Number(x.id)===Number(s.class_id));
  return {...s,class_name:c?.name||null,password_hash:undefined};
}
function registryEnabled(){return db.setting("teacher_attendance_registry_enabled","false")==="true"}
function teacherCan(req,classId){return db.canTeach(req.user,classId)}
function hasGrant(user,key){
  if(["owner","sub-owner","manager"].includes(user.role))return true;
  if(user.role!=="teacher")return false;
  if(db.findOne("teacher_work_access",x=>Number(x.teacher_id)===Number(user.id)&&x.work_key===key))return true;
  if(db.findOne("teacher_access_grants",x=>Number(x.teacher_id)===Number(user.id)&&x.feature_key===key))return true;
  const text=(user.access_description||"").toLowerCase();
  if(key==="attendance"&&text.includes("attendence"))return true;
  if(key==="syllabus"&&text.includes("syllabus"))return true;
  if(key==="homework"&&text.includes("homework"))return true;
  if(key==="results"&&text.includes("result"))return true;
  if(key==="fees"&&text.includes("fee"))return true;
  return false;
}

router.get("/attendance",auth,(req,res)=>{
  const date=req.query.date||today();
  const closure=isSundayOrHoliday(date);
  let students=db.findAll("students");
  if(req.user.role==="teacher")students=students.filter(s=>db.teacherClassIds(req.user.id).includes(Number(s.class_id)));
  if(req.user.role==="parent"){
    const linked=new Set(db.findAll("students",s=>Number(s.parent_user_id)===Number(req.user.id)).map(s=>Number(s.id)));
    students=students.filter(s=>linked.has(Number(s.id)));
  }
  if(req.user.role==="student")students=students.filter(s=>s.student_uid===req.user.uid);
  if(req.query.classId)students=students.filter(s=>Number(s.class_id)===Number(req.query.classId));
  if(req.query.studentId)students=students.filter(s=>Number(s.id)===Number(req.query.studentId));
  const rows=students.map(s=>{
    const a=db.findOne("attendance",x=>Number(x.student_id)===Number(s.id)&&String(x.attendance_date)===String(date));
    const c=db.findOne("classes",x=>Number(x.id)===Number(s.class_id));
    return {student_id:s.id,student_uid:s.student_uid,name:s.name,roll_no:s.roll_no,class_id:s.class_id,class_name:c?.name||null,status:a?.status||null,attendance_id:a?.id||null,marked_by:a?.marked_by||null,updated_at:a?.updated_at||a?.created_at||null};
  }).sort((a,b)=>(a.class_id||0)-(b.class_id||0)||(a.roll_no||999)-(b.roll_no||999));
  res.json({attendance:rows,date,closed:closure.closed,closureReason:closure.sunday?"Sunday":closure.holiday?.name||(closure.allOff?"Attendance has been turned off by the Owner/Sub-owner.":null)});
});
router.get("/attendance/history",auth,(req,res)=>{
  const studentId=Number(req.query.studentId||0), classId=Number(req.query.classId||0);
  let rows=db.findAll("attendance_history");
  if(req.user.role==="teacher"){
    const ids=new Set(db.teacherClassIds(req.user.id));
    rows=rows.filter(r=>{const st=db.findOne("students",s=>Number(s.id)===Number(r.student_id));return st&&ids.has(Number(st.class_id));});
  } else if(req.user.role==="student"){
    const st=db.findOne("students",s=>s.student_uid===req.user.uid); rows=rows.filter(r=>Number(r.student_id)===Number(st?.id));
  } else if(req.user.role==="parent"){
    const ids=new Set(db.findAll("students",s=>Number(s.parent_user_id)===Number(req.user.id)).map(s=>Number(s.id))); rows=rows.filter(r=>ids.has(Number(r.student_id)));
  }
  if(studentId)rows=rows.filter(r=>Number(r.student_id)===studentId);
  if(classId)rows=rows.filter(r=>Number(r.class_id)===classId);
  rows.sort((a,b)=>String(b.attendance_date).localeCompare(String(a.attendance_date))||Number(b.student_id)-Number(a.student_id));
  res.json({history:rows.slice(0,1000)});
});
router.post("/attendance",auth,(req,res)=>{
  if(!["owner","sub-owner","manager","teacher"].includes(req.user.role))return res.status(403).json({error:"No attendance permission."});
  const {studentId,date,status}=req.body||{};
  if(!studentId||!date||!["present","absent","late","leave"].includes(status))return res.status(400).json({error:"Invalid attendance data."});
  const s=db.findOne("students",x=>Number(x.id)===Number(studentId));
  const closure=isSundayOrHoliday(date);
  if(closure.closed)return res.status(423).json({error:"Attendance is closed for this date.",reason:closure.sunday?"Sunday":closure.holiday?.name||"Attendance has been turned off by the Owner/Sub-owner."});
  if(!s||!db.canTeach(req.user,s.class_id))return res.status(403).json({error:"You cannot mark attendance for this class."});
  const old=db.findOne("attendance",a=>Number(a.student_id)===Number(studentId)&&String(a.attendance_date)===String(date));
  const now=new Date().toISOString();
  if(old){
    db.insert("attendance_history",{student_id:Number(studentId),class_id:Number(s.class_id),attendance_date:date,old_status:old.status||null,new_status:status,changed_by:req.user.id,changed_at:now,action:"update"});
    db.update("attendance",x=>x.id===old.id,{status,marked_by:req.user.id,updated_at:now});
  } else {
    db.insert("attendance",{student_id:Number(studentId),attendance_date:date,status,marked_by:req.user.id,updated_at:now});
    db.insert("attendance_history",{student_id:Number(studentId),class_id:Number(s.class_id),attendance_date:date,old_status:null,new_status:status,changed_by:req.user.id,changed_at:now,action:"create"});
  }
  res.json({message:"Attendance saved."});
});
router.post("/attendance/bulk",auth,(req,res)=>{
  if(!["owner","sub-owner","manager","teacher"].includes(req.user.role))return res.status(403).json({error:"No attendance permission."});
  const date=String(req.body?.date||today()); const entries=Array.isArray(req.body?.entries)?req.body.entries:[];
  if(!entries.length)return res.status(400).json({error:"No attendance entries supplied."});
  const closure=isSundayOrHoliday(date); if(closure.closed)return res.status(423).json({error:"Attendance is closed for this date.",reason:closure.sunday?"Sunday":closure.holiday?.name||"Attendance has been turned off by the Owner/Sub-owner."});
  let saved=0;
  for(const entry of entries){
    const studentId=Number(entry.studentId),status=String(entry.status||"");
    if(!studentId||!["present","absent","late","leave"].includes(status))continue;
    const st=db.findOne("students",x=>Number(x.id)===studentId); if(!st||!db.canTeach(req.user,st.class_id))continue;
    const old=db.findOne("attendance",a=>Number(a.student_id)===studentId&&String(a.attendance_date)===date),now=new Date().toISOString();
    if(old){db.insert("attendance_history",{student_id:studentId,class_id:Number(st.class_id),attendance_date:date,old_status:old.status||null,new_status:status,changed_by:req.user.id,changed_at:now,action:"update"});db.update("attendance",x=>x.id===old.id,{status,marked_by:req.user.id,updated_at:now});}
    else{db.insert("attendance",{student_id:studentId,attendance_date:date,status,marked_by:req.user.id,updated_at:now});db.insert("attendance_history",{student_id:studentId,class_id:Number(st.class_id),attendance_date:date,old_status:null,new_status:status,changed_by:req.user.id,changed_at:now,action:"create"});}
    saved++;
  }
  res.json({ok:true,saved,date});
});

router.get("/teacher-registry",auth,(req,res)=>{
  if(!["owner","sub-owner","manager","teacher"].includes(req.user.role))return res.status(403).json({error:"No teacher registry permission."});
  const date=req.query.date||today();const enabled=registryEnabled();const closure=isSundayOrHoliday(date);
   if(closure.closed)return res.json({enabled:false,date,closed:true,reason:closure.sunday?"Sunday":closure.holiday?.name||"Attendance has been turned off by the Owner/Sub-owner.",registry:[]});
  if(!enabled)return res.json({enabled,date,registry:[]});
  const registry=db.findAll("users",u=>["teacher","manager"].includes(u.role)).map(u=>{
    const a=db.findOne("teacher_attendance",x=>Number(x.teacher_id)===Number(u.id)&&x.attendance_date===date);
    return {id:u.id,name:u.name,uid:u.uid,role:u.role,attendance_date:date,check_in:a?.check_in||null,check_out:a?.check_out||null,status:a?.status||null,note:a?.note||""};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  res.json({enabled,date,registry});
});
router.post("/teacher-registry/allow",auth,allow("owner","manager","sub-owner"),(req,res)=>{
  const enabled=Boolean(req.body?.enabled);
  db.setSetting("teacher_attendance_registry_enabled",enabled,""+req.user.id);
  res.json({enabled});
});

function localClockIndia(){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());
  const h=parts.find(x=>x.type==="hour")?.value||"00", m=parts.find(x=>x.type==="minute")?.value||"00";
  return `${h}:${m}`;
}
function localDateIndia(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function distanceMeters(lat1,lon1,lat2,lon2){
  const R=6371000, rad=Math.PI/180;
  const dLat=(lat2-lat1)*rad, dLon=(lon2-lon1)*rad;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function autoAttendanceResult(req){
  const lat=Number(req.body?.latitude), lon=Number(req.body?.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return {status:400,error:"Location coordinates are required."};
  const schoolLat=Number(db.setting("school_latitude","25.20252"));
  const schoolLon=Number(db.setting("school_longitude","85.52436"));
  const radius=Number(db.setting("school_geofence_radius_m","150"));
  const distance=Math.round(distanceMeters(lat,lon,schoolLat,schoolLon));
  const inside=distance<=radius;
  const nowClock=localClockIndia();
  const afterEight=nowClock>=(db.setting("teacher_auto_attendance_after","08:00"));
  return {lat,lon,distance,radius,inside,afterEight,clock:nowClock,date:localDateIndia()};
}

router.post("/teacher-registry/auto-check-in",auth,(req,res)=>{
  if(!["teacher","manager"].includes(req.user.role))return res.status(403).json({error:"Automatic attendance is for teaching staff."});
  if(!registryEnabled())return res.status(423).json({error:"Teacher attendance registry has not been enabled by the Owner."});
  const check=autoAttendanceResult(req);
  if(check.status)return res.status(check.status).json({error:check.error});
  // Location is always required; before 08:00 the school geofence is the only trigger, and after 08:00 the teacher may use the normal check-in flow.
  if(!check.inside)return res.status(403).json({error:"Automatic attendance is accepted only when the device is at Stanford Public School.",...check});
  const old=db.findOne("teacher_attendance",x=>Number(x.teacher_id)===Number(req.user.id)&&x.attendance_date===check.date);
  if(old){
    if(!old.check_in)db.update("teacher_attendance",x=>x.id===old.id,{check_in:new Date().toISOString(),status:"present",location_verified:true,distance_m:check.distance,auto_marked:true});
    return res.json({ok:true,alreadyPresent:true,message:"Teacher attendance is already recorded for today.",distance:check.distance,insideSchool:check.inside,clock:check.clock,date:check.date});
  }
  attendanceOnceToday(req.user.id,{teacher_id:req.user.id,attendance_date:check.date,check_in:new Date().toISOString(),check_out:null,status:"present",marked_by:req.user.id,location_verified:check.inside,distance_m:check.distance,auto_marked:true});
  res.json({ok:true,alreadyPresent:false,message:"Attendance automatically recorded.",distance:check.distance,insideSchool:check.inside,clock:check.clock,date:check.date});
});

router.post("/teacher-registry/check-in",auth,(req,res)=>{
  if(!["teacher","manager"].includes(req.user.role))return res.status(403).json({error:"Teacher registry is for teaching staff."});
  if(!registryEnabled())return res.status(423).json({error:"Teacher attendance registry has not been enabled by the Owner."});
  const check=autoAttendanceResult(req);
  if(check.status)return res.status(check.status).json({error:check.error});
  if(!check.inside)return res.status(403).json({error:"Check-in accepted only at Stanford Public School, Garhpar, Bihar Sharif, Nalanda, Bihar, India.",distance:check.distance,radius:check.radius});
  const d=check.date,old=db.findOne("teacher_attendance",x=>Number(x.teacher_id)===Number(req.user.id)&&x.attendance_date===d);
  if(old)return res.json({ok:true,alreadyPresent:true,message:"Teacher attendance is already recorded for today.",date:d});
  const saved=attendanceOnceToday(req.user.id,{teacher_id:req.user.id,attendance_date:d,check_in:new Date().toISOString(),check_out:null,status:"present",marked_by:req.user.id,location_verified:true,distance_m:check.distance});
  if(!saved.ok)return res.status(423).json({error:saved.reason});
  res.json({ok:true,alreadyPresent:false,message:"Teacher attendance registered.",date:d,distance:check.distance});
});
router.post("/teacher-registry/check-out",auth,(req,res)=>{
  if(!["teacher","manager"].includes(req.user.role))return res.status(403).json({error:"Teacher registry is for teaching staff."});
  if(!registryEnabled())return res.status(423).json({error:"Teacher attendance registry has not been enabled by the Owner."});
  const d=today(),old=db.findOne("teacher_attendance",x=>Number(x.teacher_id)===Number(req.user.id)&&x.attendance_date===d);
  if(!old)return res.status(400).json({error:"Check in first."});
  db.update("teacher_attendance",x=>x.id===old.id,{check_out:new Date().toISOString()});res.json({message:"Teacher check-out recorded.",date:d});
});

function daysRemaining(endDate){
  if(!endDate)return null;
  const end=new Date(`${endDate}T23:59:59`);
  if(Number.isNaN(end.getTime()))return null;
  return Math.max(0,Math.ceil((end.getTime()-Date.now())/86400000));
}
function periodSnapshot(){
  return db.findAll("academic_periods").sort((a,b)=>Number(a.order)-Number(b.order)).map(p=>({...p,remaining_days:daysRemaining(p.end_date)}));
}
function syllabusPeriods(row){
  const source=row?.chapters_by_period||{};
  return periodSnapshot().map(p=>({code:p.code,name:p.name,order:p.order,start_date:p.start_date||null,end_date:p.end_date||null,remaining_days:p.remaining_days,planned_chapters:Number(source[p.code]||0)}));
}
function syllabusView(x){
  const c=db.findOne("classes",c=>Number(c.id)===Number(x.class_id));
  const u=db.findOne("users",u=>Number(u.id)===Number(x.updated_by));
  const total=Number(x.total_chapters||0);
  const taught=Math.max(0,Math.min(total,Number(x.chapters_taught||0)));
  const planned=Object.values(x.chapters_by_period||{}).reduce((n,v)=>n+(Number(v)||0),0);
  const term2=db.findOne("academic_periods",p=>p.code==="term_2_final");
  const computedRemaining=daysRemaining(term2?.end_date);
  const progress=total?Math.round((taught/total)*100):Number(x.progress_percent||0);
  return {...x,class_name:c?.name||"",updated_by_name:u?.name||"",total_chapters:total,chapters_taught:taught,chapters_remaining:Math.max(0,total-taught),planned_chapters:planned,unplanned_chapters:Math.max(0,total-planned),progress_percent:progress,time_period_remaining_days:computedRemaining??(x.time_period_remaining_days==null?null:Number(x.time_period_remaining_days)),periods:syllabusPeriods(x)};
}

router.get("/periods",auth,(req,res)=>{
  res.json({periods:periodSnapshot()});
});
router.put("/periods",auth,allow("owner","manager","sub-owner"),(req,res)=>{
  const incoming=Array.isArray(req.body?.periods)?req.body.periods:[];
  const allowed=new Set(["periodic_1","periodic_2","term_1","periodic_3","periodic_4","term_2_final"]);
  for(const item of incoming){
    if(!allowed.has(String(item.code)))continue;
    const start=item.startDate||item.start_date||null;
    const end=item.endDate||item.end_date||null;
    if(start && !/^\d{4}-\d{2}-\d{2}$/.test(start))return res.status(400).json({error:`Invalid start date for ${item.code}.`});
    if(end && !/^\d{4}-\d{2}-\d{2}$/.test(end))return res.status(400).json({error:`Invalid end date for ${item.code}.`});
    if(start&&end&&new Date(start)>new Date(end))return res.status(400).json({error:`Start date cannot be after end date for ${item.code}.`});
    db.update("academic_periods",p=>p.code===item.code,{start_date:start,end_date:end,updated_by:req.user.id,updated_at:new Date().toISOString()});
  }
  res.json({periods:periodSnapshot()});
});

router.get("/syllabus",auth,(req,res)=>{
  let rows=db.findAll("syllabus");
  if(req.user.role==="teacher")rows=rows.filter(x=>db.teacherClassIds(req.user.id).includes(Number(x.class_id)));
  if(req.user.role==="student")rows=rows.filter(x=>Number(x.class_id)===Number(db.findOne("students",s=>s.student_uid===req.user.uid)?.class_id));
  if(req.user.role==="parent"){
    const linked=db.findAll("students",s=>Number(s.parent_user_id)===Number(req.user.id));
    const wanted=Number(req.query.studentId||0);
    const selected=linked.find(s=>Number(s.id)===wanted);
    const studentClasses=(selected?[selected]:linked).map(s=>Number(s.class_id));
    rows=rows.filter(x=>studentClasses.includes(Number(x.class_id)));
  }
  res.json({syllabus:rows.map(syllabusView).sort((a,b)=>a.class_id-b.class_id||String(a.subject).localeCompare(String(b.subject))||b.id-a.id)});
});
router.post("/syllabus",auth,(req,res)=>{
  if(!["owner","sub-owner","manager","teacher"].includes(req.user.role))return res.status(403).json({error:"No syllabus permission."});
  const body=req.body||{};
  const classId=Number(body.classId), subject=String(body.subject||"").trim();
  const total=Math.max(0,Math.floor(Number(body.totalChapters)||0));
  const taught=Math.max(0,Math.min(total,Math.floor(Number(body.chaptersTaught)||0)));
  if(!classId||!subject||total<1)return res.status(400).json({error:"Class, subject and total chapters are required."});
  if(req.user.role==="teacher"&&!teacherCan(req,classId))return res.status(403).json({error:"You can only create syllabus for a class you teach."});
  const codes=["periodic_1","periodic_2","term_1","periodic_3","periodic_4","term_2_final"];
  const raw=body.chaptersByPeriod||{};
  const chaptersByPeriod={};
  let planned=0;
  for(const code of codes){const n=Math.max(0,Math.floor(Number(raw[code])||0));chaptersByPeriod[code]=n;planned+=n;}
  if(planned>total)return res.status(400).json({error:`Planned chapters (${planned}) cannot exceed total chapters (${total}).`});
  const term2=db.findOne("academic_periods",p=>p.code==="term_2_final");
  const fallback=body.timePeriodRemainingDays==null||body.timePeriodRemainingDays===""?null:Math.max(0,Math.floor(Number(body.timePeriodRemainingDays)||0));
  const title=String(body.title||`${subject} · Annual Syllabus`).trim();
  const x=db.insert("syllabus",{
    class_id:classId,subject,title,details:String(body.details||""),total_chapters:total,chapters_taught:taught,
    chapters_by_period:chaptersByPeriod,progress_percent:total?Math.round(taught/total*100):0,
    completion_note:String(body.completionNote||""),last_taught_on:body.lastTaughtOn||null,
    time_period_remaining_days:fallback,updated_by:req.user.id,updated_at:new Date().toISOString()
  });
  res.status(201).json({message:"Syllabus saved.",syllabus:syllabusView(x),school_term_2_end_date:term2?.end_date||null});
});
router.put("/syllabus/:id",auth,(req,res)=>{
  const old=db.findOne("syllabus",x=>Number(x.id)===Number(req.params.id));
  if(!old)return res.status(404).json({error:"Syllabus entry not found."});
  if(req.user.role==="teacher"&&!teacherCan(req,old.class_id))return res.status(403).json({error:"You cannot update this class."});
  if(!["owner","sub-owner","manager","teacher"].includes(req.user.role))return res.status(403).json({error:"No syllabus permission."});
  const total=req.body.totalChapters==null?Number(old.total_chapters||0):Math.max(1,Math.floor(Number(req.body.totalChapters)||1));
  const taught=req.body.chaptersTaught==null?Number(old.chapters_taught||0):Math.max(0,Math.min(total,Math.floor(Number(req.body.chaptersTaught)||0)));
  const raw=req.body.chaptersByPeriod||old.chapters_by_period||{};
  const codes=["periodic_1","periodic_2","term_1","periodic_3","periodic_4","term_2_final"],chaptersByPeriod={};let planned=0;
  for(const code of codes){const n=Math.max(0,Math.floor(Number(raw[code])||0));chaptersByPeriod[code]=n;planned+=n;}
  if(planned>total)return res.status(400).json({error:`Planned chapters (${planned}) cannot exceed total chapters (${total}).`});
  db.update("syllabus",x=>Number(x.id)===Number(old.id),x=>({...x,subject:req.body.subject??x.subject,title:req.body.title??x.title,details:req.body.details??x.details,total_chapters:total,chapters_taught:taught,chapters_by_period:chaptersByPeriod,progress_percent:Math.round(taught/total*100),completion_note:req.body.completionNote??x.completion_note,last_taught_on:req.body.lastTaughtOn??x.last_taught_on,time_period_remaining_days:req.body.timePeriodRemainingDays==null?x.time_period_remaining_days:Math.max(0,Math.floor(Number(req.body.timePeriodRemainingDays)||0)),updated_by:req.user.id,updated_at:new Date().toISOString()}));
  res.json({message:"Syllabus updated.",syllabus:syllabusView(db.findOne("syllabus",x=>Number(x.id)===Number(old.id)))});
});


function diaryView(x){
  const c=db.findOne("classes",c=>Number(c.id)===Number(x.class_id));
  const u=db.findOne("users",u=>Number(u.id)===Number(x.created_by));
  return {...x,class_name:c?.name||"",teacher_name:u?.name||""};
}
router.get("/diary",auth,(req,res)=>{
  let rows=db.findAll("teacher_diary");
  if(req.user.role==="teacher") rows=rows.filter(x=>db.teacherClassIds(req.user.id).includes(Number(x.class_id)));
  if(req.user.role==="student"){
    const s=db.findOne("students",s=>s.student_uid===req.user.uid);
    const wanted=Number(req.query.studentId||s?.id||0);
    if(s && wanted===Number(s.id)) rows=rows.filter(x=>Number(x.class_id)===Number(s.class_id));
    else rows=[];
  }
  if(req.user.role==="parent"){
    const linked=db.findAll("students",s=>Number(s.parent_user_id)===Number(req.user.id));
    const wanted=Number(req.query.studentId||linked[0]?.id||0);
    const child=linked.find(s=>Number(s.id)===wanted);
    rows=child?rows.filter(x=>Number(x.class_id)===Number(child.class_id)):rows=[];
  }
  if(["owner","sub-owner","manager"].includes(req.user.role) && req.query.classId) rows=rows.filter(x=>Number(x.class_id)===Number(req.query.classId));
  res.json({diary:rows.map(diaryView).sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.period)-Number(a.period)||b.id-a.id)});
});
router.post("/diary",auth,(req,res)=>{
  if(!["owner","sub-owner","manager","teacher"].includes(req.user.role))return res.status(403).json({error:"Only teaching staff can create diary entries."});
  const {classId,date,period,cwWritten,hwWritten,subject,notes}=req.body||{};
  const cid=Number(classId), per=Number(period);
  if(!cid||!/^\d{4}-\d{2}-\d{2}$/.test(String(date||""))||!per||per<1||per>12||!String(cwWritten||"").trim()&&!String(hwWritten||"").trim())
    return res.status(400).json({error:"Class, date, period and C.W or H.W are required."});
  if(req.user.role==="teacher"&&!teacherCan(req,cid))return res.status(403).json({error:"You cannot write a diary entry for this class."});
  const existing=db.findOne("teacher_diary",x=>Number(x.class_id)===cid&&String(x.date)===String(date)&&Number(x.period)===per&&Number(x.created_by)===Number(req.user.id));
  const payload={class_id:cid,date:String(date),period:per,subject:String(subject||""),cw_written:String(cwWritten||""),hw_written:String(hwWritten||""),notes:String(notes||""),created_by:req.user.id,updated_at:new Date().toISOString()};
  const row=existing?(db.update("teacher_diary",x=>x.id===existing.id,payload),db.findOne("teacher_diary",x=>x.id===existing.id)):db.insert("teacher_diary",payload);
  res.json({ok:true,diary:diaryView(row)});
});
router.delete("/diary/:id",auth,(req,res)=>{
  const row=db.findOne("teacher_diary",x=>Number(x.id)===Number(req.params.id));
  if(!row)return res.status(404).json({error:"Diary entry not found."});
  if(req.user.role==="teacher" && Number(row.created_by)!==Number(req.user.id))return res.status(403).json({error:"You can only remove your own diary entries."});
  if(!["teacher","manager","owner","sub-owner"].includes(req.user.role))return res.status(403).json({error:"No diary permission."});
  db.remove("teacher_diary",x=>Number(x.id)===Number(row.id));res.json({ok:true});
});
router.get("/homework",auth,(req,res)=>{
  let rows=db.findAll("homework");if(req.user.role==="teacher")rows=rows.filter(x=>db.teacherClassIds(req.user.id).includes(Number(x.class_id)));
  rows=rows.map(x=>{const c=db.findOne("classes",c=>Number(c.id)===Number(x.class_id));return {...x,class_name:c?.name||""}}).sort((a,b)=>String(a.due_date||"9999").localeCompare(String(b.due_date||"9999"))||b.id-a.id);
  res.json({homework:rows});
});
router.post("/homework",auth,(req,res)=>{
  if(!["owner","sub-owner","manager","teacher"].includes(req.user.role)||!hasGrant(req.user,"homework"))return res.status(403).json({error:"No homework permission."});
  const {classId,subject,title,details,dueDate}=req.body||{};if(!classId||!subject||!title)return res.status(400).json({error:"Class, subject and title are required."});
  if(!teacherCan(req,classId))return res.status(403).json({error:"You cannot update this class."});
  const x=db.insert("homework",{class_id:Number(classId),subject,title,details:details||"",due_date:dueDate||null,created_by:req.user.id});res.status(201).json({id:x.id});
});

router.get("/announcements",auth,(req,res)=>{
  const rows=db.findAll("announcements").sort((a,b)=>String(b.created_at||b.id).localeCompare(String(a.created_at||a.id))).slice(0,100);
  res.json({announcements:rows});
});
router.get("/teachers-for-rating",auth,(req,res)=>res.json({teachers:db.findAll("users",u=>["teacher","manager","owner","sub-owner"].includes(u.role)).map(u=>({id:u.id,uid:u.uid,name:u.name}))}));
router.get("/teacher-ratings",auth,(req,res)=>{
  const rows=db.findAll("teacher_ratings").map(r=>{const t=db.findOne("users",u=>Number(u.id)===Number(r.teacher_id));return {...r,teacher_name:t?.name||"Teacher",teacher_uid:t?.uid||""}});
  res.json({ratings:rows.sort((a,b)=>b.id-a.id)});
});
router.post("/teacher-ratings",auth,(req,res)=>{
  if(req.user.role!=="parent")return res.status(403).json({error:"Only parents can rate teachers."});
  const teacherUid=String(req.body?.teacherUid||"").trim().toLowerCase(), rating=Math.floor(Number(req.body?.rating));
  if(!teacherUid||rating<1||rating>5)return res.status(400).json({error:"Teacher and a 1-5 star rating are required."});
  const t=db.findOne("users",u=>String(u.uid).toLowerCase()===teacherUid&&["teacher","manager","owner","sub-owner"].includes(u.role));
  if(!t)return res.status(404).json({error:"Teacher not found."});
  const existing=db.findOne("teacher_ratings",r=>Number(r.parent_user_id)===Number(req.user.id)&&Number(r.teacher_id)===Number(t.id));
  const row={parent_user_id:req.user.id,teacher_id:t.id,rating,comment:String(req.body?.comment||"").slice(0,1000),updated_at:new Date().toISOString()};
  if(existing)db.update("teacher_ratings",r=>r.id===existing.id,row);else db.insert("teacher_ratings",row);
  res.json({ok:true});
});

router.get("/results",auth,(req,res)=>{
  let rows=db.findAll("exam_results");
  rows=rows.filter(x=>{
    const st=db.findOne("students",s=>Number(s.id)===Number(x.student_id));
    if(req.user.role==="student") return st?.student_uid===req.user.uid;
    if(req.user.role==="parent") return Number(st?.parent_user_id)===Number(req.user.id) && (!req.query.studentId || Number(st.id)===Number(req.query.studentId));
    return true;
  });
  rows=rows.map(x=>{const st=db.findOne("students",s=>Number(s.id)===Number(x.student_id));const c=db.findOne("classes",c=>Number(c.id)===Number(st?.class_id));return {...x,student_uid:undefined,name:st?.name,class_id:st?.class_id,class_name:c?.name||null};}).sort((a,b)=>b.id-a.id);
  res.json({results:rows});
});
router.post("/results",auth,allow("owner","manager","sub-owner","teacher"),(req,res)=>{
  const studentId=Number(req.body?.studentId), examName=String(req.body?.examName||"").trim(), examDate=String(req.body?.examDate||"").trim();
  const subjects=Array.isArray(req.body?.subjects)?req.body.subjects:[];
  if(!studentId||!examName||!subjects.length)return res.status(400).json({error:"Student, examination and at least one subject are required."});
  const st=db.findOne("students",s=>Number(s.id)===studentId);if(!st)return res.status(404).json({error:"Student not found."});
  if(req.user.role==="teacher"&&!db.teacherClassIds(req.user.id).includes(Number(st.class_id)))return res.status(403).json({error:"Teachers can create results only for their teaching classes."});
  const clean=subjects.map(x=>({subject:String(x.subject||"").trim().slice(0,120),max_marks:Number(x.maxMarks),marks:Number(x.marks)}));
  if(clean.some(x=>!x.subject||!Number.isFinite(x.max_marks)||x.max_marks<=0||!Number.isFinite(x.marks)||x.marks<0||x.marks>x.max_marks))return res.status(400).json({error:"Invalid subject marks."});
  const totalMarks=clean.reduce((n,x)=>n+x.max_marks,0), totalObtained=clean.reduce((n,x)=>n+x.marks,0), percentage=totalMarks?Number(((totalObtained/totalMarks)*100).toFixed(2)):0;
  const grade=percentage>=90?"A+":percentage>=80?"A":percentage>=70?"B+":percentage>=60?"B":percentage>=50?"C":percentage>=40?"D":"E";
  const created=clean.map(x=>db.insert("exam_results",{student_id:studentId,exam_name:examName,exam_date:examDate||null,subject:x.subject,marks:x.marks,max_marks:x.max_marks,total_marks:totalMarks,total_obtained:totalObtained,percentage,grade,entered_by:req.user.id}));
  res.status(201).json({ok:true,count:created.length,totalMarks,totalObtained,percentage,grade});
});
router.get("/fees",auth,(req,res)=>{
  let rows=db.findAll("fees");rows=rows.filter(x=>{
    const s=db.findOne("students",s=>Number(s.id)===Number(x.student_id));
    if(req.user.role==="student")return s?.student_uid===req.user.uid;
    if(req.user.role==="parent"){
      const linked=Number(s?.parent_user_id)===Number(req.user.id);
      return linked && (!req.query.studentId || Number(s.id)===Number(req.query.studentId));
    }
    return true;
  });
  rows=rows.map(x=>{const s=db.findOne("students",s=>Number(s.id)===Number(x.student_id));const v=studentView(s||{});return {...x,student_uid:s?.student_uid,name:s?.name,class_name:v.class_name}}).sort((a,b)=>b.id-a.id);res.json({fees:rows});
});
router.post("/fees",auth,allow("owner","manager","sub-owner"),(req,res)=>{const {studentId,feeType,amount,status}=req.body||{};if(!studentId||!feeType)return res.status(400).json({error:"Student and fee type are required."});const x=db.insert("fees",{student_id:Number(studentId),fee_type:feeType,amount:Number(amount)||0,status:status||"pending"});res.status(201).json({id:x.id})});

router.get("/holidays",auth,(req,res)=>{
  if(!["owner","sub-owner","manager","teacher"].includes(req.user.role))return res.status(403).json({error:"No holiday permission."});
  res.json({holidays:db.findAll("school_holidays",h=>h.active!==false).sort((x,y)=>String(x.date).localeCompare(String(y.date)))});
});
router.post("/holidays",auth,allow("owner","sub-owner"),(req,res)=>{
  const {date,name}=req.body||{};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||""))||!String(name||"").trim())return res.status(400).json({error:"Date and holiday name are required."});
  const existing=db.findOne("school_holidays",h=>String(h.date)===String(date));
  if(existing){db.update("school_holidays",h=>h.id===existing.id,{name:String(name).trim(),active:true,declared_by:req.user.id});return res.json({ok:true,holiday:db.findOne("school_holidays",h=>h.id===existing.id)});}
  res.json({ok:true,holiday:db.insert("school_holidays",{date:String(date),name:String(name).trim(),active:true,declared_by:req.user.id})});
});
router.delete("/holidays/:id",auth,allow("owner","sub-owner"),(req,res)=>{
  const id=Number(req.params.id); const n=db.update("school_holidays",h=>Number(h.id)===id,{active:false,deleted_by:req.user.id});
  res.json({ok:n>0});
});
router.post("/attendance/global-off",auth,allow("owner","sub-owner"),(req,res)=>{
  const off=Boolean(req.body?.off);
  db.setSetting("attendance_all_registers_off",off,String(req.user.id));
  res.json({ok:true,off});
});
router.get("/attendance/global-status",auth,(req,res)=>{
  res.json({off:String(db.setting("attendance_all_registers_off","false"))==="true"});
});

module.exports=router;
