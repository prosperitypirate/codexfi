/** Self-contained HTML dashboard for the live E2E test suite. */
export const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>codexfi E2E — Live</title>
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

  /* Layout */
  .app       { display: grid; grid-template-rows: auto auto 1fr; height: 100vh; gap: 0; }
  .header    { padding: 16px 20px 12px; border-bottom: 1px solid var(--border); background: var(--bg2); }
  .scenarios-bar { display: flex; gap: 0; border-bottom: 1px solid var(--border); background: var(--bg2); overflow-x: auto; }
  .body      { display: grid; grid-template-columns: 1fr 300px; overflow: hidden; }
  .feed      { overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }
  .sidebar   { border-left: 1px solid var(--border); padding: 14px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }

  /* Header */
  .header-top  { display: flex; align-items: baseline; gap: 12px; }
  .header-title{ font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }
  .badge       { font-size: 11px; padding: 1px 7px; border-radius: 10px; background: var(--bg3); color: var(--muted); border: 1px solid var(--border); }
  .badge.green { background: #0f2b17; color: var(--green); border-color: #1a4025; }
  .badge.blue  { background: #0c1f35; color: var(--blue);  border-color: #153358; }
  .badge.red   { background: #2b0f0f; color: var(--red);   border-color: #40251a; }
  .header-meta { margin-top: 5px; color: var(--muted); font-size: 11px; display: flex; gap: 16px; }

  /* Scenario stepper bar */
  .sc-step { padding: 6px 10px; font-size: 11px; color: var(--muted); border-right: 1px solid var(--border); display: flex; align-items: center; gap: 5px; white-space: nowrap; cursor: default; transition: background 0.15s; }
  .sc-step:last-child { border-right: none; }
  .sc-step.active   { background: var(--bg3); color: var(--blue); }
  .sc-step.pass     { color: var(--green); }
  .sc-step.fail     { color: var(--red); }
  .sc-step.error    { color: var(--red); }
  .sc-step .dot     { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); flex-shrink: 0; transition: background 0.2s; }
  .sc-step.active .dot { background: var(--blue); box-shadow: 0 0 6px var(--blue); animation: pulse 1.5s infinite; }
  .sc-step.pass  .dot { background: var(--green); }
  .sc-step.fail  .dot { background: var(--red); }
  .sc-step.error .dot { background: var(--red); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  /* Feed rows */
  .row         { display: flex; align-items: flex-start; gap: 10px; padding: 5px 8px; border-radius: 5px; animation: fadein 0.2s ease; }
  .row:hover   { background: var(--bg3); }
  @keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
  .row-icon    { font-size: 12px; margin-top: 1px; flex-shrink: 0; width: 16px; text-align: center; }
  .row-body    { flex: 1; min-width: 0; }
  .row-label   { color: var(--text); }
  .row-sub     { color: var(--muted); font-size: 11px; margin-top: 1px; line-height: 1.5; word-break: break-word; }
  .row-meta    { margin-left: auto; font-size: 11px; color: var(--muted); white-space: nowrap; padding-left: 10px; }
  .correct     { color: var(--green); }
  .incorrect   { color: var(--red); }
  .phase-row   { color: var(--blue); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; padding: 10px 8px 4px; }

  /* Sidebar */
  .sidebar-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); margin-bottom: 8px; }

  .score-big   { font-size: 36px; font-weight: 700; color: #fff; line-height: 1; }
  .score-sub   { font-size: 11px; color: var(--muted); margin-top: 3px; }

  .conn-status { font-size: 11px; padding: 6px 10px; border-radius: 5px; background: var(--bg3); border: 1px solid var(--border); display: flex; align-items: center; gap: 6px; }
  .conn-dot    { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
  .conn-dot.off{ background: var(--red); animation: none; }
  .conn-dot.connecting { background: var(--yellow); animation: pulse 1s infinite; }

  .waiting-msg { color: var(--muted); font-size: 12px; padding: 40px 8px; text-align: center; }

  /* Results table */
  .results-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
  .results-table th { text-align: left; color: var(--muted); font-weight: 500; padding: 4px 8px; border-bottom: 1px solid var(--border); font-size: 11px; }
  .results-table td { padding: 6px 8px; border-bottom: 1px solid var(--bg3); }
  .results-table tr:hover td { background: var(--bg3); }
  .result-pass { color: var(--green); font-weight: 600; }
  .result-fail { color: var(--red); font-weight: 600; }
  .result-error { color: var(--red); font-weight: 600; }
  .result-skip { color: var(--yellow); font-weight: 600; }

  /* Assertion list in sidebar */
  .assert-list { list-style: none; padding: 0; margin: 0; }
  .assert-list li { font-size: 11px; padding: 2px 0; display: flex; gap: 6px; align-items: flex-start; }
  .assert-pass { color: var(--green); }
  .assert-fail { color: var(--red); }

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
      <span class="header-title">codexfi E2E</span>
      <span class="badge" id="badge-live">connecting...</span>
    </div>
    <div class="header-meta" id="header-meta">Waiting for test run...</div>
  </div>

  <!-- Scenario stepper -->
  <div class="scenarios-bar" id="scenarios-bar"></div>

  <!-- Body -->
  <div class="body">
    <div class="feed" id="feed">
      <div class="waiting-msg" id="waiting">Waiting for E2E test run...<br><br><code>bun run test:e2e</code></div>
    </div>

    <div class="sidebar">
      <div>
        <div class="sidebar-title">Pass Rate</div>
        <div class="score-big" id="score-big">--</div>
        <div class="score-sub" id="score-sub">awaiting results</div>
      </div>
      <div>
        <div class="sidebar-title">Run Time</div>
        <div id="timer-display" style="font-size:20px;font-weight:700;color:#fff;line-height:1;">--</div>
        <div id="timer-sub" style="font-size:11px;color:var(--muted);margin-top:3px;">waiting</div>
      </div>
      <div>
        <div class="sidebar-title">Current Scenario</div>
        <div id="current-scenario" style="font-size:12px;color:var(--text);">--</div>
        <div id="current-step" style="font-size:11px;color:var(--muted);margin-top:4px;"></div>
      </div>
      <div id="assertions-panel" style="display:none">
        <div class="sidebar-title">Assertions</div>
        <ul class="assert-list" id="assert-list"></ul>
      </div>
      <div id="results-panel" style="display:none">
        <div class="sidebar-title">Results</div>
        <table class="results-table" id="results-table">
          <thead><tr><th>#</th><th>Scenario</th><th>Result</th><th>Time</th></tr></thead>
          <tbody id="results-body"></tbody>
        </table>
      </div>
      <div>
        <div class="sidebar-title">Connection</div>
        <div class="conn-status" id="conn-status"><div class="conn-dot connecting" id="conn-dot"></div><span id="conn-text">Connecting...</span></div>
      </div>
    </div>
  </div>
</div>

<script>
const feed          = document.getElementById("feed");
const waiting       = document.getElementById("waiting");
const scoreBig      = document.getElementById("score-big");
const scoreSub      = document.getElementById("score-sub");
const connDot       = document.getElementById("conn-dot");
const connTxt       = document.getElementById("conn-text");
const badgeLive     = document.getElementById("badge-live");
const headerMeta    = document.getElementById("header-meta");
const scenariosBar  = document.getElementById("scenarios-bar");
const timerDisplay  = document.getElementById("timer-display");
const timerSub      = document.getElementById("timer-sub");
const currentScenario = document.getElementById("current-scenario");
const currentStep   = document.getElementById("current-step");
const assertPanel   = document.getElementById("assertions-panel");
const assertList    = document.getElementById("assert-list");
const resultsPanel  = document.getElementById("results-panel");
const resultsBody   = document.getElementById("results-body");

let runStartTs = 0;
let timerInterval = null;
let totalScenarios = 0;
let passCount = 0;
let failCount = 0;
let doneCount = 0;
let runDone = false;
let closeStream = () => {};

function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m + "m " + String(s).padStart(2, "0") + "s";
}

function startTimer() {
  runStartTs = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerDisplay.textContent = formatDuration(Date.now() - runStartTs);
    timerSub.textContent = "running";
  }, 1000);
}

