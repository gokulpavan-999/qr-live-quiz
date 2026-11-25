const $ = id => document.getElementById(id);
const socket = io();

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function render(state) {
  $("title").textContent = state.quizTitle || "QR Live Quiz";
  const rows = state.leaderboard || [];
  $("leaderboard").innerHTML = rows.length
    ? `<table>
        <thead><tr><th>Rank</th><th>User Name</th><th>City</th><th>Points</th></tr></thead>
        <tbody>${rows.slice(0, 20).map((person, index) => `
          <tr>
            <td class="rank">${["🥇","🥈","🥉"][index] || index + 1}</td>
            <td>${esc(person.name)}</td>
            <td>${esc(person.city || "—")}</td>
            <td><strong>${Number(person.score) || 0}</strong></td>
          </tr>`).join("")}
        </tbody>
      </table>`
    : "Participants will appear here after joining.";

  if (state.status === "finished") {
    $("winner").classList.remove("hidden");
    $("winnerList").innerHTML = rows.length
      ? rows.slice(0, 3).map((person, index) => `
          <div class="winner-item">
            <h2>${["🥇 1st Place","🥈 2nd Place","🥉 3rd Place"][index]}</h2>
            <p><strong>${esc(person.name)}</strong> — ${esc(person.city || "—")}</p>
            <p>${Number(person.score) || 0} points</p>
          </div>`).join("")
      : "<p>No participants joined this quiz.</p>";
  } else {
    $("winner").classList.add("hidden");
    $("winnerList").innerHTML = "";
  }
}

socket.on("state", render);
fetch("/api/state").then(response => response.json()).then(render).catch(() => {
  $("leaderboard").textContent = "Unable to connect to the quiz server.";
});
