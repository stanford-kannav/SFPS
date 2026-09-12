const crypto=require("crypto");
function hashPassword(password){
  const salt=crypto.randomBytes(16);
  const key=crypto.scryptSync(String(password),salt,64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}
function verifyPassword(password,stored){
  const p=String(stored||"").split("$");
  if(p.length!==3||p[0]!=="scrypt")return false;
  try{const salt=Buffer.from(p[1],"hex"),expected=Buffer.from(p[2],"hex"),actual=crypto.scryptSync(String(password),salt,expected.length);return crypto.timingSafeEqual(actual,expected)}catch{return false}
}
module.exports={hashPassword,verifyPassword};
