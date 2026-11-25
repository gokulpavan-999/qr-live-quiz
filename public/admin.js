const $=id=>document.getElementById(id);let currentState=null,editingId=null;
async function api(url,method="GET",body){const r=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||"Request failed");return d}
function msg(t,bad=false){$("msg").textContent=t;$("msg").className="notice "+(bad?"error":"success");}
async function loadQR(){const d=await (await fetch("/api/qr")).json();$("qr").src=d.dataUrl;$("joinUrl").textContent=d.url}
function render(s){currentState=s;$("participants").textContent=`${s.participants}/${s.maxParticipants}`;$("questionCount").textContent=s.questionCount;$("status").textContent=s.status==="registration"?"Registration open":s.status==="live"?(s.currentQuestion<0?"Quiz started – waiting for first question":`Live – question ${s.currentQuestion+1}`):"Quiz finished";
$("title").value=s.quizTitle;$("questions").innerHTML=s.questionCount?s.questions.map((q,i)=>`<div class="option"><strong>Q${i+1}. ${esc(q.text)}</strong><div class="muted">${q.options.map((o,j)=>`${String.fromCharCode(65+j)}. ${esc(o)}${j===q.correctIndex?" ✓":""}`).join(" · ")}</div><div class="row" style="margin-top:8px"><button class="secondary" data-edit="${q.id}" ${s.status!=="registration"?"disabled":""}>Edit</button><button class="danger" data-delete="${q.id}" ${s.status!=="registration"?"disabled":""}>Delete</button></div></div>`).join(""): "No questions yet.";
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>beginEdit(b.dataset.edit));
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm("Delete this question?"))return;try{await api("/api/admin/questions/"+b.dataset.delete,"DELETE");msg("Question deleted.")}catch(e){msg(e.message,true)}});
$("start").disabled=s.status!=="registration"||!s.questionCount;$("next").disabled=s.status!=="live";
$("leaderboard").innerHTML=s.leaderboard.length?`<table><tr><th>#</th><th>Name</th><th>Score</th><th>Correct</th></tr>${s.leaderboard.map((p,i)=>`<tr><td class="rank">${i+1}</td><td>${esc(p.name)}</td><td>${p.score}</td><td>${p.correct}</td></tr>`).join("")}</table>`:"No participants yet.";
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function init(){try{$("app").classList.remove("hidden");await loadQR();const s=await api("/api/state");s.questions=await api("/api/admin/questions");render(s);}catch(e){msg(e.message,true)}}
init();
$("saveSettings").onclick=async()=>{try{await api("/api/admin/settings","POST",{title:$("title").value,duration:Number($("duration").value)});msg("Settings saved.");}catch(e){msg(e.message,true)}};
function clearQuestionForm(){editingId=null;["qText","o0","o1","o2","o3"].forEach(id=>$(id).value="");$("correct").value="0";$("addQuestion").textContent="Add question";$("cancelEdit").classList.add("hidden");$("editHint").textContent="";}
function beginEdit(id){const q=currentState.questions.find(x=>x.id===id);if(!q)return;editingId=id;$("qText").value=q.text;q.options.forEach((o,i)=>$("o"+i).value=o);$("correct").value=String(q.correctIndex);$("addQuestion").textContent="Save changes";$("cancelEdit").classList.remove("hidden");$("editHint").textContent="Editing selected question.";window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});}
$("cancelEdit").onclick=clearQuestionForm;
$("addQuestion").onclick=async()=>{const wasEditing=!!editingId;const editId=editingId;const body={text:$("qText").value,options:[0,1,2,3].map(i=>$("o"+i).value),correctIndex:Number($("correct").value)};try{if(wasEditing)await api("/api/admin/questions/"+editId,"PUT",body);else await api("/api/admin/questions","POST",body);clearQuestionForm();msg(wasEditing?"Question updated.":"Question added.");}catch(e){msg(e.message,true)}};
$("start").onclick=async()=>{if(!confirm("Start quiz and close registration?"))return;try{await api("/api/admin/start","POST",{});msg("Quiz started. Publish question 1 when ready.");}catch(e){msg(e.message,true)}};
$("next").onclick=async()=>{if(!confirm("Publish the next question (or finish if all questions are done)?"))return;try{await api("/api/admin/next","POST",{});msg("Quiz updated.");}catch(e){msg(e.message,true)}};
$("reset").onclick=async()=>{if(!confirm("Reset the entire quiz and clear all participants and questions?"))return;try{await api("/api/admin/reset","POST",{});msg("Quiz reset.");}catch(e){msg(e.message,true)}};
$("copyUrl").onclick=()=>navigator.clipboard.writeText($("joinUrl").textContent).then(()=>msg("Join link copied."));
const socket=io();socket.on("state",async s=>{if(!$("app").classList.contains("hidden")){try{s.questions=await api("/api/admin/questions");render(s);}catch(e){msg(e.message,true)}}});

const logoutButton=document.getElementById("logout");if(logoutButton)logoutButton.onclick=async()=>{try{await api("/api/admin/logout","POST",{});location.href="/";}catch(e){msg(e.message,true)}};
