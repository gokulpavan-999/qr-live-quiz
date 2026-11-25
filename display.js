const $=id=>document.getElementById(id);const socket=io();
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(s){$("title").textContent=s.quizTitle;$("count").textContent=`${s.participants}/${s.maxParticipants}`;
if(s.status==="registration")$("question").textContent="Scan the QR code and join the quiz!";
else if(s.status==="finished")$("question").textContent="Quiz completed! Congratulations to our winners!";
else if(!s.question)$("question").textContent="Get ready… Admin will publish the first question.";
else $("question").textContent=`Q${s.currentQuestion+1}. ${s.question.text}`;
if(s.question&&s.questionStats){const total=s.questionStats.totalAnswers;const counts=s.answerCounts||[];$("bars").innerHTML=s.questionStats.options.map((o,i)=>{const n=counts[i]||0;const pct=total?Math.round(n/total*100):0;return `<div style="margin:14px 0"><div class="row" style="justify-content:space-between"><span>${String.fromCharCode(65+i)}. ${esc(o)}</span><strong>${n}</strong></div><div class="bar"><span style="width:${pct}%"></span></div></div>`}).join("");$("answers").textContent=`${total} answer(s) submitted`;}else{$("bars").innerHTML="";$("answers").textContent="";}
$("leaderboard").innerHTML=s.leaderboard.length?`<table><tr><th>Rank</th><th>Participant</th><th>Points</th></tr>${s.leaderboard.slice(0,10).map((p,i)=>`<tr><td class="rank">${["🥇","🥈","🥉"][i]||i+1}</td><td>${esc(p.name)}</td><td><strong>${p.score}</strong></td></tr>`).join("")}</table>`:"Participants will appear here after joining.";
if(s.status==="finished"){$("winner").classList.remove("hidden");$("winnerList").innerHTML=s.leaderboard.slice(0,3).map((p,i)=>`<h2>${["🥇 1st","🥈 2nd","🥉 3rd"][i]} – ${esc(p.name)} (${p.score} points)</h2>`).join("")||"<p>No participants.</p>";}else $("winner").classList.add("hidden");
}
socket.on("state",render);fetch("/api/state").then(r=>r.json()).then(render);
