/**
 * Self-contained HTML dashboard — single string export, zero external dependencies.
 *
 * Replicates the old Next.js frontend as a vanilla JS single-page app:
 *   - Stats grid (total memories, projects, scopes)
 *   - API costs panel with per-provider breakdown
 *   - Live API activity feed (polls every 4s)
 *   - Memory types bar chart (pure CSS)
 *   - Recent memories list
 *   - Project/scope list
 *   - Semantic search
 *
 * Design: zinc-950 dark background, monospace typography, emerald/pink scope badges,
 * 10 memory-type colors matching the original frontend exactly.
 *
 * All CSS and JS are inlined. No CDN links, no external fonts, no build step.
 */

export function getDashboardHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>codexfi dashboard</title>
<style>
/* ── Reset & base ──────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
	--bg-950: #09090b;
	--bg-900: #18181b;
	--bg-800: #27272a;
	--bg-800-50: rgba(39,39,42,0.5);
	--bg-700: #3f3f46;
	--bg-700-50: rgba(63,63,70,0.5);

	--text-50: #fafafa;
	--text-300: #d4d4d8;
	--text-400: #a1a1aa;
	--text-500: #71717a;
	--text-600: #52525b;
	--text-700: #3f3f46;

	--emerald-400: #34d399;
	--emerald-500: #10b981;
	--emerald-500-10: rgba(16,185,129,0.1);
	--emerald-500-30: rgba(16,185,129,0.3);
	--emerald-500-60: rgba(16,185,129,0.6);

	--pink-400: #f472b6;
	--pink-500-10: rgba(236,72,153,0.1);
	--pink-500-30: rgba(236,72,153,0.3);

	--amber-400: #fbbf24;
	--violet-400: #a78bfa;
	--green-400: #4ade80;
	--sky-400: #38bdf8;
	--red-400: #f87171;
	--red-500-10: rgba(239,68,68,0.1);
	--red-500-50: rgba(239,68,68,0.5);

	--blue-400: #60a5fa;
	--blue-500-15: rgba(59,130,246,0.15);
	--blue-500-30: rgba(59,130,246,0.3);

	--purple-400: #c084fc;
	--purple-500-15: rgba(168,85,247,0.15);
	--purple-500-30: rgba(168,85,247,0.3);

	--cyan-400: #22d3ee;
	--cyan-500-15: rgba(6,182,212,0.15);
	--cyan-500-30: rgba(6,182,212,0.3);

	--orange-400: #fb923c;
	--orange-500-15: rgba(249,115,22,0.15);
	--orange-500-30: rgba(249,115,22,0.3);

	--indigo-400: #818cf8;
	--indigo-500-15: rgba(99,102,241,0.15);
	--indigo-500-30: rgba(99,102,241,0.3);

	--amber-500-15: rgba(245,158,11,0.15);
	--amber-500-30: rgba(245,158,11,0.3);

	--red-500-15: rgba(239,68,68,0.15);
	--red-500-30: rgba(239,68,68,0.3);

	--emerald-500-15: rgba(16,185,129,0.15);

	--pink-500-15: rgba(236,72,153,0.15);

	--zinc-500-15: rgba(113,113,122,0.15);
	--zinc-500-30: rgba(113,113,122,0.3);
}

body {
	background: var(--bg-950);
	color: var(--text-300);
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
	font-size: 14px;
	line-height: 1.5;
	-webkit-font-smoothing: antialiased;
}

/* ── Layout ────────────────────────────────────────────────────────────────── */
.container {
	max-width: 72rem;
	margin: 0 auto;
	padding: 2rem;
}

.header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	margin-bottom: 2rem;
}
.header h1 {
	font-size: 1.5rem;
	font-weight: 700;
	color: var(--text-50);
}
.header .subtitle {
	font-size: 0.875rem;
	color: var(--text-500);
	margin-top: 0.25rem;
}
.header .updated {
	font-size: 0.75rem;
	color: var(--text-600);
	display: flex;
	align-items: center;
	gap: 0.5rem;
}
.pulse {
	display: inline-block;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--emerald-500);
	animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.4; }
}

/* ── Cards / panels ────────────────────────────────────────────────────────── */
.card {
	background: var(--bg-900);
	border: 1px solid var(--bg-800);
	border-radius: 0.75rem;
	padding: 1.5rem;
	margin-bottom: 2rem;
}
.card-header {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--text-400);
	text-transform: uppercase;
	letter-spacing: 0.05em;
	margin-bottom: 1rem;
}
.card-header-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 1.25rem;
}

/* ── Stats grid ────────────────────────────────────────────────────────────── */
.stats-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 1rem;
	margin-bottom: 2rem;
}
@media (max-width: 768px) {
	.stats-grid { grid-template-columns: repeat(2, 1fr); }
}
.stat-card {
	background: var(--bg-900);
	border: 1px solid var(--bg-800);
	border-radius: 0.75rem;
	padding: 1.25rem;
}
.stat-label {
	font-size: 0.75rem;
	color: var(--text-500);
	text-transform: uppercase;
	letter-spacing: 0.05em;
}
.stat-value {
	font-size: 1.75rem;
	font-weight: 700;
	color: var(--text-50);
	margin-top: 0.25rem;
}
.stat-sub {
	font-size: 0.75rem;
	color: var(--text-600);
	margin-top: 0.125rem;
}