function stopTimer(ms) {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  timerDisplay.textContent = formatDuration(ms);
  timerSub.textContent = "complete";
}

function appendPhaseRow(label) {
  const el = document.createElement("div");
  el.className = "phase-row";
  el.textContent = label;
  feed.appendChild(el);
  scrollFeed();
}

function appendRow(icon, label, sub, meta, extraClass) {
  if (waiting) waiting.style.display = "none";
  const row = document.createElement("div");
  row.className = "row" + (extraClass ? " " + extraClass : "");
  row.innerHTML =
    '<span class="row-icon">' + icon + '</span>' +
    '<span class="row-body">' +
      '<span class="row-label">' + label + '</span>' +
      (sub ? '<div class="row-sub">' + sub + '</div>' : "") +
    '</span>' +
    (meta ? '<span class="row-meta">' + meta + '</span>' : "");
  feed.appendChild(row);
  scrollFeed();
}

function scrollFeed() {
  requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
}

function updateScore() {
  if (doneCount === 0) return;
  const pct = Math.round((passCount / doneCount) * 100);
  scoreBig.textContent = pct + "%";
  scoreBig.style.color = failCount === 0 ? "var(--green)" : passCount === 0 ? "var(--red)" : "#fff";
  scoreSub.textContent = passCount + " pass / " + failCount + " fail  (" + doneCount + "/" + totalScenarios + ")";
}

