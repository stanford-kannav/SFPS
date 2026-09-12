const path=require("path");
const {hashPassword}=require("../security/password");
const db=require("./database");
const CLASS_NAMES=["LKG","NUR","UKG",...Array.from({length:10},(_,i)=>String(i+1))];
const SEED_PATH=path.join(__dirname,"..","..","data","seed-users.json");
function roleFor(uid,work,category){
  const u=String(uid||"").toLowerCase();
  if(u==="owner@principle")return "owner";
  if(u==="owner@director")return "sub-owner";
  if(/manager/i.test(String(work))||/manager/i.test(String(category)))return "manager";
  return "teacher";
}
function readUsers(){ return JSON.parse(require("fs").readFileSync(SEED_PATH,"utf8")); }

function main(){
  db.init(); db.ensureClasses(CLASS_NAMES);
  const users=readUsers();
  if(!users.some(u=>String(u.uid).toLowerCase()==="ashish@sir")) users.push({
    name:"Ashish",
    uid:"ashish@sir",
    password_hash:db.findOne("users",x=>String(x.uid).toLowerCase()==="ashish@sir")?.password_hash || null,
    work:"Teaching",
    category:"N.T/J.T",
    access_description:"Checking or Upgrading syllabus, Attendence Registry, Roll no. Writing who do not make homework.",
    access_to_class:"Only in which they teach"
  });
  for(const u of users){
    const role=roleFor(u.uid,u.work,u.category);
    const existing=db.findOne("users",x=>String(x.uid||"").toLowerCase()===u.uid);
    const passwordHash = u.password_hash || (u.password ? hashPassword(u.password) : null);
    if(!passwordHash) throw new Error(`Missing password hash for ${u.uid}`);
    const row={name:u.name,uid:u.uid,password_hash:passwordHash,role,work:u.work,category:u.category,access_description:u.access_description,access_to_class:u.access_to_class,section:u.section||null,face_captured:false};
    if(existing)db.update("users",x=>x.id===existing.id,row);else db.insert("users",row);
  }
  const owner=db.findOne("users",u=>u.uid==="owner@principle");
  const director=db.findOne("users",u=>u.uid==="owner@director");
  db.setSetting("seat_planning_enabled",true,owner?.id||director?.id||null);
  const ajeet=db.findOne("users",u=>u.uid==="ajeet@sir");
  if(ajeet) db.uniqueInsert("seat_planner_access",{teacher_id:ajeet.id,enabled:true,granted_by:owner?.id||null},["teacher_id"]);
  db.setSetting("teacher_attendance_registry_enabled",String(db.setting("teacher_attendance_registry_enabled","false")),owner?.id||null);
  if(owner&&!db.findOne("announcements",a=>a.title==="Welcome to SFPS")) db.insert("announcements",{title:"Welcome to SFPS",message:"Stanford Public School management system is ready.",created_by:owner.id});
  console.log(JSON.stringify({ok:true,message:"SFPS database seeded from XLSX",users:db.findAll("users").length,classes:db.findAll("classes").length,class_names:db.findAll("classes").map(c=>c.name)},null,2));
}
try{main()}catch(e){console.error("Seed failed:",e);process.exit(1)}