/* ── Cost panel ────────────────────────────────────────────────────────────── */
.cost-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 1rem;
}
@media (max-width: 768px) {
	.cost-grid { grid-template-columns: 1fr; }
}
.cost-provider {
	background: var(--bg-800-50);
	border-radius: 0.5rem;
	padding: 1rem;
}
.cost-provider-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.5rem;
}
.cost-provider-name {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--text-300);
}
.cost-provider-total {
	font-size: 0.875rem;
	font-weight: 700;
}
.cost-row {
	display: flex;
	justify-content: space-between;
	font-size: 0.75rem;
	color: var(--text-500);
	padding: 0.125rem 0;
}
.cost-row-value {
	color: var(--text-400);
}
.cost-footer {
	font-size: 0.75rem;
	color: var(--text-600);
	padding-top: 0.5rem;
	margin-top: 0.5rem;
	border-top: 1px solid var(--bg-700-50);
}
.cost-total-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}
.cost-total-value {
	font-size: 1.25rem;
	font-weight: 700;
	color: var(--text-50);
}
.cost-updated {
	font-size: 0.75rem;
	color: var(--text-700);
	text-align: right;
	margin-top: 0.75rem;
}

/* ── Buttons ───────────────────────────────────────────────────────────────── */
.btn-sm {
	font-family: inherit;
	font-size: 0.75rem;
	padding: 0.25rem 0.5rem;
	border-radius: 0.375rem;
	border: 1px solid var(--bg-700);
	background: transparent;
	color: var(--text-500);
	cursor: pointer;
	transition: all 0.15s;
}
.btn-sm:hover {
	color: var(--text-300);
	border-color: var(--text-600);
}
.btn-danger {
	border-color: var(--red-500-50);
	background: var(--red-500-10);
	color: var(--red-400);
}
.btn-danger:hover {
	background: rgba(239,68,68,0.2);
}

/* ── Activity feed ─────────────────────────────────────────────────────────── */
.activity-header-left {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}
.activity-meta {
	font-size: 0.75rem;
	color: var(--text-600);
}
.activity-table {
	overflow: hidden;
	border-radius: 0.5rem;
	border: 1px solid var(--bg-800);
}
.activity-thead {
	display: grid;
	grid-template-columns: 5.5rem 4rem 5rem 1fr 4.5rem 6rem;
	gap: 0.75rem;
	padding: 0.375rem 0.75rem;
	background: var(--bg-800-50);
	font-size: 0.625rem;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--text-500);
}
.activity-body {
	max-height: 18rem;
	overflow-y: auto;
}
.activity-row {
	display: grid;
	grid-template-columns: 5.5rem 4rem 5rem 1fr 4.5rem 6rem;
	gap: 0.75rem;
	padding: 0.5rem 0.75rem;
	font-size: 0.75rem;
	border-top: 1px solid rgba(39,39,42,0.5);
	transition: background 0.1s;
}
.activity-row:first-child {
	background: rgba(39,39,42,0.3);
}
.activity-row:hover {
	background: rgba(39,39,42,0.2);
}
.activity-empty {
	font-size: 0.75rem;
	color: var(--text-600);
	text-align: center;
	padding: 1rem 0;
}
.new-badge {
	font-size: 0.75rem;
	color: var(--emerald-400);
	animation: pulse 1.5s ease-in-out infinite;
}

/* ── Type bars ─────────────────────────────────────────────────────────────── */
.type-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	margin-bottom: 0.75rem;
}
.type-badge-col {
	width: 9rem;
	flex-shrink: 0;
}
.type-bar-track {
	flex: 1;
	height: 0.375rem;
	background: var(--bg-800);
	border-radius: 9999px;
	overflow: hidden;
}
.type-bar-fill {
	height: 100%;
	border-radius: 9999px;
	background: var(--emerald-500-60);
	transition: width 0.5s ease;
}
.type-count {
	width: 1.5rem;
	text-align: right;
	font-size: 0.75rem;
	color: var(--text-400);
}

/* ── Memory type badges ────────────────────────────────────────────────────── */
.badge {
	display: inline-block;
	font-size: 0.6875rem;
	font-weight: 500;
	padding: 0.125rem 0.5rem;
	border-radius: 0.25rem;
	border: 1px solid;
	white-space: nowrap;
}
.badge-project-brief   { color: var(--blue-400);    background: var(--blue-500-15);    border-color: var(--blue-500-30); }
.badge-architecture    { color: var(--purple-400);  background: var(--purple-500-15);  border-color: var(--purple-500-30); }
.badge-tech-context    { color: var(--cyan-400);    background: var(--cyan-500-15);    border-color: var(--cyan-500-30); }
.badge-product-context { color: var(--emerald-400); background: var(--emerald-500-15); border-color: var(--emerald-500-30); }
.badge-progress        { color: var(--amber-400);   background: var(--amber-500-15);   border-color: var(--amber-500-30); }
.badge-session-summary { color: var(--orange-400);  background: var(--orange-500-15);  border-color: var(--orange-500-30); }
.badge-error-solution  { color: var(--red-400);     background: var(--red-500-15);     border-color: var(--red-500-30); }
.badge-preference      { color: var(--pink-400);    background: var(--pink-500-15);    border-color: var(--pink-500-30); }
.badge-learned-pattern { color: var(--indigo-400);  background: var(--indigo-500-15);  border-color: var(--indigo-500-30); }
.badge-project-config  { color: var(--text-400);    background: var(--zinc-500-15);    border-color: var(--zinc-500-30); }
.badge-unknown         { color: var(--text-400);    background: var(--zinc-500-15);    border-color: var(--zinc-500-30); }

/* Scope badges */
.scope-badge {
	display: inline-block;
	font-size: 0.75rem;
	padding: 0.125rem 0.375rem;
	border-radius: 0.25rem;
	border: 1px solid;
}
.scope-project {
	color: var(--emerald-400);
	border-color: var(--emerald-500-30);
	background: var(--emerald-500-10);
}
.scope-user {
	color: var(--pink-400);
	border-color: var(--pink-500-30);
	background: var(--pink-500-10);
}

