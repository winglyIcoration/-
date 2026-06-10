(() => {
  const Core = window.CWWCore;
  const STATE_KEY = "constraint-word-wolf-state-v3";
  const SETTINGS_KEY = "constraint-word-wolf-settings-v3";

  let settings = Core.defaultSettings();
  let state = null;
  let timerId = null;

  const $ = selector => document.querySelector(selector);

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    settings = loadSettings();
    bindEvents();
    renderHome();
    renderSetup();
  }

  function bindEvents() {
    $("#new-game-button").addEventListener("click", () => {
      clearSavedState();
      settings = loadSettings();
      renderSetup();
      showScreen("screen-setup");
    });

    $("#resume-button").addEventListener("click", () => {
      const saved = loadState();
      if (!saved) return showToast("再開できるゲームがありません。");
      state = saved;
      routeState();
    });

    document.body.addEventListener("click", event => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "home") {
        showScreen("screen-home");
        renderHome();
      }
      if (action === "home-clear") {
        stopTimer();
        clearSavedState();
        state = null;
        renderHome();
        showScreen("screen-home");
      }
      if (action === "players-down") adjustPlayers(-1);
      if (action === "players-up") adjustPlayers(1);
      if (action === "wolves-down") adjustWolves(-1);
      if (action === "wolves-up") adjustWolves(1);
    });

    $("#use-seer").addEventListener("change", () => {
      collectSettings();
      renderSetup();
    });
    $("#discussion-seconds").addEventListener("change", collectSettings);
    $("#template-button").addEventListener("click", pickTemplate);
    $("#start-game-button").addEventListener("click", startGame);
    $("#show-card-button").addEventListener("click", openCard);
    $("#next-card-button").addEventListener("click", nextCard);
    $("#discussion-button").addEventListener("click", beginDiscussion);
    $("#start-timer-button").addEventListener("click", startTimer);
    $("#pause-timer-button").addEventListener("click", stopTimer);
    $("#vote-button").addEventListener("click", () => {
      stopTimer();
      Core.startVote(state, "normal");
      saveState();
      renderVote();
      showScreen("screen-vote");
    });
    $("#add-log-button").addEventListener("click", addLog);
    $("#undo-log-button").addEventListener("click", undoLog);
    $("#open-vote-button").addEventListener("click", openVote);
    $("#restart-button").addEventListener("click", restartSamePlayers);
  }

  function showScreen(id) {
    hideToast();
    document.querySelectorAll(".screen").forEach(screen => {
      screen.classList.toggle("is-active", screen.id === id);
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function hideToast() {
    $("#toast").classList.remove("show");
  }

  function renderHome() {
    $("#resume-button").classList.toggle("hidden", !loadState());
  }

  function renderSetup() {
    settings = Core.normalizeSettings(settings);
    $("#player-count").textContent = settings.playerCount;
    $("#wolf-count").textContent = settings.wolfCount;
    $("#use-seer").checked = settings.useSeer;
    $("#discussion-seconds").value = String(settings.discussionSeconds);
    $("#topic").value = settings.topic;
    $("#constraint").value = settings.constraint;
    $("#seer-hint").value = settings.hint;

    const nameFields = $("#name-fields");
    nameFields.innerHTML = settings.names.map((name, index) => `
      <label class="name-field">
        <span class="number">${index + 1}</span>
        <input class="input" data-name-index="${index}" value="${escapeHtml(name)}" autocomplete="off" aria-label="プレイヤー${index + 1}">
      </label>
    `).join("");

    nameFields.querySelectorAll("[data-name-index]").forEach(input => {
      input.addEventListener("input", collectSettings);
    });
    saveSettings();
  }

  function collectSettings() {
    const names = Array.from(document.querySelectorAll("[data-name-index]")).map((input, index) => {
      return input.value.trim() || `プレイヤー${index + 1}`;
    });
    settings = Core.normalizeSettings({
      ...settings,
      names,
      useSeer: $("#use-seer").checked,
      discussionSeconds: Number($("#discussion-seconds").value),
      topic: $("#topic").value,
      constraint: $("#constraint").value,
      hint: $("#seer-hint").value
    });
    saveSettings();
  }

  function adjustPlayers(delta) {
    collectSettings();
    settings.playerCount = Math.max(3, Math.min(12, settings.playerCount + delta));
    settings = Core.normalizeSettings(settings);
    renderSetup();
  }

  function adjustWolves(delta) {
    collectSettings();
    settings.wolfCount = Math.max(1, Math.min(Core.maxWolfCount(settings), settings.wolfCount + delta));
    settings = Core.normalizeSettings(settings);
    renderSetup();
  }

  function pickTemplate() {
    const template = Core.TEMPLATES[Math.floor(Math.random() * Core.TEMPLATES.length)];
    settings = Core.normalizeSettings({ ...settings, ...template });
    renderSetup();
  }

  function startGame() {
    collectSettings();
    const validation = Core.validateSettings(settings);
    if (!validation.ok) {
      showToast(validation.errors.join("\n"));
      return;
    }
    try {
      state = Core.createGame(validation.settings);
      saveState();
      renderReveal();
      showScreen("screen-reveal");
    } catch (error) {
      showToast(error.message);
    }
  }

  function renderReveal() {
    const player = state.players[state.revealIndex];
    $("#reveal-progress").textContent = `${state.revealIndex + 1} / ${state.players.length}`;
    $("#reveal-name").textContent = `${player.name} さん`;
    $("#reveal-cover").classList.toggle("hidden", state.cardOpen);
    $("#private-card").classList.toggle("hidden", !state.cardOpen);
    $("#next-card-button").classList.toggle("hidden", !state.cardOpen || state.revealIndex >= state.players.length - 1);
    $("#discussion-button").classList.toggle("hidden", !state.cardOpen || state.revealIndex < state.players.length - 1);

    if (!state.cardOpen) return;
    const card = Core.privateCard(state, player.id);
    $("#card-topic").textContent = card.topic;
    $("#card-role").textContent = card.role;
    $("#card-role").className = `card-role ${roleClass(card.role)}`;
    $("#card-info").innerHTML = `<strong>${escapeHtml(card.infoLabel)}</strong><br>${escapeHtml(card.info)}`;
  }

  function openCard() {
    state.cardOpen = true;
    saveState();
    renderReveal();
  }

  function nextCard() {
    state.cardOpen = false;
    state.revealIndex += 1;
    saveState();
    renderReveal();
  }

  function beginDiscussion() {
    Core.startDiscussion(state);
    saveState();
    renderDiscussion();
    showScreen("screen-discussion");
  }

  function renderDiscussion() {
    $("#turn-title").textContent = `${state.currentTurn}ターン目`;
    const active = Core.activePlayers(state);
    $("#active-count").textContent = `投票対象 ${active.length}人`;

    $("#speaker").innerHTML = active.map(player => {
      return `<option value="${player.id}">${escapeHtml(player.name)}</option>`;
    }).join("");
    renderTimer();
    renderLogs("#word-log", state.logs);
    renderStatus();
    saveState();
  }

  function renderStatus() {
    $("#player-status").innerHTML = state.players.map(player => {
      const className = player.suspect ? "chip suspect" : "chip";
      const suffix = player.suspect ? " / 容疑者" : "";
      return `<span class="${className}">${escapeHtml(player.name)}${suffix}</span>`;
    }).join("");
  }

  function renderTimer() {
    const timer = $("#timer");
    timer.textContent = formatTime(state.timerLeft);
    timer.classList.toggle("warn", state.timerLeft <= 15 && state.timerLeft > 5);
    timer.classList.toggle("danger", state.timerLeft <= 5);
  }

  function startTimer() {
    if (!state || state.phase !== "discussion") return;
    stopTimer(false);
    timerId = window.setInterval(() => {
      state.timerLeft = Math.max(0, state.timerLeft - 1);
      renderTimer();
      saveState();
      if (state.timerLeft === 0) {
        stopTimer(false);
        Core.startVote(state, "normal");
        saveState();
        renderVote();
        showScreen("screen-vote");
      }
    }, 1000);
  }

  function stopTimer(render = true) {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
    if (render && state?.phase === "discussion") renderTimer();
  }

  function addLog() {
    try {
      Core.addLog(state, {
        playerId: $("#speaker").value,
        word: $("#spoken-word").value,
        time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
      });
      $("#spoken-word").value = "";
      renderDiscussion();
    } catch (error) {
      showToast(error.message);
    }
  }

  function undoLog() {
    try {
      Core.undoLog(state);
      renderDiscussion();
    } catch (error) {
      showToast(error.message);
    }
  }

  function renderVote() {
    const vote = state.vote;
    const voter = Core.currentVoter(state);
    const finalMode = vote.mode === "final";
    $("#vote-kind").textContent = finalMode ? "Final Vote" : "Vote";
    $("#vote-title").textContent = finalMode ? "最終解決" : "人狼投票";
    $("#vote-progress").textContent = `${vote.index + 1} / ${vote.voters.length}`;
    $("#voter-name").textContent = `${voter.name} さん`;
    $("#vote-cover").classList.toggle("hidden", vote.choicesOpen);
    $("#vote-box").classList.toggle("hidden", !vote.choicesOpen);

    if (!vote.choicesOpen) return;
    $("#vote-help").textContent = finalMode
      ? "容疑者チームの告発です。人狼だと思う生存者を選んでください。"
      : "自分以外で人狼だと思う人を選んでください。";

    const options = Core.legalVoteTargets(state).map(targetId => {
      if (targetId === "skip") {
        return `<button class="vote-option skip" data-vote-target="skip">今回は告発しない</button>`;
      }
      const player = state.players.find(item => item.id === targetId);
      return `<button class="vote-option" data-vote-target="${targetId}">${escapeHtml(player.name)} に投票</button>`;
    }).join("");

    $("#vote-options").innerHTML = options;
    $("#vote-options").querySelectorAll("[data-vote-target]").forEach(button => {
      button.addEventListener("click", () => submitVote(button.dataset.voteTarget));
    });
  }

  function openVote() {
    state.vote.choicesOpen = true;
    saveState();
    renderVote();
  }

  function submitVote(targetId) {
    try {
      Core.castVote(state, targetId);
      saveState();
      routeState();
    } catch (error) {
      showToast(error.message);
    }
  }

  function renderResult() {
    const villagerWin = state.winner === "villager";
    $("#winner-pill").textContent = villagerWin ? "村人勝利" : "人狼勝利";
    $("#winner-title").textContent = villagerWin ? "村人陣営の勝ち" : "人狼陣営の勝ち";
    $("#winner-title").className = villagerWin ? "role-villager" : "role-wolf";
    $("#result-reason").textContent = state.reason;
    $("#answer-topic").textContent = state.settings.topic;
    $("#answer-constraint").textContent = state.settings.constraint;
    $("#answer-hint-row").classList.toggle("hidden", !state.settings.useSeer);
    $("#answer-hint").textContent = state.settings.hint;

    $("#role-list").innerHTML = state.players.map(player => `
      <div class="result-item two-col">
        <strong>${escapeHtml(player.name)}</strong>
        <span class="${roleClass(player.role)}">${player.role}${player.suspect ? " / 容疑者" : ""}</span>
      </div>
    `).join("");

    $("#vote-history").innerHTML = state.voteHistory.length
      ? state.voteHistory.map(renderVoteHistory).join("")
      : `<div class="result-item">投票履歴はありません。</div>`;
    renderLogs("#result-log", state.logs);
  }

  function renderVoteHistory(history) {
    const title = history.mode === "final" ? "最終解決" : `${history.turn}ターン目`;
    const ballots = history.ballots.map(ballot => {
      return `${escapeHtml(ballot.voterName)} -> ${escapeHtml(ballot.targetName)}`;
    }).join("<br>");
    return `
      <div class="result-item">
        <strong>${title}: ${escapeHtml(history.result)}</strong>
        <span class="muted">${ballots}</span>
      </div>
    `;
  }

  function renderLogs(selector, logs) {
    const container = $(selector);
    if (!logs.length) {
      container.innerHTML = `<div class="result-item">まだ発言ログはありません。</div>`;
      return;
    }
    container.innerHTML = logs.map(log => `
      <div class="log-item">
        <strong>${escapeHtml(log.playerName)}</strong>
        <span>${escapeHtml(log.word)} <small class="muted">(${log.turn}T ${escapeHtml(log.time)})</small></span>
      </div>
    `).join("");
  }

  function routeState() {
    stopTimer(false);
    if (!state) {
      renderHome();
      showScreen("screen-home");
      return;
    }
    if (state.phase === "reveal") {
      renderReveal();
      showScreen("screen-reveal");
    } else if (state.phase === "discussion") {
      renderDiscussion();
      showScreen("screen-discussion");
    } else if (state.phase === "vote" || state.phase === "finalVote") {
      renderVote();
      showScreen("screen-vote");
    } else if (state.phase === "result") {
      renderResult();
      showScreen("screen-result");
    }
  }

  function restartSamePlayers() {
    settings = Core.normalizeSettings({
      ...state.settings,
      names: state.players.map(player => player.name),
      playerCount: state.players.length
    });
    clearSavedState();
    state = null;
    renderSetup();
    showScreen("screen-setup");
  }

  function roleClass(role) {
    if (role === Core.ROLES.WOLF) return "role-wolf";
    if (role === Core.ROLES.SEER) return "role-seer";
    return "role-villager";
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadSettings() {
    try {
      return Core.normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || Core.defaultSettings());
    } catch {
      return Core.defaultSettings();
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY));
      return saved?.version === 3 ? saved : null;
    } catch {
      return null;
    }
  }

  function saveState() {
    if (state) localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function clearSavedState() {
    localStorage.removeItem(STATE_KEY);
  }
})();
