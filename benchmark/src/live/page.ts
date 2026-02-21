/** Self-contained HTML dashboard for the live benchmark UI. */
export const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DevMemBench — Live</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #0d1117;
    --bg2:       #161b22;
    --bg3:       #21262d;
    --border:    #30363d;
    --text:      #c9d1d9;
    --muted:     #6e7681;
    --green:     #3fb950;
    --red:       #f85149;
    --yellow:    #d29922;
    --blue:      #58a6ff;
    --purple:    #bc8cff;
    --cyan:      #39c5cf;
    --font:      'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  }

  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 13px; line-height: 1.5; }

  /* ── Layout ── */
  .app       { display: grid; grid-template-rows: auto auto 1fr; height: 100vh; gap: 0; }
  .header    { padding: 16px 20px 12px; border-bottom: 1px solid var(--border); background: var(--bg2); }
  .phases    { display: flex; gap: 0; border-bottom: 1px solid var(--border); background: var(--bg2); }
  .body      { display: grid; grid-template-columns: 1fr 280px; overflow: hidden; }
  .feed      { overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }
  .sidebar   { border-left: 1px solid var(--border); padding: 14px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }

  /* ── Header ── */
  .header-top  { display: flex; align-items: baseline; gap: 12px; }
  .header-title{ font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }
  .badge       { font-size: 11px; padding: 1px 7px; border-radius: 10px; background: var(--bg3); color: var(--muted); border: 1px solid var(--border); }
  .badge.green { background: #0f2b17; color: var(--green); border-color: #1a4025; }
  .badge.blue  { background: #0c1f35; color: var(--blue);  border-color: #153358; }
  .header-meta { margin-top: 5px; color: var(--muted); font-size: 11px; display: flex; gap: 16px; }

  /* ── Phase stepper ── */
  .phase-step { flex: 1; padding: 8px 12px; font-size: 11px; color: var(--muted); border-right: 1px solid var(--border); display: flex; align-items: center; gap: 6px; transition: background 0.2s; cursor: default; }
  .phase-step:last-child { border-right: none; }
  .phase-step.active   { background: var(--bg3); color: var(--blue); }
  .phase-step.complete { color: var(--green); }
  .phase-step .dot     { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); flex-shrink: 0; transition: background 0.2s; }
  .phase-step.active   .dot { background: var(--blue); box-shadow: 0 0 6px var(--blue); animation: pulse 1.5s infinite; }
  .phase-step.complete .dot { background: var(--green); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  /* ── Feed rows ── */
  .row         { display: flex; align-items: flex-start; gap: 10px; padding: 5px 8px; border-radius: 5px; animation: fadein 0.2s ease; }
  .row:hover   { background: var(--bg3); }
  @keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
  .row-icon    { font-size: 11px; margin-top: 1px; flex-shrink: 0; width: 14px; text-align: center; }
  .row-body    { flex: 1; min-width: 0; }
  .row-label   { color: var(--text); }
  .row-sub     { color: var(--muted); font-size: 11px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .row-meta    { margin-left: auto; font-size: 11px; color: var(--muted); white-space: nowrap; padding-left: 10px; }
  .correct     { color: var(--green); }
  .incorrect   { color: var(--red); }
  .phase-row   { color: var(--blue); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; padding: 10px 8px 4px; }

  /* ── Sidebar ── */
  .sidebar-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); margin-bottom: 8px; }

  .score-big   { font-size: 36px; font-weight: 700; color: #fff; line-height: 1; }
  .score-sub   { font-size: 11px; color: var(--muted); margin-top: 3px; }

  .cat-row     { margin-bottom: 9px; }
  .cat-header  { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; }
  .cat-name    { color: var(--muted); }
  .cat-score   { color: var(--text); }
  .cat-bar-bg  { height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden; }
  .cat-bar     { height: 4px; border-radius: 2px; transition: width 0.4s ease, background 0.3s; background: var(--blue); }
  .cat-bar.full   { background: var(--green); }
  .cat-bar.empty  { background: var(--bg3); }
  .cat-bar.partial{ background: var(--yellow); }

  .conn-status { font-size: 11px; padding: 6px 10px; border-radius: 5px; background: var(--bg3); border: 1px solid var(--border); display: flex; align-items: center; gap: 6px; }
  .conn-dot    { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
  .conn-dot.off{ background: var(--red); animation: none; }
  .conn-dot.connecting { background: var(--yellow); animation: pulse 1s infinite; }

  .waiting-msg { color: var(--muted); font-size: 12px; padding: 40px 8px; text-align: center; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
</style>
</head>
<body>
<div class="app">

  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <span class="header-title">DevMemBench</span>
      <span class="badge" id="badge-live">connecting…</span>
      <span class="badge blue" id="badge-run" style="display:none"></span>
    </div>
    <div class="header-meta" id="header-meta">Waiting for benchmark run…</div>
  </div>

  <!-- Phase stepper -->
  <div class="phases" id="phases">
    <div class="phase-step" data-phase="ingest">   <div class="dot"></div> Ingest   </div>
    <div class="phase-step" data-phase="search">   <div class="dot"></div> Search   </div>
    <div class="phase-step" data-phase="answer">   <div class="dot"></div> Answer   </div>
    <div class="phase-step" data-phase="evaluate"> <div class="dot"></div> Evaluate </div>
    <div class="phase-step" data-phase="cleanup">  <div class="dot"></div> Cleanup  </div>
    <div class="phase-step" data-phase="done">     <div class="dot"></div> Done     </div>
  </div>

  <!-- Body -->
  <div class="body">
    <div class="feed" id="feed">
      <div class="waiting-msg" id="waiting">Open a new terminal and run:<br><br><code>bun run bench run --live</code></div>
    </div>

    <div class="sidebar">
      <div>
        <div class="sidebar-title">Score</div>
        <div class="score-big" id="score-big">—</div>
        <div class="score-sub" id="score-sub">awaiting results</div>
      </div>
      <div id="cats"></div>
      <div>
        <div class="sidebar-title">Connection</div>
        <div class="conn-status"><div class="conn-dot connecting" id="conn-dot"></div><span id="conn-text">Connecting…</span></div>
      </div>
    </div>
  </div>
</div>

<script>
const PHASES = ["ingest","search","answer","evaluate","cleanup","done"];
const TYPE_LABELS = {
  "tech-stack":"tech","architecture":"arch","session-continuity":"continuity",
  "preference":"pref","error-solution":"error","knowledge-update":"update",
  "cross-session-synthesis":"synthesis","abstention":"abstain"
};
const feed    = document.getElementById("feed");
const waiting = document.getElementById("waiting");
const scoreBig= document.getElementById("score-big");
const scoreSub= document.getElementById("score-sub");
const cats    = document.getElementById("cats");
const connDot = document.getElementById("conn-dot");
const connTxt = document.getElementById("conn-text");
const badgeLive = document.getElementById("badge-live");
const badgeRun  = document.getElementById("badge-run");
const headerMeta= document.getElementById("header-meta");

// Live score state
const catState = {};  // { type: { correct, total } }
let totalCorrect = 0, totalDone = 0;

function setPhase(phase) {
  document.querySelectorAll(".phase-step").forEach(el => {
    const p = el.dataset.phase;
    const idx = PHASES.indexOf(p);
    const cur = PHASES.indexOf(phase);
    el.classList.remove("active","complete");
    if (p === phase) el.classList.add("active");
    else if (idx < cur) el.classList.add("complete");
  });
}

function appendPhaseRow(label) {
  const el = document.createElement("div");
  el.className = "phase-row";
  el.textContent = "── " + label + " ──────────────────────────";
  feed.appendChild(el);
  scrollFeed();
}

function appendRow(icon, label, sub, meta, extraClass) {
  if (waiting) waiting.style.display = "none";
  const row = document.createElement("div");
  row.className = "row" + (extraClass ? " " + extraClass : "");
  row.innerHTML =
    \`<span class="row-icon">\${icon}</span>
     <span class="row-body">
       <span class="row-label">\${label}</span>
       \${sub ? \`<div class="row-sub">\${sub}</div>\` : ""}
     </span>
     \${meta ? \`<span class="row-meta">\${meta}</span>\` : ""}\`;
  feed.appendChild(row);
  scrollFeed();
}

function scrollFeed() {
  requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
}

function updateScore() {
  if (totalDone === 0) return;
  const pct = Math.round((totalCorrect / totalDone) * 100);
  scoreBig.textContent = pct + "%";
  scoreSub.textContent = totalCorrect + " / " + totalDone + " correct";

  // Update category bars
  cats.innerHTML = '<div class="sidebar-title">By Category</div>';
  Object.entries(catState).sort((a,b) => a[0].localeCompare(b[0])).forEach(([type, s]) => {
    const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
    const barClass = pct === 100 ? "full" : pct === 0 ? "empty" : "partial";
    const label = TYPE_LABELS[type] || type;
    cats.innerHTML += \`
      <div class="cat-row">
        <div class="cat-header">
          <span class="cat-name">\${label}</span>
          <span class="cat-score">\${s.correct}/\${s.total}</span>
        </div>
        <div class="cat-bar-bg"><div class="cat-bar \${barClass}" style="width:\${pct}%"></div></div>
      </div>\`;
  });
}

// ── SSE ──────────────────────────────────────────────────────────────────
function connect() {
  const es = new EventSource("/events");

  es.onopen = () => {
    connDot.className = "conn-dot";
    connTxt.textContent = "Connected";
    badgeLive.textContent = "live";
    badgeLive.className = "badge green";
  };

  es.onerror = () => {
    connDot.className = "conn-dot off";
    connTxt.textContent = "Disconnected — retrying…";
    badgeLive.textContent = "disconnected";
    badgeLive.className = "badge";
  };

  es.onmessage = (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch { return; }
    handle(ev);
  };
}

function handle(ev) {
  switch (ev.type) {

    case "run_start":
      badgeRun.textContent = ev.runId;
      badgeRun.style.display = "";
      headerMeta.textContent =
        "provider: " + ev.provider +
        "  ·  judge: " + ev.judgeModel +
        "  ·  " + ev.sessions + " sessions  ·  " + ev.questions + " questions";
      break;

    case "phase_start":
      setPhase(ev.phase);
      appendPhaseRow(ev.phase.toUpperCase());
      if (ev.phase === "done") {
        // Run is complete — stop reconnecting
        setTimeout(() => {
          es.close();
          connDot.className = "conn-dot";
          connTxt.textContent = "Run finished";
          badgeLive.textContent = "done";
          badgeLive.className = "badge green";
        }, 400);
      }
      break;

    case "ingest_session":
      appendRow(
        "⬆",
        ev.sessionId,
        "+" + ev.added + " added  " + (ev.updated ? "~" + ev.updated + " updated" : ""),
        ev.done + "/" + ev.total
      );
      break;

    case "search_question":
      appendRow(
        "⌕",
        ev.questionId + " <span style='color:var(--muted)'>[" + (TYPE_LABELS[ev.questionType]||ev.questionType) + "]</span>",
        ev.resultCount + " results · top " + Math.round(ev.topScore * 100) + "%",
        ev.done + "/" + ev.total
      );
      break;

    case "answer_question":
      appendRow(
        "✦",
        ev.questionId,
        ev.preview,
        ev.done + "/" + ev.total
      );
      break;

    case "evaluate_question": {
      if (!catState[ev.questionType]) catState[ev.questionType] = { correct: 0, total: 0 };
      catState[ev.questionType].total++;
      if (ev.correct) {
        catState[ev.questionType].correct++;
        totalCorrect++;
      }
      totalDone++;
      updateScore();
      const icon = ev.correct ? "✓" : "✗";
      const cls  = ev.correct ? "correct" : "incorrect";
      appendRow(
        \`<span class="\${cls}">\${icon}</span>\`,
        \`<span class="\${cls}">\${ev.questionId}</span> <span style='color:var(--muted)'>[</span><span style='color:var(--muted)'>\${TYPE_LABELS[ev.questionType]||ev.questionType}</span><span style='color:var(--muted)'>]</span>\`,
        ev.explanation.slice(0, 90) + (ev.explanation.length > 90 ? "…" : ""),
        ev.runningCorrect + "/" + ev.done
      );
      break;
    }

    case "cleanup_progress":
      appendRow("🗑", "Cleanup", "deleted " + ev.deleted + " / " + ev.total, "");
      break;

    case "run_complete":
      setPhase("done");
      appendRow(
        "★",
        "Run complete — " + Math.round(ev.accuracy * 100) + "% overall",
        ev.correct + " / " + ev.total + " correct",
        ""
      );
      scoreBig.textContent = Math.round(ev.accuracy * 100) + "%";
      scoreSub.textContent  = ev.correct + " / " + ev.total + " · run complete";
      break;
  }
}

connect();
</script>
</body>
</html>`;