/* ── Memory cards ──────────────────────────────────────────────────────────── */
.memory-item {
	display: flex;
	gap: 0.75rem;
	align-items: flex-start;
	margin-bottom: 0.75rem;
}
.memory-text {
	flex: 1;
	min-width: 0;
}
.memory-text p {
	font-size: 0.875rem;
	color: var(--text-300);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.memory-time {
	font-size: 0.75rem;
	color: var(--text-600);
	margin-top: 0.125rem;
}

/* Memory card — full card with hover-reveal delete */
.mem-card {
	padding: 0.75rem;
	border-radius: 0.5rem;
	background: var(--bg-800-50);
	margin-bottom: 0.5rem;
	position: relative;
}
.mem-card:hover { background: var(--bg-800); }
.mem-card-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.375rem;
}
.mem-card-head-left {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}
.mem-card-time {
	font-size: 0.75rem;
	color: var(--text-600);
}
.mem-card-body {
	font-size: 0.875rem;
	color: var(--text-300);
	white-space: pre-wrap;
	word-break: break-word;
	line-height: 1.4;
}
.mem-card-footer {
	font-size: 0.6875rem;
	color: var(--text-600);
	margin-top: 0.375rem;
}
.mem-card-delete {
	font-family: inherit;
	font-size: 0.75rem;
	padding: 0.125rem 0.5rem;
	border-radius: 0.25rem;
	border: 1px solid var(--bg-700);
	background: transparent;
	color: var(--text-500);
	cursor: pointer;
	opacity: 0;
	transition: all 0.15s;
}
.mem-card:hover .mem-card-delete { opacity: 1; }
.mem-card-delete:hover {
	color: var(--red-400);
	border-color: var(--red-500-50);
}

/* ── Project detail view ───────────────────────────────────────────────────── */
.detail-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 1.5rem;
}
.detail-header-left {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}
.detail-title {
	font-size: 1.25rem;
	font-weight: 700;
	color: var(--text-50);
}
.detail-uid {
	font-size: 0.75rem;
	color: var(--text-600);
	margin-top: 0.125rem;
}
.detail-count {
	font-size: 1.75rem;
	font-weight: 700;
	color: var(--text-50);
}
.back-btn {
	font-family: inherit;
	font-size: 0.75rem;
	padding: 0.25rem 0.75rem;
	border-radius: 0.375rem;
	border: 1px solid var(--bg-700);
	background: transparent;
	color: var(--text-400);
	cursor: pointer;
	transition: all 0.15s;
}
.back-btn:hover {
	color: var(--text-300);
	border-color: var(--text-600);
}

/* Filter tabs */
.filter-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	margin-bottom: 1rem;
}
.filter-tab {
	font-family: inherit;
	font-size: 0.6875rem;
	padding: 0.25rem 0.625rem;
	border-radius: 0.375rem;
	border: 1px solid var(--bg-700);
	background: transparent;
	color: var(--text-500);
	cursor: pointer;
	transition: all 0.15s;
}
.filter-tab:hover {
	border-color: var(--text-600);
	color: var(--text-300);
}
.filter-tab.active {
	background: var(--bg-700);
	border-color: var(--text-600);
	color: var(--text-50);
}

/* Filter search input */
.filter-input {
	width: 100%;
	font-family: inherit;
	font-size: 0.875rem;
	padding: 0.5rem 0.75rem;
	background: var(--bg-800);
	border: 1px solid var(--bg-700);
	border-radius: 0.5rem;
	color: var(--text-300);
	outline: none;
	margin-bottom: 1rem;
	transition: border-color 0.15s;
}
.filter-input:focus { border-color: var(--emerald-500); }
.filter-input::placeholder { color: var(--text-600); }

/* Breadcrumb */
.breadcrumb {
	font-size: 0.75rem;
	color: var(--text-500);
	margin-bottom: 1rem;
}
.breadcrumb a {
	color: var(--text-400);
	text-decoration: none;
	cursor: pointer;
}
.breadcrumb a:hover { color: var(--emerald-400); }

/* ── Project list ──────────────────────────────────────────────────────────── */
.project-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0.5rem 0.75rem;
	border-radius: 0.5rem;
	transition: background 0.15s;
	cursor: pointer;
}
.project-row:hover {
	background: var(--bg-800);
}
.project-left {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	min-width: 0;
}
.project-name {
	font-size: 0.875rem;
	color: var(--text-300);
	font-weight: 500;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.project-id {
	font-size: 0.75rem;
	color: var(--text-600);
}
.project-count {
	font-size: 0.875rem;
	color: var(--text-500);
	flex-shrink: 0;
}

/* ── Search ────────────────────────────────────────────────────────────────── */
.search-bar {
	display: flex;
	gap: 0.5rem;
	margin-bottom: 1rem;
}
.search-input {
	flex: 1;
	font-family: inherit;
	font-size: 0.875rem;
	padding: 0.5rem 0.75rem;
	background: var(--bg-800);
	border: 1px solid var(--bg-700);
	border-radius: 0.5rem;
	color: var(--text-300);
	outline: none;
	transition: border-color 0.15s;
}
.search-input:focus {
	border-color: var(--emerald-500);
}
.search-input::placeholder {
	color: var(--text-600);
}
.search-btn {
	font-family: inherit;
	font-size: 0.875rem;
	padding: 0.5rem 1rem;
	background: var(--emerald-500-10);
	border: 1px solid var(--emerald-500-30);
	border-radius: 0.5rem;
	color: var(--emerald-400);
	cursor: pointer;
	transition: all 0.15s;
}
.search-btn:hover {
	background: rgba(16,185,129,0.2);
}
.search-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
.search-result {
	padding: 0.75rem;
	border-radius: 0.5rem;
	background: var(--bg-800-50);
	margin-bottom: 0.5rem;
}
.search-result-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.375rem;
}
.search-score {
	font-size: 0.75rem;
	color: var(--emerald-400);
	font-weight: 600;
}
.search-result-memory {
	font-size: 0.875rem;
	color: var(--text-300);
	line-height: 1.4;
}
.search-result-meta {
	font-size: 0.75rem;
	color: var(--text-600);
	margin-top: 0.25rem;
}

