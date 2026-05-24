/* ═══════════════════════════════════════════════════════
   Handles: expand/collapse, topic checkboxes, progress
   tracking, GitHub Gist sync, settings modal.
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── localStorage keys ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'ai_learning_roadmap_progress';
const CONFIG_KEY  = 'ai_learning_roadmap_config';

// ── Phase definitions (used for per-phase progress chips) ─────────────────────
const PHASES = [
  { label: 'June', color: '#818cf8', weeks: [1,2,3,4]   },
  { label: 'July', color: '#a78bfa', weeks: [5,6,7,8]   },
  { label: 'Aug',  color: '#22d3ee', weeks: [9,10,11]   },
  { label: 'Sep',  color: '#34d399', weeks: [12,13,14]  },
  { label: 'Oct',  color: '#fbbf24', weeks: [15,16,17]  },
  { label: 'Nov',  color: '#f87171', weeks: [18,19,20]  },
];
const TOTAL_WEEKS = 20;

// ── Expand / collapse a week card ─────────────────────────────────────────────
function toggle(btn) {
  const card = btn.closest('.week-card');
  const body = card.querySelector('.week-body');
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  btn.textContent = isOpen ? 'EXPAND' : 'COLLAPSE';
}

// ── Progress data shape ───────────────────────────────────────────────────────
//   {
//     _lastUpdated: "ISO string",
//     1: { done: true,  topics: [true, false, true, true, true] },
//     2: { done: false, topics: [] },
//     ...
//   }
//
//   Legacy format (before subtopics were added):
//     data[n] = true | false
//   — handled transparently via normaliseWeek().

function normaliseWeek(raw) {
  const base = { done: false, topics: [], impl: false, resources: [], linkedin: false, github: false };
  if (raw === true || raw === false) return { ...base, done: !!raw };
  if (raw && typeof raw === 'object')  return { ...base, ...raw };
  return base;
}

// ── Auto-complete a week when every sub-task is checked ──────────────────────
// Mutates data[weekNum].done in place; caller must saveProgress() after.
function autoCompleteWeek(data, weekNum) {
  const card = document.querySelector(`.week-card[data-week="${weekNum}"]`);
  if (!card) return;
  const week = normaliseWeek(data[weekNum]);

  const nTopics    = card.querySelectorAll('.topic-list li').length;
  const nResources = card.querySelectorAll('.resource-link').length;
  const total = nTopics + nResources + 3; // +impl +linkedin +github

  const done =
    (week.topics    || []).filter(Boolean).length +
    (week.resources || []).filter(Boolean).length +
    (week.impl     ? 1 : 0) +
    (week.linkedin ? 1 : 0) +
    (week.github   ? 1 : 0);

  week.done = total > 0 && done >= total;
  data[weekNum] = week;
}

// ── Local persistence helpers ─────────────────────────────────────────────────
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveProgress(data) {
  data._lastUpdated = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Extract week number (1-20) from a card element
function getWeekNum(card) {
  return parseInt(card.querySelector('.week-num').textContent.replace('Week', '').trim(), 10);
}

// ── UI refresh — re-reads localStorage and updates every visual element ───────
function refreshUI() {
  const data = loadProgress();
  let totalDone    = 0;
  let totalSubtasks = 0;
  let doneSubtasks  = 0;

  document.querySelectorAll('.week-card').forEach(card => {
    const n       = getWeekNum(card);
    const week    = normaliseWeek(data[n]);
    const isDone  = week.done;

    // Week-level done state (auto-driven; no manual button)
    card.classList.toggle('done', isDone);
    if (isDone) totalDone++;
    const doneBadge = card.querySelector('.week-done-badge');
    if (doneBadge) doneBadge.style.display = isDone ? 'inline-flex' : 'none';

    // Tally subtasks for the overall progress bar
    const nTopics    = card.querySelectorAll('.topic-list li').length;
    const nResources = card.querySelectorAll('.resource-link').length;
    const weekTotal  = nTopics + nResources + 3; // +impl +linkedin +github
    const weekDone   =
      (week.topics    || []).filter(Boolean).length +
      (week.resources || []).filter(Boolean).length +
      (week.impl     ? 1 : 0) +
      (week.linkedin ? 1 : 0) +
      (week.github   ? 1 : 0);
    totalSubtasks += weekTotal;
    doneSubtasks  += weekDone;

    // Topic checkboxes within this card
    card.querySelectorAll('.topic-list li').forEach((li, idx) => {
      const input   = li.querySelector('.topic-checkbox');
      const checked = !!(week.topics && week.topics[idx]);
      if (input) input.checked = checked;
      li.classList.toggle('checked-topic', checked);
    });

    // Impl checkbox
    const implInput = card.querySelector('.impl-checkbox');
    if (implInput) {
      implInput.checked = !!week.impl;
      const implBox = card.querySelector('.impl-box');
      if (implBox) implBox.classList.toggle('impl-done', !!week.impl);
    }

    // Resource checkboxes
    card.querySelectorAll('.resource-link').forEach((res, idx) => {
      const resInput = res.querySelector('.resource-checkbox');
      const checked  = !!(week.resources && week.resources[idx]);
      if (resInput) resInput.checked = checked;
      res.classList.toggle('resource-done', checked);
    });

    // LinkedIn checkbox
    const liInput = card.querySelector('.li-checkbox');
    if (liInput) {
      liInput.checked = !!week.linkedin;
      const liItem = card.querySelector('.social-item.li');
      if (liItem) liItem.classList.toggle('social-done', !!week.linkedin);
    }

    // GitHub checkbox
    const ghInput = card.querySelector('.gh-checkbox');
    if (ghInput) {
      ghInput.checked = !!week.github;
      const ghItem = card.querySelector('.social-item.gh');
      if (ghItem) ghItem.classList.toggle('social-done', !!week.github);
    }

    // Per-week topic mini progress bar
    updateTopicProgress(card, n, week);
  });

  // Overall progress bar — subtask-based so it fills smoothly with each check
  const pct = totalSubtasks > 0 ? Math.round((doneSubtasks / totalSubtasks) * 100) : 0;
  document.getElementById('progress-bar-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent =
    `${doneSubtasks} / ${totalSubtasks} tasks · ${totalDone} weeks complete`;
  document.getElementById('progress-pct').textContent = pct + '%';

  // Per-phase chips
  const row = document.getElementById('phase-progress-row');
  row.innerHTML = '';
  PHASES.forEach(phase => {
    const phaseDone  = phase.weeks.filter(w => normaliseWeek(data[w]).done).length;
    const phaseTotal = phase.weeks.length;
    const pp = Math.round((phaseDone / phaseTotal) * 100);
    row.innerHTML += `
      <div class="phase-chip">
        <span class="phase-chip-label">${phase.label}</span>
        <div class="phase-chip-bar">
          <div class="phase-chip-fill" style="width:${pp}%;background:${phase.color}"></div>
        </div>
        <span class="phase-chip-count">${phaseDone}/${phaseTotal}</span>
      </div>`;
  });
}

// Update the small topic progress bar inside a single expanded week card
function updateTopicProgress(card, weekNum, week) {
  const el       = document.getElementById(`topic-progress-${weekNum}`);
  if (!el) return;
  const total    = card.querySelectorAll('.topic-list li').length;
  const done     = (week.topics || []).filter(Boolean).length;
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
  el.innerHTML   = `
    <div class="topic-progress-bar-wrap">
      <div class="topic-progress-bar" style="width:${pct}%"></div>
    </div>
    <span class="topic-progress-text">${done}/${total} topics</span>`;
}

// ── Toggle a single topic checkbox ───────────────────────────────────────────
function toggleTopic(weekNum, topicIdx) {
  const data = loadProgress();
  const week = normaliseWeek(data[weekNum]);
  while (week.topics.length <= topicIdx) week.topics.push(false);
  week.topics[topicIdx] = !week.topics[topicIdx];
  data[weekNum] = week;
  autoCompleteWeek(data, weekNum);
  saveProgress(data);
  refreshUI();
}

// ── Toggle a whole week as done / not done ────────────────────────────────────
function toggleWeekDone(weekNum) {
  const data = loadProgress();
  const week = normaliseWeek(data[weekNum]);
  week.done  = !week.done;
  data[weekNum] = week;
  saveProgress(data);
  refreshUI();
}

// ── Toggle implementation task ────────────────────────────────────────────────
function toggleImpl(weekNum) {
  const data = loadProgress();
  const week = normaliseWeek(data[weekNum]);
  week.impl = !week.impl;
  data[weekNum] = week;
  autoCompleteWeek(data, weekNum);
  saveProgress(data);
  refreshUI();
}

// ── Toggle a single resource checkbox ────────────────────────────────────────
function toggleResource(weekNum, resIdx) {
  const data = loadProgress();
  const week = normaliseWeek(data[weekNum]);
  while (week.resources.length <= resIdx) week.resources.push(false);
  week.resources[resIdx] = !week.resources[resIdx];
  data[weekNum] = week;
  autoCompleteWeek(data, weekNum);
  saveProgress(data);
  refreshUI();
}

// ── Toggle LinkedIn post ──────────────────────────────────────────────────────
function toggleLinkedin(weekNum) {
  const data = loadProgress();
  const week = normaliseWeek(data[weekNum]);
  week.linkedin = !week.linkedin;
  data[weekNum] = week;
  autoCompleteWeek(data, weekNum);
  saveProgress(data);
  refreshUI();
}

// ── Toggle GitHub task ────────────────────────────────────────────────────────
function toggleGithub(weekNum) {
  const data = loadProgress();
  const week = normaliseWeek(data[weekNum]);
  week.github = !week.github;
  data[weekNum] = week;
  autoCompleteWeek(data, weekNum);
  saveProgress(data);
  refreshUI();
}

// ── Sync status indicator ─────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  const el = document.getElementById('sync-status');
  el.textContent = msg;
  el.className   = 'sync-status' + (type ? ' ' + type : '');
}

// Disable / enable Save + Refresh while an API call is in flight
function setSyncBusy(busy) {
  ['btn-save', 'btn-refresh'].forEach(id => {
    document.getElementById(id).disabled = busy;
  });
}

// ── Config (GitHub PAT + repo details) ───────────────────────────────────────
function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; }
  catch { return {}; }
}

// ── Settings modal ────────────────────────────────────────────────────────────
function openSettings() {
  const cfg = loadConfig();
  document.getElementById('cfg-token').value  = cfg.token  || '';
  document.getElementById('cfg-owner').value  = cfg.owner  || '';
  document.getElementById('cfg-repo').value   = cfg.repo   || '';
  document.getElementById('cfg-path').value   = cfg.path   || 'progress.json';
  document.getElementById('cfg-branch').value = cfg.branch || 'main';
  document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
  document.getElementById('test-result').textContent = '';
}

// ── Test connection using the token currently typed in the modal ──────────────
async function testConnection() {
  const token = document.getElementById('cfg-token').value.trim();
  const owner = document.getElementById('cfg-owner').value.trim();
  const repo  = document.getElementById('cfg-repo').value.trim();
  const out   = document.getElementById('test-result');

  if (!token) { out.textContent = '✗ Enter a token first'; out.className = 'test-err'; return; }

  out.textContent = 'Testing…'; out.className = 'test-busy';

  // Step 1: validate the token itself via /user
  try {
    const uRes = await fetch('https://api.github.com/user', {
      headers: ghHeaders(token),
    });
    if (uRes.status === 401) {
      out.textContent = '✗ Token rejected (401) — it may be expired or invalid. Create a new one.';
      out.className = 'test-err'; return;
    }
    if (!uRes.ok) {
      out.textContent = `✗ Token error: HTTP ${uRes.status}`;
      out.className = 'test-err'; return;
    }
    const user = await uRes.json();

    // Step 2: validate repo access (only if owner+repo filled in)
    if (owner && repo) {
      const rRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: ghHeaders(token),
      });
      if (rRes.status === 404) {
        out.textContent = `✓ Token OK (${user.login}) but repo "${owner}/${repo}" not found — check spelling or create it.`;
        out.className = 'test-warn'; return;
      }
      if (rRes.status === 403) {
        out.textContent = `✓ Token OK (${user.login}) but no access to "${owner}/${repo}" — token needs "repo" scope.`;
        out.className = 'test-warn'; return;
      }
      if (!rRes.ok) {
        out.textContent = `✓ Token OK but repo check failed: HTTP ${rRes.status}`;
        out.className = 'test-warn'; return;
      }
      out.textContent = `✓ Token OK · repo "${owner}/${repo}" accessible`;
      out.className = 'test-ok';
    } else {
      out.textContent = `✓ Token OK — authenticated as ${user.login}`;
      out.className = 'test-ok';
    }
  } catch (e) {
    out.textContent = `✗ Network error: ${e.message}`;
    out.className = 'test-err';
  }
}

function saveSettings() {
  const cfg = {
    token:  document.getElementById('cfg-token').value.trim(),
    owner:  document.getElementById('cfg-owner').value.trim(),
    repo:   document.getElementById('cfg-repo').value.trim(),
    path:   document.getElementById('cfg-path').value.trim() || 'progress.json',
    branch: document.getElementById('cfg-branch').value.trim() || 'main',
  };
  // All three fields are mandatory
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    alert('Token, username, and repo are required.');
    return;
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  closeSettings();
  setStatus('Config saved', 'ok');
  setTimeout(() => setStatus(''), 3000);
}

// Close modal when clicking outside it
document.getElementById('settings-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSettings();
});

// ── GitHub Contents API helpers ───────────────────────────────────────────────
function ghHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept':        'application/vnd.github+json',
    'Content-Type':  'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// GET file metadata + base64 content (returns null for 404)
async function ghGetFile(cfg) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`;
  const res = await fetch(url, { headers: ghHeaders(cfg.token) });
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error('Token invalid or expired — open ⚙ Config → Test Connection to diagnose.');
  if (res.status === 403) throw new Error('Fine-grained token missing permission — go to GitHub → Settings → Fine-grained tokens → your token → Repository permissions → Contents → set to "Read and Write".');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// PUT (create or update) a file — returns the raw Response so callers can inspect status
async function ghPutFile(cfg, jsonContent, sha) {
  const url  = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
  const body = {
    message: `Update roadmap progress — ${new Date().toLocaleString()}`,
    content: btoa(unescape(encodeURIComponent(jsonContent))),
    branch:  cfg.branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method:  'PUT',
    headers: ghHeaders(cfg.token),
    body:    JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('Token invalid or expired.');
  if (res.status === 403) throw new Error('Fine-grained token missing "Contents: Read and Write" permission.');
  return res; // let caller handle 409 conflict
}

// ── Save progress → GitHub (retries once on SHA conflict) ────────────────────
async function saveToGitHub() {
  const cfg = loadConfig();
  if (!cfg.token || !cfg.owner || !cfg.repo) { openSettings(); return; }

  setStatus('Saving…', 'busy');
  setSyncBusy(true);
  try {
    const payload = JSON.stringify(loadProgress(), null, 2);

    for (let attempt = 1; attempt <= 3; attempt++) {
      const existing = await ghGetFile(cfg);   // always fetch fresh SHA
      const sha      = existing ? existing.sha : undefined;
      const res      = await ghPutFile(cfg, payload, sha);

      if (res.status === 409) {
        // SHA mismatch — file changed between our GET and PUT; retry with fresher SHA
        if (attempt < 3) continue;
        throw new Error('SHA conflict after 3 attempts — try Refresh first, then Save.');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      setStatus(`✓ Saved ${new Date().toLocaleTimeString()}`, 'ok');
      return; // success — exit loop
    }
  } catch (e) {
    setStatus(`✗ ${e.message}`, 'err');
  } finally {
    setSyncBusy(false);
  }
}

// ── Load progress ← GitHub ───────────────────────────────────────────────────
async function loadFromGitHub() {
  const cfg = loadConfig();
  if (!cfg.token || !cfg.owner || !cfg.repo) { openSettings(); return; }

  setStatus('Refreshing…', 'busy');
  setSyncBusy(true);
  try {
    const file = await ghGetFile(cfg);
    if (!file) {
      setStatus('No file found in repo yet — save first.', 'err');
      return;
    }
    // Decode UTF-8 content from base64
    const raw  = decodeURIComponent(escape(atob(file.content)));
    const data = JSON.parse(raw);
    saveProgress(data);
    refreshUI();
    setStatus(`✓ Loaded ${new Date().toLocaleTimeString()}`, 'ok');
  } catch (e) {
    setStatus(`✗ ${e.message}`, 'err');
  } finally {
    setSyncBusy(false);
  }
}

// ── Reset all local progress ──────────────────────────────────────────────────
function resetProgress() {
  if (!confirm('Reset all local progress? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEY);
  refreshUI();
  setStatus('Progress reset', '');
  setTimeout(() => setStatus(''), 3000);
}

// ── Initialise on DOM ready ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  document.querySelectorAll('.week-card').forEach(card => {
    const n = getWeekNum(card);

    // Store week number as data attribute for easy lookup
    card.dataset.week = n;

    // ── Inject auto-complete badge into the theme bar ────────────────────────
    const badge       = document.createElement('span');
    badge.className   = 'week-done-badge';
    badge.textContent = '✓ DONE';
    badge.style.display = 'none';
    card.querySelector('.week-theme-bar').appendChild(badge);

    // ── Inject checkboxes into each topic list item ──────────────────────────
    // Topics section is the first .detail-block → .topic-list inside .week-body
    const topicList = card.querySelector('.topic-list');
    if (topicList) {
      topicList.querySelectorAll('li').forEach((li, idx) => {
        li.dataset.topicIdx = idx;

        // Capture the existing text before we replace the node's content
        const text = li.textContent.trim();
        li.textContent = '';

        // Build: <label class="topic-check">
        //          <input type="checkbox" class="topic-checkbox">
        //          <span class="check-box">✓</span>
        //        </label>
        //        <span class="topic-text">…original text…</span>
        const label    = document.createElement('label');
        label.className = 'topic-check';
        label.title    = 'Mark topic as done';

        const input    = document.createElement('input');
        input.type     = 'checkbox';
        input.className = 'topic-checkbox';
        input.id       = `topic-${n}-${idx}`;
        // Change event triggers progress save + UI refresh
        input.addEventListener('change', () => toggleTopic(n, idx));

        const box      = document.createElement('span');
        box.className  = 'check-box';
        box.textContent = '✓'; // tick shown via CSS when checked

        label.appendChild(input);
        label.appendChild(box);

        const textSpan    = document.createElement('span');
        textSpan.className = 'topic-text';
        textSpan.textContent = text;

        li.appendChild(label);
        li.appendChild(textSpan);
      });

      // ── Append per-week topic mini progress bar after the topic list ───────
      const topicsBlock = topicList.closest('.detail-block');
      if (topicsBlock) {
        const progressDiv    = document.createElement('div');
        progressDiv.className = 'topic-progress';
        progressDiv.id       = `topic-progress-${n}`;
        topicsBlock.appendChild(progressDiv);
      }
    }

    // ── Inject checkbox into impl-box (Build This) ───────────────────────────
    const implBox = card.querySelector('.impl-box');
    if (implBox) {
      const row       = document.createElement('div');
      row.className   = 'impl-check-row';
      const label     = document.createElement('label');
      label.className = 'subtask-check impl-check-label';
      label.title     = 'Mark implementation task as built';
      const input     = document.createElement('input');
      input.type      = 'checkbox';
      input.className = 'impl-checkbox subtask-checkbox';
      input.addEventListener('change', () => toggleImpl(n));
      const box       = document.createElement('span');
      box.className   = 'check-box';
      box.textContent = '✓';
      const text      = document.createElement('span');
      text.className  = 'subtask-label';
      text.textContent = 'Mark as built';
      label.appendChild(input);
      label.appendChild(box);
      label.appendChild(text);
      row.appendChild(label);
      implBox.after(row);
    }

    // ── Inject checkboxes into resource links ────────────────────────────────
    card.querySelectorAll('.resource-link').forEach((res, idx) => {
      const label     = document.createElement('label');
      label.className = 'subtask-check resource-check-label';
      label.title     = 'Mark resource as done';
      const input     = document.createElement('input');
      input.type      = 'checkbox';
      input.className = 'resource-checkbox subtask-checkbox';
      input.addEventListener('change', () => toggleResource(n, idx));
      const box       = document.createElement('span');
      box.className   = 'check-box';
      box.textContent = '✓';
      label.appendChild(input);
      label.appendChild(box);
      res.appendChild(label);
    });

    // ── Inject checkboxes into LinkedIn + GitHub social items ────────────────
    const liItem = card.querySelector('.social-item.li');
    if (liItem) {
      const label     = document.createElement('label');
      label.className = 'subtask-check social-check-label';
      label.title     = 'Mark LinkedIn post as published';
      const input     = document.createElement('input');
      input.type      = 'checkbox';
      input.className = 'li-checkbox subtask-checkbox';
      input.addEventListener('change', () => toggleLinkedin(n));
      const box       = document.createElement('span');
      box.className   = 'check-box';
      box.textContent = '✓';
      label.appendChild(input);
      label.appendChild(box);
      liItem.appendChild(label);
    }

    const ghItem = card.querySelector('.social-item.gh');
    if (ghItem) {
      const label     = document.createElement('label');
      label.className = 'subtask-check social-check-label';
      label.title     = 'Mark GitHub task as done';
      const input     = document.createElement('input');
      input.type      = 'checkbox';
      input.className = 'gh-checkbox subtask-checkbox';
      input.addEventListener('change', () => toggleGithub(n));
      const box       = document.createElement('span');
      box.className   = 'check-box';
      box.textContent = '✓';
      label.appendChild(input);
      label.appendChild(box);
      ghItem.appendChild(label);
    }
  });

  // Apply saved state to all injected controls
  refreshUI();
});