function setActiveScenario(id) {
  document.querySelectorAll(".sc-step").forEach(el => {
    if (el.dataset.id === id) el.classList.add("active");
    else el.classList.remove("active");
  });
}

function setScenarioResult(id, status) {
  const el = document.querySelector('.sc-step[data-id="' + id + '"]');
  if (!el) return;
  el.classList.remove("active");
  el.classList.add(status.toLowerCase());
}

function escapeHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ── SSE ────────────────────────────────────────────────────── */

function connect() {
  const es = new EventSource("/events");
  closeStream = () => es.close();

  es.onopen = () => {
    connDot.className = "conn-dot";
    connTxt.textContent = "Connected";
    badgeLive.textContent = "live";
    badgeLive.className = "badge green";
  };

  es.onerror = () => {
    if (runDone) return;
    connDot.className = "conn-dot off";
    connTxt.textContent = "Disconnected -- retrying...";
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

    case "run_start": {
      // Reset state for fresh run
      totalScenarios = ev.total;
      passCount = 0; failCount = 0; doneCount = 0;
      runDone = false;
      feed.innerHTML = "";
      assertList.innerHTML = "";
      assertPanel.style.display = "none";
      resultsBody.innerHTML = "";
      resultsPanel.style.display = "";
      scoreBig.textContent = "--";
      scoreBig.style.color = "#fff";
      scoreSub.textContent = "awaiting results";
      scenariosBar.innerHTML = "";
      startTimer();
      badgeLive.textContent = "live";
      badgeLive.className = "badge blue";
      const info = ev.total + " scenarios" + (ev.filter ? " (filter: " + ev.filter + ")" : "");
      headerMeta.textContent = info;
      appendRow(">>", "E2E run started", info, "");
      break;
    }

    case "scenario_start": {
      // Add step to stepper bar
      const step = document.createElement("div");
      step.className = "sc-step";
      step.dataset.id = ev.id;
      step.innerHTML = '<div class="dot"></div>' + ev.id;
      scenariosBar.appendChild(step);
      setActiveScenario(ev.id);

      // Clear assertions
      assertList.innerHTML = "";
      assertPanel.style.display = "none";

      // Update sidebar
      currentScenario.innerHTML = '<span style="color:var(--blue)">[' + ev.id + ']</span> ' + escapeHtml(ev.name);
      currentStep.textContent = "starting...";

      appendPhaseRow("Scenario " + ev.id + " -- " + ev.name);
      appendRow(">>", "[" + ev.id + "] " + escapeHtml(ev.name), "", ev.index + "/" + ev.total);
      break;
    }

    case "scenario_step": {
      currentStep.textContent = ev.step;
      if (ev.detail) {
        appendRow(".", escapeHtml(ev.step), escapeHtml(ev.detail), "");
      } else {
        appendRow(".", escapeHtml(ev.step), "", "");
      }
      break;
    }

    case "scenario_session": {
      const dur = ev.durationMs ? (ev.durationMs / 1000).toFixed(1) + "s" : "";
      const exitInfo = ev.exitCode !== undefined ? "exit=" + ev.exitCode : "";
      const preview = ev.responsePreview ? escapeHtml(ev.responsePreview.slice(0, 150)) + (ev.responsePreview.length > 150 ? "..." : "") : "";
      appendRow(
        '<span style="color:var(--cyan)">$</span>',
        "Session " + ev.session + ": " + escapeHtml(ev.message.slice(0, 80)) + (ev.message.length > 80 ? "..." : ""),
        preview,
        [exitInfo, dur].filter(Boolean).join(" / ")
      );
      break;
    }

    case "scenario_waiting": {
      const found = ev.found !== undefined ? " (" + ev.found + " found)" : "";
      currentStep.textContent = ev.label + found;
      appendRow(
        '<span style="color:var(--yellow)">...</span>',
        escapeHtml(ev.label),
        ev.expected !== undefined ? "expecting >= " + ev.expected + found : found,
        ""
      );
      break;
    }

    case "scenario_assertion": {
      assertPanel.style.display = "";
      const li = document.createElement("li");
      li.className = ev.pass ? "assert-pass" : "assert-fail";
      li.innerHTML = (ev.pass ? "+" : "x") + " " + escapeHtml(ev.label);
      assertList.appendChild(li);

      const icon = ev.pass
        ? '<span class="correct">+</span>'
        : '<span class="incorrect">x</span>';
      appendRow(icon, escapeHtml(ev.label), "", "");
      break;
    }

    case "scenario_end": {
      setScenarioResult(ev.id, ev.status);
      doneCount++;
      if (ev.status === "PASS") passCount++;
      else failCount++;
      updateScore();

      const statusCls = ev.status === "PASS" ? "correct" : "incorrect";
      const dur = (ev.durationMs / 1000).toFixed(1) + "s";
      const memInfo = ev.memoriesCount !== undefined ? ev.memoriesCount + " memories" : "";
      appendRow(
        '<span class="' + statusCls + '">' + (ev.status === "PASS" ? "+" : "x") + '</span>',
        '<span class="' + statusCls + '">[' + ev.id + '] ' + escapeHtml(ev.name) + ' -- ' + ev.status + '</span>',
        ev.error ? '<span style="color:var(--red)">' + escapeHtml(ev.error) + '</span>' : memInfo,
        dur
      );

      // Add to results table
      const tr = document.createElement("tr");
      const statusClass = "result-" + ev.status.toLowerCase();
      tr.innerHTML =
        '<td style="color:var(--muted)">' + ev.id + '</td>' +
        '<td>' + escapeHtml(ev.name) + '</td>' +
        '<td class="' + statusClass + '">' + ev.status + '</td>' +
        '<td style="color:var(--muted)">' + dur + '</td>';
      resultsBody.appendChild(tr);

      // Reset current scenario display
      currentScenario.textContent = "--";
      currentStep.textContent = "";
      break;
    }

    case "cleanup": {
      if (ev.deleted > 0) {
        appendRow(
          '<span style="color:var(--muted)">~</span>',
          "Cleanup [" + ev.id + "]",
          "deleted " + ev.deleted + " test memories",
          ""
        );
      }
      break;
    }

    case "run_complete": {
      runDone = true;
      stopTimer(ev.durationMs);

      const pct = ev.total > 0 ? Math.round((ev.passed / ev.total) * 100) : 0;
      scoreBig.textContent = pct + "%";
      scoreBig.style.color = ev.failed === 0 ? "var(--green)" : ev.passed === 0 ? "var(--red)" : "var(--yellow)";
      scoreSub.textContent = ev.passed + " pass / " + ev.failed + " fail  (" + ev.total + " total) -- " + formatDuration(ev.durationMs);

      const allPass = ev.failed === 0;
      appendRow(
        allPass ? '<span style="color:var(--green)">*</span>' : '<span style="color:var(--red)">*</span>',
        (allPass ? "All scenarios passed" : ev.failed + " scenario(s) failed") + " -- " + pct + "% pass rate",
        ev.passed + "/" + ev.total + " passed in " + formatDuration(ev.durationMs),
        ""
      );

      badgeLive.textContent = allPass ? "done" : "failed";
      badgeLive.className = allPass ? "badge green" : "badge red";

      setTimeout(() => {
        closeStream();
        const status = document.getElementById("conn-status");
        if (status) {
          status.style.background = allPass ? "#0f2b17" : "#2b0f0f";
          status.style.borderColor = allPass ? "#1a4025" : "#40251a";
          const col = allPass ? "var(--green)" : "var(--red)";
          status.innerHTML = '<span style="color:' + col + ';font-size:13px">' + (allPass ? "+" : "x") + '</span><span style="color:' + col + '">Run complete -- you can close this tab</span>';
        }
      }, 400);
      break;
    }
  }
}

connect();
</script>
</body>
</html>`;