/* ── Modal overlay ─────────────────────────────────────────────────────────── */
.modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 50;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0,0,0,0.7);
	backdrop-filter: blur(4px);
}
.modal-overlay.hidden { display: none; }
.modal-box {
	background: var(--bg-900);
	border: 1px solid var(--bg-700);
	border-radius: 0.75rem;
	padding: 1.5rem;
	width: 100%;
	max-width: 24rem;
	margin: 0 1rem;
}
.modal-title {
	font-size: 1rem;
	font-weight: 600;
	color: var(--text-50);
	margin-bottom: 0.25rem;
}
.modal-desc {
	font-size: 0.875rem;
	color: var(--text-400);
	line-height: 1.5;
}
.modal-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
	margin-top: 1rem;
}

/* ── Utilities ─────────────────────────────────────────────────────────────── */
.text-right { text-align: right; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hidden { display: none !important; }

/* API provider cost colors */
.cost-xai       { color: var(--amber-400); }
.cost-anthropic { color: var(--violet-400); }
.cost-google    { color: var(--green-400); }
.cost-voyage    { color: var(--sky-400); }

/* API provider label colors in activity */
.api-xai       { color: var(--amber-400);  font-weight: 600; }
.api-anthropic { color: var(--violet-400); font-weight: 600; }
.api-google    { color: var(--green-400);  font-weight: 600; }
.api-voyage    { color: var(--sky-400);    font-weight: 600; }

/* Loading state */
.loading {
	color: var(--text-500);
	animation: pulse 2s ease-in-out infinite;
	padding: 2rem;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-700); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-600); }
</style>
</head>
<body>

<div class="container" id="app">
	<div class="loading">Loading...</div>
</div>

<!-- Shared modal overlay — content is set dynamically by JS -->
<div class="modal-overlay hidden" id="modal">
	<div class="modal-box" id="modal-box"></div>
</div>

<script>
// ── State ───────────────────────────────────────────────────────────────────────

let stats = null;
let costs = null;
let activity = [];
let memories = [];
let searchResults = null;
let searchLoading = false;
let searchError = null;
let lastUpdated = null;
let prevActivityCount = 0;
let newActivityCount = 0;
let fetchError = null;

// Project detail view state
let currentView = "dashboard"; // "dashboard" | "detail"
let detailUserId = null;
let detailMemories = [];
let detailLoading = false;
let detailFilter = "all";
let detailSearch = "";

// ── Constants ───────────────────────────────────────────────────────────────────

const ALL_TYPES = [
	"project-brief", "architecture", "tech-context", "product-context",
	"progress", "session-summary", "error-solution", "preference",
	"learned-pattern", "project-config",
];

const API_LABELS = { xai: "xAI", anthropic: "Anthropic", google: "Google", voyage: "Voyage" };
const API_MODELS = {
	xai: "grok-4-fast",
	anthropic: "claude-haiku-4-5",
	google: "gemini-3-flash",
	voyage: "voyage-code-3",
};
const API_PRICING = {
	xai: "$0.20 / $0.05 cached / $0.50 per M",
	anthropic: "$1.00 / $5.00 per M",
	google: "$0.50 / $3.00 per M",
	voyage: "$0.18 per M tokens",
};

// ── Formatters ──────────────────────────────────────────────────────────────────

function fmtUSD(n) {
	if (n === 0) return "$0.00";
	if (n < 0.0001) return "$" + n.toFixed(8);
	if (n < 0.01) return "$" + n.toFixed(6);
	return "$" + n.toFixed(4);
}

function fmtTokens(n) {
	if (n == null) return "\\u2014";
	if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
	if (n >= 1000) return (n / 1000).toFixed(1) + "k";
	return String(n);
}

function timeAgo(iso) {
	if (!iso) return "\\u2014";
	try {
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return "just now";
		if (mins < 60) return mins + "m ago";
		const hours = Math.floor(mins / 60);
		if (hours < 24) return hours + "h ago";
		const days = Math.floor(hours / 24);
		if (days < 30) return days + "d ago";
		return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
	} catch { return iso; }
}

function timeAgoShort(iso) {
	const diff = (Date.now() - new Date(iso).getTime()) / 1000;
	if (diff < 5) return "just now";
	if (diff < 60) return Math.floor(diff) + "s ago";
	if (diff < 3600) return Math.floor(diff / 60) + "m ago";
	return Math.floor(diff / 3600) + "h ago";
}

function shortId(uid) {
	const parts = uid.split("_");
	return (parts[parts.length - 1] || uid).slice(0, 8);
}

function escapeHtml(str) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function badgeClass(type) {
	const safe = (type || "unknown").replace(/[^a-z-]/g, "");
	return "badge badge-" + (ALL_TYPES.includes(safe) ? safe : "unknown");
}

// ── Data fetching ───────────────────────────────────────────────────────────────

async function fetchStats() {
	try {
		const res = await fetch("/api/stats");
		if (res.ok) { stats = await res.json(); fetchError = null; }
		else fetchError = "Stats API returned " + res.status;
	} catch (e) { fetchError = "Stats fetch failed: " + e.message; }
}

