require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT || 3000);
const configuredMax = Number.parseInt(process.env.MAX_PARTICIPANTS || "200", 10);
const MAX = Number.isFinite(configuredMax) ? Math.min(200, Math.max(1, configuredMax)) : 200;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "";
const COOKIE_NAME = "quiz_admin";
if (process.env.NODE_ENV === "production" && (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET)) {
  throw new Error("Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in the hosting environment.");
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));
function signSession(expires) {
  return crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(String(expires)).digest("hex");
}
function isAdmin(req) {
  const raw = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE_NAME + "="));
  if (!raw) return false;
  const token = decodeURIComponent(raw.slice(COOKIE_NAME.length + 1));
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) || expires < Date.now() || !signature) return false;
  const expected = signSession(expires);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(401).json({ error: "Admin login required." });
}
// Prevent direct access to the admin HTML without a valid login cookie.
app.use((req, res, next) => {
  if (req.path === "/admin.html") return res.redirect("/");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

const freshState = () => ({
  status: "registration",
  quizTitle: "Live Quiz",
  questions: [],
  participants: [],
  currentQuestion: -1,
  questionStartedAt: null,
  questionDuration: 20,
  createdAt: new Date().toISOString()
});
let state = freshState();

try {
  if (fs.existsSync(DATA_FILE)) state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (e) {
  console.error("Could not read data.json; starting with a fresh quiz.", e.message);
}
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}
function publicQuestion() {
  const q = state.questions[state.currentQuestion];
  if (!q || state.status !== "live") return null;
  return {
    id: q.id, text: q.text, options: q.options,
    duration: state.questionDuration,
    startedAt: state.questionStartedAt
  };
}
function leaderboard() {
  return [...state.participants]
    .map(p => ({ id: p.id, name: p.name, score: p.score, correct: p.correct }))
    .sort((a,b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name));
}
function snapshot() {
  const q = state.questions[state.currentQuestion];
  const counts = q ? q.options.map((_, i) =>
    state.participants.filter(p => p.answers[q.id] && p.answers[q.id].choice === i).length
  ) : [];
  return {
    status: state.status, quizTitle: state.quizTitle,
    questionCount: state.questions.length, currentQuestion: state.currentQuestion,
    participants: state.participants.length, maxParticipants: MAX,
    question: publicQuestion(), answerCounts: counts,
    leaderboard: leaderboard(),
    questionStats: q ? {
      totalAnswers: state.participants.filter(p => p.answers[q.id]).length,
      options: q.options
    } : null
  };
}
function emitUpdate() { io.emit("state", snapshot()); }
function safeText(v, max=180) {
  return typeof v === "string" ? v.trim().slice(0,max) : "";
}

app.get("/", (req,res) => {
  if (isAdmin(req)) return res.sendFile(path.join(__dirname, "public", "admin.html"));
  return res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.post("/api/admin/login", (req,res) => {
  const supplied = typeof req.body.password === "string" ? req.body.password : "";
  const expected = ADMIN_PASSWORD;
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a,b))
    return res.status(401).json({ error: "Incorrect admin password." });
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const token = `${expires}.${signSession(expires)}`;
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.post("/api/admin/logout", requireAdmin, (req,res) => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.use("/api/admin", requireAdmin);
app.get("/join", (_,res) => res.sendFile(path.join(__dirname, "public", "join.html")));
app.get("/display", (_,res) => res.sendFile(path.join(__dirname, "public", "display.html")));

app.get("/api/state", (_,res) => res.json(snapshot()));
app.get("/api/qr", requireAdmin, async (req,res) => {
  try {
    const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const url = `${base}/join`;
    const dataUrl = await QRCode.toDataURL(url, { width: 420, margin: 2, errorCorrectionLevel: "M" });
    res.json({ url, dataUrl });
  } catch (e) { res.status(500).json({error:"Could not generate QR code."}); }
});

app.get("/api/admin/questions", (req,res) => {
  res.json(state.questions.map(q=>({id:q.id,text:q.text,options:q.options,correctIndex:q.correctIndex})));
});
app.post("/api/admin/settings", (req,res) => {
  if (req.body.title !== undefined) state.quizTitle = safeText(req.body.title,80) || "Live Quiz";
  if (req.body.duration !== undefined) {
    const d = Number(req.body.duration);
    if (!Number.isInteger(d) || d < 5 || d > 300) return res.status(400).json({error:"Timer must be 5–300 seconds."});
    state.questionDuration = d;
  }
  save(); emitUpdate(); res.json({ok:true});
});
app.post("/api/admin/questions", (req,res) => {
  if (state.status !== "registration") return res.status(400).json({error:"Questions can only be added before the quiz starts."});
  const text = safeText(req.body.text,300);
  const options = Array.isArray(req.body.options) ? req.body.options.map(x=>safeText(x,120)) : [];
  const correctIndex = Number(req.body.correctIndex);
  if (!text || options.length !== 4 || options.some(x=>!x) || !Number.isInteger(correctIndex) || correctIndex<0 || correctIndex>3)
    return res.status(400).json({error:"Enter a question, all four options, and one correct answer."});
  const id = "q_" + Date.now() + "_" + Math.random().toString(36).slice(2,7);
  state.questions.push({id,text,options,correctIndex});
  save(); emitUpdate(); res.json({ok:true});
});
app.put("/api/admin/questions/:id", (req,res) => {
  if (state.status !== "registration") return res.status(400).json({error:"Questions can only be edited before the quiz starts."});
  const q = state.questions.find(x=>x.id === req.params.id);
  if (!q) return res.status(404).json({error:"Question not found."});
  const text = safeText(req.body.text,300);
  const options = Array.isArray(req.body.options) ? req.body.options.map(x=>safeText(x,120)) : [];
  const correctIndex = Number(req.body.correctIndex);
  if (!text || options.length !== 4 || options.some(x=>!x) || !Number.isInteger(correctIndex) || correctIndex<0 || correctIndex>3)
    return res.status(400).json({error:"Enter a question, all four options, and one correct answer."});
  Object.assign(q,{text,options,correctIndex}); save(); emitUpdate(); res.json({ok:true});
});
app.delete("/api/admin/questions/:id", (req,res) => {
  if (state.status !== "registration") return res.status(400).json({error:"Questions can only be deleted before the quiz starts."});
  state.questions = state.questions.filter(q=>q.id !== req.params.id);
  state.currentQuestion = -1; save(); emitUpdate(); res.json({ok:true});
});
app.post("/api/admin/start", (req,res) => {
  if (!state.questions.length) return res.status(400).json({error:"Add at least one question first."});
  state.status = "live"; state.currentQuestion = -1; state.questionStartedAt = null;
  save(); emitUpdate(); res.json({ok:true});
});
app.post("/api/admin/next", (req,res) => {
  if (state.status !== "live") return res.status(400).json({error:"Start the quiz first."});
  if (state.currentQuestion + 1 >= state.questions.length) {
    state.status = "finished"; state.questionStartedAt = null;
  } else {
    state.currentQuestion += 1;
    state.questionStartedAt = Date.now();
  }
  save(); emitUpdate(); res.json({ok:true});
});
app.post("/api/admin/reset", (req,res) => {
  state = freshState(); save(); emitUpdate(); res.json({ok:true});
});

app.post("/api/join", (req,res) => {
  if (state.status !== "registration") return res.status(400).json({error:"Registration is closed. Please wait for the next quiz."});
  if (state.participants.length >= MAX) return res.status(400).json({error:`The quiz is full (${MAX} participants).`});
  const name = safeText(req.body.name,40);
  if (!name) return res.status(400).json({error:"Please enter your name."});
  const id = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2,8);
  const p = {id,name,score:0,correct:0,answers:{}};
  state.participants.push(p); save(); emitUpdate();
  res.json({id,name,quizTitle:state.quizTitle});
});
app.post("/api/answer", (req,res) => {
  const { participantId, choice } = req.body;
  const p = state.participants.find(x=>x.id===participantId);
  if (!p) return res.status(404).json({error:"Participant not found. Please rejoin."});
  if (state.status !== "live" || state.currentQuestion < 0) return res.status(400).json({error:"The next question is not open yet."});
  const q = state.questions[state.currentQuestion];
  if (p.answers[q.id]) return res.status(400).json({error:"You have already submitted an answer for this question."});
  if (Date.now() > state.questionStartedAt + state.questionDuration*1000) return res.status(400).json({error:"Time is up. Wait for the next question."});
  const n = Number(choice);
  if (!Number.isInteger(n) || n<0 || n>3) return res.status(400).json({error:"Select one answer."});
  const correct = n === q.correctIndex;
  const elapsed = Math.max(0, (Date.now()-state.questionStartedAt)/1000);
  const bonus = correct ? Math.max(0, Math.ceil((state.questionDuration-elapsed)/state.questionDuration*50)) : 0;
  const points = correct ? 100 + bonus : 0;
  p.answers[q.id] = {choice:n, correct, points, answeredAt:Date.now()};
  p.score += points; if (correct) p.correct += 1;
  save(); emitUpdate(); res.json({ok:true, correct, points});
});

io.on("connection", socket => {
  socket.emit("state", snapshot());
  socket.on("identify", id => {
    if (state.participants.some(p=>p.id===id)) socket.join(id);
  });
});

setInterval(() => {
  if (state.status === "live" && state.currentQuestion >= 0) {
    const q = state.questions[state.currentQuestion];
    if (q && Date.now() > state.questionStartedAt + state.questionDuration*1000) {
      // Timer closes answers; admin still manually advances to the next question.
      io.emit("timer-ended", {questionId:q.id});
    }
  }
}, 1000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`QR Live Quiz running at http://localhost:${PORT}`);
});
