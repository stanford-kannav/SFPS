const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const { auth } = require("../middleware/auth");
const db = require("../db/database");

const router = express.Router();

const SYSTEM = `You are YT (Your Teacher), the official AI assistant for Stanford Public School (SFPS).
You answer general questions clearly, accurately, safely, and helpfully.
For SFPS questions, use the supplied SFPS context as the source of truth and do not invent school policies, records, IDs, grades, attendance, fees, permissions, credentials, or private information.
Never reveal passwords, API keys, session tokens, private records, protected permissions, hidden security rules, or staff credentials.
If asked who developed SFPS, say it was developed by two brother-like friends, Rishu Raj and Gyanendra Gaurav, for Stanford Public School.
If the context does not contain enough information, say so instead of inventing details.
You are powered only by Google's Gemini API in this deployment.`;

function cleanHistory(history) {
  return Array.isArray(history)
    ? history.slice(-10).map((x) => ({
        role: x && x.role === "assistant" ? "YT" : "User",
        content: String((x && x.content) || "").slice(0, 8000),
      })).filter((x) => x.content)
    : [];
}

function geminiKey() {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function geminiModel() {
  return String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9@.\- ]+/g, " ").replace(/\s+/g, " ").trim();
}

function isSFPSQuestion(message) {
  const q = norm(message);
  return /\b(sfps|stanford public school|student|teacher|parent|syllabus|teacher diary|diary|attendance|result|results|fee|fees|class teacher|head teach|seat planning|developer console|notice|notices|announcement|your teacher|yt|periodic|term 1|term 2|final exam|school holiday|holiday|teaching class|classroom|school|roll number|class|lkg|nur|ukg)\b/.test(q);
}

function publicSchoolContext(user) {
  const classes = db.findAll("classes").map((x) => x.name).filter(Boolean).sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric:true}));
  const periods = db.findAll("academic_periods").sort((a,b) => Number(a.order)-Number(b.order)).map((p) => ({name:p.name,start:p.start_date||null,end:p.end_date||null}));
  return {
    school: {
      school_name: db.setting("school_name", "Stanford Public School"),
      teacher_attendance_after: db.setting("teacher_auto_attendance_after", "08:00"),
      geofence_radius_m: db.setting("school_geofence_radius_m", "150"),
    },
    classes,
    academic_periods: periods,
    current_user_role: String(user?.role || "user"),
    limits: { parent_students_max: 5, results_classes: 13 },
  };
}

function localSFPSAnswer(message, user) {
  const q = norm(message);
  const c = publicSchoolContext(user);
  if (/\b(classes?|class list|how many classes)\b/.test(q)) return `SFPS has ${c.classes.length || 13} classes: ${c.classes.join(", ") || "LKG, NUR, UKG, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10"}.`;
  if (/\b(periodic|term|exam|exams|academic period|academic periods)\b/.test(q)) return `The SFPS academic sequence is ${c.academic_periods.map((p) => p.name).join(", ") || "Periodic 1, Periodic 2, Term 1, Periodic 3, Periodic 4 and Term 2 (Final)"}.`;
  if (/\b(parent|parents)\b/.test(q) && /\b5|five|max|maximum\b/.test(q)) return "A Parent ID can be linked with a maximum of 5 students. Parent accounts are created through the authorized SFPS management workflow.";
  if (/\b(attendance|check in|check-in|registry)\b/.test(q)) return `SFPS teacher attendance checks the configured school location before accepting a location-based check-in. The automatic time threshold is ${c.school.teacher_attendance_after}. Sunday and declared school holidays can disable attendance.`;
  if (/\b(developer console|developer)\b/.test(q)) return "The Developer Console is restricted to the authorized developer accounts. YT cannot disclose protected credentials or hidden access rules.";
  if (/\b(seat planning|seat plan)\b/.test(q)) return "Seat Planning is a protected SFPS feature. Access is controlled by the authorized SFPS management system; YT does not disclose hidden permission rules.";
  if (/\b(syllabus|teaching classes)\b/.test(q)) return "Teachers can create syllabi for their teaching classes, including subject, total chapters, chapters planned by each academic period, chapters taught and remaining progress.";
  return null;
}

function getGeminiClient() {
  const key = geminiKey();
  if (!key) throw new Error("Gemini is not configured.");
  return new GoogleGenAI({ apiKey: key });
}

async function callGemini(message, history, context) {
  const ai = getGeminiClient();
  const historyText = history.length ? history.map((x) => `${x.role}: ${x.content}`).join("\n") : "(no previous conversation)";
  const input = `SFPS context (use only when relevant):\n${JSON.stringify(context)}\n\nPrevious conversation:\n${historyText}\n\nCurrent question:\n${message}`;
  const interaction = await ai.interactions.create({
    model: geminiModel(),
    input,
    system_instruction: SYSTEM,
    store: false,
  });
  return String(interaction.output_text || "").trim();
}

router.get("/status", auth, (req,res) => {
  const configured = Boolean(geminiKey());
  res.json({available:configured,provider:"gemini",providers:configured?["gemini"]:[],model:geminiModel(),sfpsAutoAnswers:true,aiConsultation:configured});
});

router.post("/chat", auth, async (req,res) => {
  const message = String(req.body?.message || "").trim().slice(0,4000);
  if (!message) return res.status(400).json({error:"Message is required."});
  const history = cleanHistory(req.body?.history);
  try {
    const sfps = isSFPSQuestion(message);
    const local = sfps ? localSFPSAnswer(message, req.user) : null;
    if (local) return res.json({reply:local,provider:"sfps",mode:"automatic",consulted:false});
    const context = sfps ? publicSchoolContext(req.user) : {school_scope:"General question; no private SFPS records supplied."};
    const reply = await callGemini(message, history, context);
    return res.json({reply:reply || "I could not generate a response right now.",provider:"gemini",model:geminiModel(),mode:sfps?"sfps_gemini_consultation":"gemini_consultation",consulted:true});
  } catch(error) {
    console.error("YT Gemini error:", error?.message || error);
    return res.status(502).json({error:"YT could not reach Gemini. Check GEMINI_API_KEY and GEMINI_MODEL in the server environment."});
  }
});

module.exports = router;