async function fetchCosts() {
	try {
		const res = await fetch("/api/costs");
		if (res.ok) { costs = await res.json(); }
		else fetchError = "Costs API returned " + res.status;
	} catch (e) { fetchError = "Costs fetch failed: " + e.message; }
}

async function fetchActivity() {
	try {
		const res = await fetch("/api/activity?limit=30");
		if (!res.ok) return;
		const data = await res.json();
		const incoming = data.entries || [];
		const added = incoming.length - prevActivityCount;
		if (added > 0 && prevActivityCount > 0) {
			newActivityCount = added;
			setTimeout(function() { newActivityCount = 0; render(); }, 2000);
		}
		prevActivityCount = incoming.length;
		activity = incoming;
	} catch (e) { /* silently ignore */ }
}

async function fetchMemories() {
	try {
		const res = await fetch("/api/memories?limit=10");
		if (res.ok) {
			const data = await res.json();
			memories = data.results || [];
		}
	} catch (e) { /* silently ignore */ }
}

async function fetchAll() {
	await Promise.all([fetchStats(), fetchCosts(), fetchActivity(), fetchMemories()]);
	lastUpdated = new Date();
	render();
}

async function doSearch(query) {
	if (!query.trim()) return;
	searchLoading = true;
	searchError = null;
	render();
	try {
		var res = await fetch("/api/search?q=" + encodeURIComponent(query) + "&limit=10");
		var data = await res.json();
		if (res.ok) {
			searchResults = data.results || [];
		} else {
			searchError = data.error || ("Search returned " + res.status);
			searchResults = [];
		}
	} catch (e) {
		searchError = "Search request failed: " + e.message;
		searchResults = [];
	}
	searchLoading = false;
	render();
}

// ── Project detail fetching ─────────────────────────────────────────────────────

async function fetchProjectMemories(userId) {
	detailLoading = true;
	render();
	try {
		const res = await fetch("/api/memories?user_id=" + encodeURIComponent(userId) + "&limit=200");
		if (res.ok) {
			const data = await res.json();
			detailMemories = data.results || [];
		}
	} catch (e) {
		detailMemories = [];
	}
	detailLoading = false;
	render();
}

// ── Navigation ──────────────────────────────────────────────────────────────────

function openProject(userId) {
	currentView = "detail";
	detailUserId = userId;
	detailFilter = "all";
	detailSearch = "";
	detailMemories = [];
	window.scrollTo(0, 0);
	fetchProjectMemories(userId);
}

function goBack() {
	currentView = "dashboard";
	detailUserId = null;
	detailMemories = [];
	detailFilter = "all";
	detailSearch = "";
	render();
}

// ── Delete memory ───────────────────────────────────────────────────────────────

function confirmDeleteMemory(memId, memText) {
	var preview = memText.length > 120 ? memText.slice(0, 120) + "..." : memText;
	var box = document.getElementById("modal-box");
	// Store the ID for the confirm handler to read
	window._pendingDeleteId = memId;
	box.innerHTML = '<div class="modal-title">Delete this memory?</div>'
		+ '<div class="modal-desc" style="margin-top:0.5rem">&ldquo;' + escapeHtml(preview) + '&rdquo;</div>'
		+ '<div class="modal-actions">'
		+ '<button class="btn-sm" onclick="closeModal()">Cancel</button>'
		+ '<button class="btn-sm btn-danger" onclick="doDeletePending()">Delete</button>'
		+ '</div>';
	document.getElementById("modal").classList.remove("hidden");
}

function doDeletePending() {
	if (window._pendingDeleteId) doDeleteMemory(window._pendingDeleteId);
}

function onDeleteClick(btn) {
	var id = btn.getAttribute("data-id");
	var idx = parseInt(btn.getAttribute("data-idx"), 10);
	var filtered = getFilteredMemories();
	var mem = filtered[idx];
	if (id && mem) confirmDeleteMemory(id, mem.memory);
}

function getFilteredMemories() {
	return detailMemories.filter(function(m) {
		var typeMatch = detailFilter === "all" || m.type === detailFilter;
		var searchMatch = !detailSearch || m.memory.toLowerCase().indexOf(detailSearch.toLowerCase()) !== -1;
		return typeMatch && searchMatch;
	});
}

async function doDeleteMemory(memId) {
	closeModal();
	try {
		await fetch("/api/memories/" + encodeURIComponent(memId), { method: "DELETE" });
	} catch (e) { /* ignore */ }
	// Remove from local state
	detailMemories = detailMemories.filter(function(m) { return m.id !== memId; });
	// Also refresh stats
	fetchStats().then(function() { render(); });
	render();
}

// ── Modal helpers ───────────────────────────────────────────────────────────────

function openModal(html) {
	document.getElementById("modal-box").innerHTML = html;
	document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
	document.getElementById("modal").classList.add("hidden");
}

function openResetModal() {
	var box = document.getElementById("modal-box");
	box.innerHTML = '<div class="modal-title">Reset cost ledger?</div>'
		+ '<div class="modal-desc">This will zero out all accumulated token counts and USD totals. The action cannot be undone.</div>'
		+ '<div class="modal-actions">'
		+ '<button class="btn-sm" onclick="closeModal()">Cancel</button>'
		+ '<button class="btn-sm btn-danger" onclick="confirmReset()">Reset</button>'
		+ '</div>';
	document.getElementById("modal").classList.remove("hidden");
}

async function confirmReset() {
	closeModal();
	try { await fetch("/api/costs/reset", { method: "POST" }); } catch (e) {}
	await fetchAll();
}

// Close modal on Escape key and backdrop click
document.addEventListener("keydown", function(e) {
	if (e.key === "Escape") closeModal();
});
document.getElementById("modal").addEventListener("click", function(e) {
	if (e.target === this) closeModal();
});

