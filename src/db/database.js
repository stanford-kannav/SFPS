const fs = require("fs");
const path = require("path");
const { hashPassword, verifyPassword } = require("../security/password");

const ROOT = path.join(__dirname, "..", "..");

function findBundledData() {
  const candidates = [
    path.join(ROOT, "data"),
    path.join(process.cwd(), "data"),
    path.join(__dirname, "..", "..", "data"),
    path.join(__dirname, "..", "data"),
  ];

  return (
    candidates.find((dir) =>
      fs.existsSync(path.join(dir, "json", "users.json"))
    ) || candidates[0]
  );
}

const BUNDLED_DATA = findBundledData();
const RENDER = String(process.env.RENDER || "").toLowerCase() === "true";
const SERVERLESS = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY_DEV);
const CONFIGURED_DATA = String(process.env.SFPS_DATA_DIR || "").trim();

// Render persistent disks are available only when a disk is actually attached to
// the running service. If an existing Render Web Service is deployed without a
// disk, its configured mount path may exist but be non-writable. Never crash the whole SFPS app
// just because that optional persistent location is unavailable.
function isWritableLocation(target) {
  try {
    const absolute = path.resolve(target);
    fs.mkdirSync(absolute, { recursive: true });
    fs.accessSync(absolute, fs.constants.W_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveDataDirectory() {
  if (CONFIGURED_DATA) {
    if (isWritableLocation(CONFIGURED_DATA)) return path.resolve(CONFIGURED_DATA);
    console.warn(`[SFPS] SFPS_DATA_DIR is not writable: ${CONFIGURED_DATA}. Falling back to /tmp/sfps-data.`);
    return path.join(require("os").tmpdir(), "sfps-data");
  }

  if (RENDER) {
    const renderDiskData = path.join("/var", "data", "data");
    if (isWritableLocation(renderDiskData)) return renderDiskData;
    console.warn("[SFPS] Render persistent disk is not mounted/writable. Falling back to /tmp/sfps-data.");
    return path.join(require("os").tmpdir(), "sfps-data");
  }

  if (SERVERLESS) return path.join("/tmp", "sfps-data");
  return BUNDLED_DATA;
}

const DATA = resolveDataDirectory();
const EXTERNAL_DATA = DATA !== BUNDLED_DATA;
const JSON_DIR = path.join(DATA, "json");
const XML_DIR = path.join(DATA, "xml");
const YAML_DIR = path.join(DATA, "yaml");

const TABLES = [
  "users","classes","students","attendance","syllabus","homework","teacher_ratings",
  "announcements","teacher_diary","exam_results","fees","teacher_attendance",
  "teacher_access_grants","teacher_work_access","teacher_classes",
  "class_teacher_assignments","developer_console_audit","school_settings","school_holidays",
  "seat_plans","seat_planner_lockouts","seat_planner_class_configs","seat_planner_access","academic_periods","attendance_history","student_registry_history","permissions"
];

function copyIfMissing(source, destination) {
  if (!fs.existsSync(destination) && fs.existsSync(source)) {
    fs.copyFileSync(source, destination);
  }
}

function ensure(){
  for(const d of [DATA,JSON_DIR,XML_DIR,YAML_DIR]) fs.mkdirSync(d,{recursive:true});

  for(const t of TABLES){
    const p=path.join(JSON_DIR,t+".json");
    const bundled=path.join(BUNDLED_DATA,"json",t+".json");

    if(!fs.existsSync(p)){
      if(EXTERNAL_DATA && fs.existsSync(bundled)) fs.copyFileSync(bundled,p);
      else fs.writeFileSync(p,"[]\n");
    }

    if(EXTERNAL_DATA){
      copyIfMissing(path.join(BUNDLED_DATA,"xml",t+".xml"),path.join(XML_DIR,t+".xml"));
      copyIfMissing(path.join(BUNDLED_DATA,"yaml",t+".yaml"),path.join(YAML_DIR,t+".yaml"));
    }
  }
}
function file(t){ if(!TABLES.includes(t)) throw new Error("Unknown table: "+t); ensure(); return path.join(JSON_DIR,t+".json"); }
function readTable(t){ ensure(); try{return JSON.parse(fs.readFileSync(file(t),"utf8")||"[]")}catch(e){throw new Error(`Invalid JSON table ${t}: ${e.message}`)}}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function yamlScalar(v){
  if(v===null||v===undefined) return "null";
  if(typeof v==="boolean"||typeof v==="number") return String(v);
  return JSON.stringify(String(v));
}
function syncTable(t,rows){
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<${t}>\n`+
    rows.map(r=>"  <record>\n"+Object.entries(r).map(([k,v])=>{
      const x=typeof v==="object"&&v!==null?JSON.stringify(v):v;
      return `    <${k}>${esc(x)}</${k}>\n`;
    }).join("")+"  </record>\n").join("")+`</${t}>\n`;
  fs.writeFileSync(path.join(XML_DIR,t+".xml"),xml);
  const yaml=`${t}:\n`+rows.map(r=>"  -\n"+Object.entries(r).map(([k,v])=>`      ${k}: ${yamlScalar(v)}`).join("\n")+"\n").join("");
  fs.writeFileSync(path.join(YAML_DIR,t+".yaml"),yaml);
}
function writeTable(t,rows){
  ensure();
  const p=file(t), tmp=p+".tmp";
  fs.writeFileSync(tmp,JSON.stringify(rows,null,2)+"\n");
  fs.renameSync(tmp,p);
  syncTable(t,rows);
}
function nextId(rows){return Math.max(0,...rows.map(x=>Number(x.id)||0))+1}
function now(){return new Date().toISOString()}
function insert(t,row){
  const rows=readTable(t);
  const r={id:row.id??nextId(rows),...row};
  if(r.created_at===undefined) r.created_at=now();
  rows.push(r); writeTable(t,rows); return r;
}
function update(t,predicate,changes){
  const rows=readTable(t); let count=0;
  for(const r of rows) if(predicate(r)){Object.assign(r,typeof changes==="function"?changes(r):changes);count++}
  if(count) writeTable(t,rows); return count;
}
function remove(t,predicate){const rows=readTable(t),kept=rows.filter(r=>!predicate(r));const count=rows.length-kept.length;if(count)writeTable(t,kept);return count}
function findOne(t,predicate){return readTable(t).find(predicate)||null}
function findAll(t,predicate=()=>true){return readTable(t).filter(predicate)}
function uniqueInsert(t,row,keys){
  const existing=findOne(t,r=>keys.every(k=>String(r[k]??"")===String(row[k]??"")));
  if(existing)return existing;
  return insert(t,row);
}
function setting(key, fallback=null){
  const r=findOne("school_settings",x=>x.setting_key===key||x.key===key);
  return r ? (r.setting_value??r.value) : fallback;
}
function setSetting(key,value,userId=null){
  const existing=findOne("school_settings",x=>x.setting_key===key||x.key===key);
  if(existing){
    update("school_settings",x=>x.id===existing.id,{setting_key:key,setting_value:String(value),updated_by:userId,updated_at:now()});
    return {...existing,setting_key:key,setting_value:String(value),updated_by:userId};
  }
  return insert("school_settings",{setting_key:key,setting_value:String(value),updated_by:userId,updated_at:now()});
}

const DEFAULT_CLASSES=["LKG","NUR","UKG",...Array.from({length:10},(_,i)=>String(i+1))];
function ensureClasses(names=DEFAULT_CLASSES){
  const rows=readTable("classes");
  const byName=new Map();
  for(const name of names){
    const matches=rows.filter(r=>String(r.name).toUpperCase()===String(name).toUpperCase());
    let canonical=matches[0];
    if(!canonical) canonical=insert("classes",{name});
    else if(canonical.name!==name) update("classes",x=>x.id===canonical.id,{name});
    byName.set(name,Number(canonical.id));
    for(const dup of matches.slice(1)){
      const oldId=Number(dup.id), newId=Number(canonical.id);
      for(const table of ["students","teacher_classes","seat_planner_class_configs","syllabus","homework","exam_results","fees"]){
        update(table,x=>Number(x.class_id)===oldId,{class_id:newId});
      }
      remove("classes",x=>Number(x.id)===oldId);
    }
  }
  // Remove classes outside the official SFPS list and remap dependent records where possible.
  for(const c of readTable("classes")){
    if(!names.includes(c.name)){
      const fallback=byName.get("1");
      for(const table of ["students","teacher_classes","seat_planner_class_configs","syllabus","homework","exam_results","fees"]){
        update(table,x=>Number(x.class_id)===Number(c.id),{class_id:fallback});
      }
      remove("classes",x=>Number(x.id)===Number(c.id));
    }
  }
  for(const table of ["classes"]){
    const normalized=readTable(table).map(r=>{const x={...r}; delete x.section; return x;});
    writeTable(table,normalized);
  }
  return readTable("classes").sort((a,b)=>a.id-b.id);
}

function teacherClassIds(teacherId){return findAll("teacher_classes",x=>Number(x.teacher_id)===Number(teacherId)).map(x=>Number(x.class_id))}
function canTeach(user,classId){
  if(!user)return false;
  if(["owner","sub-owner","manager"].includes(String(user.role).toLowerCase()))return true;
  if(user.role!=="teacher")return false;
  return teacherClassIds(user.id).includes(Number(classId));
}
function joinClass(student){
  const c=findOne("classes",x=>Number(x.id)===Number(student.class_id));
  return {...student,class_name:c?.name||null};
}
function userPublic(u){
  if(!u)return null;
  const {password_hash,...safe}=u;
  return safe;
}
function dbUniquePeriod(period){
  const existing=findOne("academic_periods",x=>x.code===period.code);
  if(existing){ update("academic_periods",x=>x.id===existing.id,{name:period.name,order:period.order}); return existing; }
  return insert("academic_periods",{code:period.code,name:period.name,order:period.order,start_date:null,end_date:null});
}
function applyConfiguredOwnerPasswords(){
  const configured = [
    ["owner@principle", process.env.SFPS_OWNER_PASSWORD],
    ["owner@director", process.env.SFPS_DIRECTOR_PASSWORD],
  ];
  for (const [uid, password] of configured) {
    const value = String(password || "");
    if (!value) continue;
    if (value.length < 8) throw new Error(`${uid} bootstrap password must be at least 8 characters.`);
    const user = findOne("users", u => String(u.uid || "").toLowerCase() === uid);
    if (!user) continue;
    if (!verifyPassword(value, user.password_hash)) {
      update("users", u => Number(u.id) === Number(user.id), {
        password_hash: hashPassword(value),
        updated_at: now(),
      });
    }
  }
}

function init(){
  ensure();
  if(!findAll("school_settings").length){
    insert("school_settings",{setting_key:"teacher_attendance_registry_enabled",setting_value:"false",updated_by:null});
    insert("school_settings",{setting_key:"attendance_all_registers_off",setting_value:"false",updated_by:null});
    insert("school_settings",{setting_key:"seat_planning_enabled",setting_value:"true",updated_by:null});
    insert("school_settings",{setting_key:"school_name",setting_value:"Stanford Public School",updated_by:null});
    insert("school_settings",{setting_key:"school_latitude",setting_value:"25.20252",updated_by:null});
    insert("school_settings",{setting_key:"school_longitude",setting_value:"85.52436",updated_by:null});
    insert("school_settings",{setting_key:"school_geofence_radius_m",setting_value:"150",updated_by:null});
    insert("school_settings",{setting_key:"teacher_auto_attendance_after",setting_value:"08:00",updated_by:null});
  }
  const locationDefaults = [
    ["school_latitude","25.20252"],["school_longitude","85.52436"],["school_geofence_radius_m","150"],["teacher_auto_attendance_after","08:00"]
  ];
  for(const [key,value] of locationDefaults){
    if(module.exports.setting(key,null)===null) insert("school_settings",{setting_key:key,setting_value:value,updated_by:null});
  }
  const defaultPeriods = [
    {code:"periodic_1",name:"Periodic 1",order:1},
    {code:"periodic_2",name:"Periodic 2",order:2},
    {code:"term_1",name:"Term 1",order:3},
    {code:"periodic_3",name:"Periodic 3",order:4},
    {code:"periodic_4",name:"Periodic 4",order:5},
    {code:"term_2_final",name:"Term 2 (Final)",order:6}
  ];
  for(const period of defaultPeriods){
    dbUniquePeriod(period);
  }
  ensureClasses(DEFAULT_CLASSES);
  applyConfiguredOwnerPasswords();
  for(const t of TABLES) syncTable(t,readTable(t));
  return {ok:true,engine:"Node.js file database",formats:["JSON","XML","YAML"],path:DATA,persistent:EXTERNAL_DATA};
}
async function query(){throw new Error("Raw SQL is not used by SFPS v14 JSON/XML/YAML database. Use database helpers.");}

function localDateIndia(){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function isSundayOrHoliday(date=localDateIndia()){
  const d=new Date(`${date}T12:00:00+05:30`);
  const sunday=d.getDay()===0;
  const holiday=findOne("school_holidays",h=>String(h.date)===String(date)&&h.active!==false);
  const allOff=String(setting("attendance_all_registers_off","false"))==="true";
  return {date,sunday,holiday:holiday||null,allOff,closed:sunday||!!holiday||allOff};
}
function attendanceOnceToday(teacherId,record){
  const date=record.attendance_date||localDateIndia();
  const status=isSundayOrHoliday(date);
  if(status.closed)return {ok:false,reason:status.sunday?"Sunday":status.holiday?.name||"Attendance has been turned off by the Owner/Sub-owner.",record:null};
  const existing=findOne("teacher_attendance",r=>String(r.teacher_id)===String(teacherId)&&String(r.attendance_date)===String(date));
  if(existing)return {ok:false,reason:"Teacher registry already recorded for today.",record:existing};
  return {ok:true,record:insert("teacher_attendance",{...record,teacher_id:teacherId,attendance_date:date})};
}

module.exports={TABLES,attendanceOnceToday,isSundayOrHoliday,DATA,JSON_DIR,XML_DIR,YAML_DIR,DEFAULT_CLASSES,ensure,init,ensureClasses,readTable,writeTable,syncTable,nextId,now,insert,update,remove,findOne,findAll,uniqueInsert,setting,setSetting,teacherClassIds,canTeach,joinClass,userPublic,query};
