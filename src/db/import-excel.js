const fs=require("fs");
const XLSX=require("xlsx");
const {hashPassword}=require("../security/password");
const db=require("./database");
const file=process.argv[2]||"data/SFPS T.D OP.xlsx";
if(!fs.existsSync(file)){console.error("Excel file not found:",file);process.exit(1)}
const wb=XLSX.readFile(file), sheet=wb.Sheets[wb.SheetNames[0]], rows=XLSX.utils.sheet_to_json(sheet,{defval:""});
(async()=>{
 let count=0;
 for(const row of rows){
  const name=String(row.Name||"").trim(),uid=String(row.UID||"").trim();
  if(!name||!uid||name.toLowerCase()==="new")continue;
  const category=String(row.Category||""),work=String(row.Work||"");
  const lowerUid=uid.toLowerCase();
  const role=lowerUid==="owner@principle"?"owner":lowerUid==="owner@director"?"sub-owner":work.toLowerCase().includes("manager")||lowerUid==="sankar@sir"?"manager":"teacher";
  const hash=hashPassword(String(row.Password||""));
  const old=db.findOne("users",u=>u.uid===uid);
  const data={name,uid,password_hash:hash,role,work,category,access_description:String(row.Access||""),access_to_class:String(row["Access to Class"]||"")};
  if(old)db.update("users",u=>u.id===old.id,data);else db.insert("users",data);
  count++;
 }
 console.log(`Imported/updated ${count} user records from Excel.`)
})().catch(e=>{console.error(e);process.exit(1)});