// ── Render router ───────────────────────────────────────────────────────────────

function render() {
	if (currentView === "detail") {
		renderDetail();
	} else {
		renderDashboard();
	}
}

// ── Dashboard render ────────────────────────────────────────────────────────────

function renderDashboard() {
	var app = document.getElementById("app");
	if (!stats || !costs) {
		if (fetchError) {
			app.innerHTML = '<div style="padding:2rem;color:var(--red-400)">' + escapeHtml(fetchError) + '</div>';
		} else {
			app.innerHTML = '<div class="loading">Loading...</div>';
		}
		return;
	}

	var html = "";

	// ── Header
	html += '<div class="header">';
	html += '<div>';
	html += '<h1>Dashboard</h1>';
	html += '<div class="subtitle">Memory system overview</div>';
	html += '</div>';
	if (lastUpdated) {
		html += '<div class="updated">';
		html += 'updated ' + lastUpdated.toLocaleTimeString();
		html += ' <span class="pulse"></span>';
		html += '</div>';
	}
	html += '</div>';

	// ── Stats grid
	var projectCount = (stats.projects || []).filter(function(p) { return p.scope === "project"; }).length;
	var userCount = (stats.projects || []).filter(function(p) { return p.scope === "user"; }).length;
	html += '<div class="stats-grid">';
	html += statCard("Total Memories", stats.active);
	html += statCard("Projects", projectCount);
	html += statCard("User Scopes", userCount);
	html += statCard("Project Memories", stats.by_scope ? stats.by_scope.project : 0, "+ " + (stats.by_scope ? stats.by_scope.user : 0) + " cross-project");
	html += '</div>';

	// ── API Costs
	html += '<div class="card">';
	html += '<div class="card-header-row">';
	html += '<div><div class="card-header" style="margin-bottom:0">API Costs</div>';
	html += '<div style="font-size:0.75rem;color:var(--text-600);margin-top:0.125rem">Cumulative since last reset</div></div>';
	html += '<div class="cost-total-row">';
	html += '<span class="cost-total-value">' + fmtUSD(costs.total_cost_usd) + '</span>';
	html += '<button class="btn-sm" onclick="openResetModal()">reset</button>';
	html += '</div></div>';
	html += '<div class="cost-grid">';
	if (costs.xai && costs.xai.calls > 0) html += costProvider("xai", costs.xai);
	if (costs.anthropic && costs.anthropic.calls > 0) html += costProvider("anthropic", costs.anthropic);
	if (costs.google && costs.google.calls > 0) html += costProvider("google", costs.google);
	html += costProvider("voyage", costs.voyage);
	html += '</div>';
	if (costs.last_updated) {
		html += '<div class="cost-updated">updated ' + new Date(costs.last_updated).toLocaleString() + '</div>';
	}
	html += '</div>';

	// ── Activity feed
	html += '<div class="card">';
	html += '<div class="card-header-row">';
	html += '<div class="activity-header-left">';
	html += '<div class="card-header" style="margin-bottom:0">API Activity</div>';
	html += '<span class="pulse"></span>';
	if (newActivityCount > 0) html += '<span class="new-badge">+' + newActivityCount + ' new</span>';
	html += '</div>';
	html += '<span class="activity-meta">polling every 4s \\u00b7 last ' + activity.length + ' calls</span>';
	html += '</div>';

	if (activity.length === 0) {
		html += '<div class="activity-empty">No API calls recorded yet this session.</div>';
	} else {
		html += '<div class="activity-table">';
		html += '<div class="activity-thead">';
		html += '<span>Time</span><span>API</span><span>Operation</span><span>Tokens</span>';
		html += '<span class="text-right">Cost</span><span class="text-right">Model</span>';
		html += '</div>';
		html += '<div class="activity-body">';
		for (var i = 0; i < activity.length; i++) {
			var e = activity[i];
			html += '<div class="activity-row">';
			html += '<span class="truncate" style="color:var(--text-500)">' + timeAgoShort(e.ts) + '</span>';
			html += '<span class="api-' + e.api + '">' + (API_LABELS[e.api] || e.api) + '</span>';
			html += '<span class="truncate" style="color:var(--text-400)">' + escapeHtml(e.operation) + '</span>';
			html += '<span class="truncate" style="color:var(--text-500)">' + tokenDetail(e) + '</span>';
			html += '<span class="text-right cost-' + e.api + '">' + fmtUSD(e.cost_usd) + '</span>';
			html += '<span class="text-right truncate" style="color:var(--text-600)" title="' + escapeHtml(e.model) + '">' + escapeHtml(e.model.split("-").slice(0, 3).join("-")) + '</span>';
			html += '</div>';
		}
		html += '</div></div>';
	}
	html += '</div>';

	// ── Memory types
	var sortedTypes = ALL_TYPES
		.map(function(t) { return [t, stats.by_type[t] || 0]; })
		.filter(function(x) { return x[1] > 0; })
		.sort(function(a, b) { return b[1] - a[1]; });
	var maxTypeCount = sortedTypes.length > 0 ? sortedTypes[0][1] : 1;

	html += '<div class="card">';
	html += '<div class="card-header">Memory Types</div>';
	if (sortedTypes.length === 0) {
		html += '<div style="font-size:0.875rem;color:var(--text-600)">No memories yet.</div>';
	} else {
		for (var i = 0; i < sortedTypes.length; i++) {
			var type = sortedTypes[i][0], count = sortedTypes[i][1];
			var pct = Math.round((count / maxTypeCount) * 100);
			html += '<div class="type-row">';
			html += '<div class="type-badge-col"><span class="' + badgeClass(type) + '">' + escapeHtml(type) + '</span></div>';
			html += '<div class="type-bar-track"><div class="type-bar-fill" style="width:' + pct + '%"></div></div>';
			html += '<span class="type-count">' + count + '</span>';
			html += '</div>';
		}
	}
	html += '</div>';

	// ── Recent memories
	if (memories.length > 0) {
		html += '<div class="card">';
		html += '<div class="card-header">Recent Memories</div>';
		for (var i = 0; i < memories.length; i++) {
			var m = memories[i];
			html += '<div class="memory-item">';
			html += '<span class="' + badgeClass(m.type) + '">' + escapeHtml(m.type || "unknown") + '</span>';
			html += '<div class="memory-text">';
			html += '<p>' + escapeHtml(m.memory) + '</p>';
			html += '<div class="memory-time">' + timeAgo(m.updated_at) + '</div>';
			html += '</div></div>';
		}
		html += '</div>';
	}

	// ── Projects / scopes (clickable)
	var projects = stats.projects || [];
	if (projects.length > 0) {
		html += '<div class="card">';
		html += '<div class="card-header">All Scopes</div>';
		for (var i = 0; i < projects.length; i++) {
			var p = projects[i];
			html += '<div class="project-row" data-uid="' + escapeHtml(p.user_id) + '" onclick="openProject(this.getAttribute(&quot;data-uid&quot;))">';
			html += '<div class="project-left">';
			html += '<span class="scope-badge scope-' + p.scope + '">' + p.scope + '</span>';
			html += '<span class="project-name">' + escapeHtml(p.name || shortId(p.user_id)) + '</span>';
			if (p.name) html += '<span class="project-id">' + shortId(p.user_id) + '</span>';
			html += '</div>';
			html += '<span class="project-count">' + p.count + ' \\u2192</span>';
			html += '</div>';
		}
		html += '</div>';
	}

	// ── Search
	html += '<div class="card">';
	html += '<div class="card-header">Semantic Search</div>';
	html += '<div class="search-bar">';
	html += '<input type="text" class="search-input" id="search-input" placeholder="Search memories..." onkeydown="if(event.key===&quot;Enter&quot;)handleSearch()">';
	html += '<button class="search-btn" id="search-btn" onclick="handleSearch()"' + (searchLoading ? " disabled" : "") + '>' + (searchLoading ? "Searching..." : "Search") + '</button>';
	html += '</div>';

	if (searchError) {
		html += '<div style="font-size:0.875rem;color:var(--red-400);text-align:center;padding:1rem 0">' + escapeHtml(searchError) + '</div>';
	} else if (searchResults !== null) {
		if (searchResults.length === 0) {
			html += '<div style="font-size:0.875rem;color:var(--text-600);text-align:center;padding:1rem 0">No results found.</div>';
		} else {
			for (var i = 0; i < searchResults.length; i++) {
				var r = searchResults[i];
				var rType = (r.metadata && r.metadata.type) || r.type || "unknown";
				html += '<div class="search-result">';
				html += '<div class="search-result-header">';
				html += '<span class="' + badgeClass(rType) + '">' + escapeHtml(rType) + '</span>';
				html += '<span class="search-score">' + (r.score * 100).toFixed(1) + '%</span>';
				html += '</div>';
				html += '<div class="search-result-memory">' + escapeHtml(r.memory) + '</div>';
				html += '<div class="search-result-meta">';
				if (r.project_name) html += escapeHtml(r.project_name) + ' \\u00b7 ';
				html += timeAgo(r.created_at);
				html += '</div></div>';
			}
		}
	}
	html += '</div>';

	app.innerHTML = html;

	// Restore search input value after re-render
	var input = document.getElementById("search-input");
	if (input && window._searchQuery) {
		input.value = window._searchQuery;
	}
}

// ── Project detail render ───────────────────────────────────────────────────────

function renderDetail() {
	var app = document.getElementById("app");
	var project = null;
	if (stats && stats.projects) {
		for (var i = 0; i < stats.projects.length; i++) {
			if (stats.projects[i].user_id === detailUserId) {
				project = stats.projects[i];
				break;
			}
		}
	}

	var displayName = project ? (project.name || shortId(project.user_id)) : shortId(detailUserId || "");
	var scope = project ? project.scope : (detailUserId && detailUserId.indexOf("_user_") !== -1 ? "user" : "project");

	var html = "";

	// Breadcrumb
	html += '<div class="breadcrumb"><a onclick="goBack()">Dashboard</a> / ' + escapeHtml(shortId(detailUserId || "")) + '</div>';

	// Detail header
	html += '<div class="detail-header">';
	html += '<div>';
	html += '<div class="detail-header-left">';
	html += '<span class="scope-badge scope-' + scope + '">' + scope + '</span>';
	html += '<span class="detail-title">' + escapeHtml(displayName) + '</span>';
	html += '</div>';
	html += '<div class="detail-uid">' + escapeHtml(detailUserId || "") + '</div>';
	html += '</div>';
	html += '<div style="text-align:right">';
	html += '<div class="detail-count">' + detailMemories.length + '</div>';
	html += '<div style="font-size:0.75rem;color:var(--text-500)">memories</div>';
	html += '</div>';
	html += '</div>';

	if (detailLoading) {
		html += '<div class="loading">Loading memories...</div>';
		app.innerHTML = html;
		return;
	}

	// Text filter input
	html += '<input type="text" class="filter-input" id="detail-search" placeholder="Filter memories..." value="' + escapeHtml(detailSearch) + '" oninput="onDetailSearchInput(this.value)">';

	// Type filter tabs
	var typeCounts = {};
	for (var i = 0; i < detailMemories.length; i++) {
		var t = detailMemories[i].type || "unknown";
		typeCounts[t] = (typeCounts[t] || 0) + 1;
	}

	html += '<div class="filter-tabs">';
	html += '<button class="filter-tab' + (detailFilter === "all" ? " active" : "") + '" onclick="setDetailFilter(\\x27all\\x27)">all (' + detailMemories.length + ')</button>';
	for (var i = 0; i < ALL_TYPES.length; i++) {
		var t = ALL_TYPES[i];
		if (typeCounts[t]) {
			html += '<button class="filter-tab' + (detailFilter === t ? " active" : "") + '" onclick="setDetailFilter(\\x27' + t + '\\x27)">';
			html += '<span class="' + badgeClass(t) + '" style="margin-right:0.25rem">' + escapeHtml(t) + '</span>';
			html += typeCounts[t];
			html += '</button>';
		}
	}
	html += '</div>';

	// Filter memories
	var filtered = getFilteredMemories();

	// Memory cards
	if (filtered.length === 0) {
		html += '<div style="font-size:0.875rem;color:var(--text-600);text-align:center;padding:2rem 0">';
		html += detailMemories.length === 0 ? "No memories in this scope." : "No memories match the current filter.";
		html += '</div>';
	} else {
		for (var i = 0; i < filtered.length; i++) {
			var m = filtered[i];
			html += '<div class="mem-card">';
			html += '<div class="mem-card-head">';
			html += '<div class="mem-card-head-left">';
			html += '<span class="' + badgeClass(m.type) + '">' + escapeHtml(m.type || "unknown") + '</span>';
			html += '<span class="mem-card-time">' + timeAgo(m.updated_at) + '</span>';
			html += '</div>';
			html += '<button class="mem-card-delete" data-id="' + escapeHtml(m.id) + '" data-idx="' + i + '" onclick="onDeleteClick(this)">delete</button>';
			html += '</div>';
			html += '<div class="mem-card-body">' + escapeHtml(m.memory) + '</div>';
			html += '<div class="mem-card-footer" title="' + escapeHtml(m.id) + '">' + escapeHtml(m.id.slice(0, 8)) + '</div>';
			html += '</div>';
		}
	}

	app.innerHTML = html;
}

// ── Detail view handlers ────────────────────────────────────────────────────────

function setDetailFilter(type) {
	detailFilter = type;
	render();
}

function onDetailSearchInput(val) {
	detailSearch = val;
	// Debounce re-render
	clearTimeout(window._detailSearchTimer);
	window._detailSearchTimer = setTimeout(function() { render(); }, 150);
}

// ── Render helpers ──────────────────────────────────────────────────────────────

function statCard(label, value, sub) {
	var h = '<div class="stat-card">';
	h += '<div class="stat-label">' + escapeHtml(label) + '</div>';
	h += '<div class="stat-value">' + value + '</div>';
	if (sub) h += '<div class="stat-sub">' + escapeHtml(sub) + '</div>';
	h += '</div>';
	return h;
}

function costProvider(api, data) {
	if (!data) return "";
	var h = '<div class="cost-provider">';
	h += '<div class="cost-provider-header">';
	h += '<span class="cost-provider-name">' + (API_LABELS[api] || api) + ' \\u00b7 ' + (API_MODELS[api] || "") + '</span>';
	h += '<span class="cost-provider-total cost-' + api + '">' + fmtUSD(data.cost_usd) + '</span>';
	h += '</div>';
	h += '<div class="cost-row"><span>calls</span><span class="cost-row-value">' + (data.calls || 0).toLocaleString() + '</span></div>';
	if (api === "voyage") {
		h += '<div class="cost-row"><span>tokens embedded</span><span class="cost-row-value">' + fmtTokens(data.tokens) + '</span></div>';
	} else {
		h += '<div class="cost-row"><span>input tokens</span><span class="cost-row-value">' + fmtTokens(data.prompt_tokens) + '</span></div>';
		if (data.cached_tokens !== undefined) {
			h += '<div class="cost-row"><span>cached tokens</span><span class="cost-row-value">' + fmtTokens(data.cached_tokens) + '</span></div>';
		}
		h += '<div class="cost-row"><span>output tokens</span><span class="cost-row-value">' + fmtTokens(data.completion_tokens) + '</span></div>';
	}
	h += '<div class="cost-footer">' + (API_PRICING[api] || "") + '</div>';
	h += '</div>';
	return h;
}

function tokenDetail(e) {
	if (e.api === "voyage") return fmtTokens(e.tokens) + " tokens";
	if (e.api === "xai") return fmtTokens(e.prompt_tokens) + " in \\u00b7 " + fmtTokens(e.cached_tokens) + " cached \\u00b7 " + fmtTokens(e.completion_tokens) + " out";
	return fmtTokens(e.prompt_tokens) + " in \\u00b7 " + fmtTokens(e.completion_tokens) + " out";
}

// ── Search handler ──────────────────────────────────────────────────────────────

window._searchQuery = "";

function handleSearch() {
	var input = document.getElementById("search-input");
	if (!input) return;
	window._searchQuery = input.value;
	doSearch(input.value);
}

// ── Initialize ──────────────────────────────────────────────────────────────────

fetchAll();

// Polls: stats+costs+memories every 10s, activity every 4s, re-render timestamps every 30s
setInterval(function() {
	Promise.all([fetchStats(), fetchCosts(), fetchMemories()]).then(function() {
		lastUpdated = new Date();
		if (currentView === "dashboard") render();
	});
}, 10000);

setInterval(function() {
	fetchActivity().then(function() {
		if (currentView === "dashboard") render();
	});
}, 4000);

setInterval(function() { render(); }, 30000);
</script>
</body>
</html>`;
}
