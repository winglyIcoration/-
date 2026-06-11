(() => {
  const Core = window.CWWCore;
  let Room = null;
  let mode = "";
  let roomCode = "";
  let room = null;
  let unsubscribe = null;
  let hostDraftSettings = null;
  let busy = false;

  const $ = selector => document.querySelector(selector);

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    Room = await waitForRoomApi();
    bindStaticEvents();
    renderConfigState();
    setInterval(tick, 500);
    const query = new URLSearchParams(location.search);
    const code = query.get("room");
    if (code) $("#join-code").value = code.toUpperCase();
  }

  function waitForRoomApi() {
    if (window.CWWRoom) return Promise.resolve(window.CWWRoom);
    return new Promise(resolve => {
      window.addEventListener("cww-room-ready", () => resolve(window.CWWRoom), { once: true });
    });
  }

  function bindStaticEvents() {
    $("#create-room-button").addEventListener("click", createHostRoom);
    $("#join-room-button").addEventListener("click", joinRoom);
    document.body.addEventListener("click", event => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action === "leave") leaveRoom();
    });
  }

  function renderConfigState() {
    const warning = $("#config-warning");
    const disabled = !Room.configured;
    $("#create-room-button").disabled = disabled;
    $("#join-room-button").disabled = disabled;
    warning.classList.toggle("hidden", !disabled);
    if (disabled) {
      warning.innerHTML = `
        <strong>Firebase設定が未投入です。</strong><br>
        GitHub Pagesで部屋コード同期を使うには、<code>firebase-config.js</code> に Firebase Web config を設定してください。
      `;
    }
  }

  async function createHostRoom() {
    await run(async () => {
      await Room.ready();
      const hostId = Room.userId;
      const code = await generateRoomCode();
      const initial = Core.createRoom(code, hostId);
      await Room.createRoom(initial);
      mode = "host";
      roomCode = code;
      subscribe(code);
      history.replaceState(null, "", `?room=${code}`);
      showScreen("screen-host");
    });
  }

  async function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 12; attempt++) {
      let code = "";
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      if (!await Room.getRoom(code)) return code;
    }
    throw new Error("部屋コードの作成に失敗しました。もう一度試してください。");
  }

  async function joinRoom() {
    const code = $("#join-code").value.trim().toUpperCase();
    const name = $("#join-name").value.trim();
    if (!/^[A-Z0-9]{4}$/.test(code)) return showToast("4文字の部屋コードを入力してください。");
    if (!name) return showToast("名前を入力してください。");

    await run(async () => {
      await Room.ready();
      const exists = await Room.getRoom(code);
      if (!exists) throw new Error("部屋が見つかりません。コードを確認してください。");
      await Room.mutateRoom(code, state => {
        if (state.phase !== Core.PHASES.LOBBY) throw new Error("この部屋はすでに開始しています。");
        const duplicate = Core.activeRoster(state.players).some(player => {
          return player.id !== Room.userId && Core.normalizeText(player.name) === Core.normalizeText(name);
        });
        if (duplicate) throw new Error("同じ名前の参加者がいます。別名にしてください。");
        return Core.addOrUpdatePlayer(state, Room.userId, name);
      });
      mode = "player";
      roomCode = code;
      subscribe(code);
      history.replaceState(null, "", `?room=${code}`);
      showScreen("screen-player");
    });
  }

  function subscribe(code) {
    if (unsubscribe) unsubscribe();
    unsubscribe = Room.subscribe(code, next => {
      if (!next) {
        showToast("部屋が見つからなくなりました。");
        leaveRoom(false);
        return;
      }
      room = next;
      renderRoom();
    }, error => showToast(error.message));
  }

  function leaveRoom(clearUrl = true) {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    mode = "";
    roomCode = "";
    room = null;
    hostDraftSettings = null;
    if (clearUrl) history.replaceState(null, "", location.pathname);
    showScreen("screen-home");
  }

  function renderRoom() {
    if (!room) return;
    if (mode === "host") renderHost();
    if (mode === "player") renderPlayer();
  }

  function renderHost() {
    $("#host-room-code").textContent = room.roomCode;
    if (room.phase === Core.PHASES.LOBBY && !hostDraftSettings) {
      hostDraftSettings = Core.normalizeSettings(room.settings);
    }
    renderHostSetup();
    renderHostPlayers();
    renderHostParticipant();
    renderHostPhase();
    renderLogs("#host-log");
  }

  function renderHostPlayers() {
    const roster = Core.activeRoster(room.players);
    const visibleRoster = room.phase === Core.PHASES.LOBBY
      ? roster.filter(player => player.id !== room.hostId)
      : roster;
    const players = visibleRoster.map(player => ({
      name: player.name,
      role: room.phase === Core.PHASES.RESULT ? player.role : "",
      suspect: player.suspect
    }));
    if (room.phase === Core.PHASES.LOBBY && hostDraftSettings?.hostParticipates) {
      players.unshift({
        name: hostDraftSettings.hostName || "マスター",
        role: "参加予定",
        suspect: false
      });
    }
    $("#host-player-list").innerHTML = players.map(player => {
      const role = player.role ? ` / ${player.role}` : "";
      const suspect = player.suspect ? " / 容疑者" : "";
      return `<span class="chip ${player.suspect ? "suspect" : ""}">${escapeHtml(player.name)}${escapeHtml(role)}${suspect}</span>`;
    }).join("") || `<span class="muted">まだ参加者がいません。</span>`;
  }

  function renderHostSetup() {
    const panel = $("#host-setup-panel");
    if (room.phase !== Core.PHASES.LOBBY) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    const settings = hostDraftSettings || Core.normalizeSettings(room.settings);
    panel.innerHTML = `
      <h2>ゲーム設定</h2>
      <div class="form-grid">
        <label class="field-label">人狼人数
          <input id="host-wolves" class="input" type="number" min="1" max="6" value="${settings.wolfCount}">
        </label>
        <label class="field-label">最大週数
          <input id="host-max-weeks" class="input" type="number" min="1" max="10" value="${settings.maxWeeks}">
        </label>
        <label class="field-label">伏せ入力秒数
          <input id="host-input-seconds" class="input" type="number" min="10" max="180" value="${settings.inputSeconds}">
        </label>
        <label class="field-label">話し合い秒数
          <select id="host-discussion-seconds" class="input">
            ${[0, 60, 120, 180, 300].map(sec => `<option value="${sec}" ${settings.discussionSeconds === sec ? "selected" : ""}>${sec ? `${sec}秒` : "制限なし"}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="check-row">
        <span><strong>占い師を入れる</strong><small>ヒントは1〜3文字推奨です。</small></span>
        <input id="host-use-seer" type="checkbox" ${settings.useSeer ? "checked" : ""}>
      </label>
      <label class="check-row">
        <span><strong>マスターも参加する</strong><small>この端末で伏せ入力・開示・投票を行います。</small></span>
        <input id="host-participates" type="checkbox" ${settings.hostParticipates ? "checked" : ""}>
      </label>
      <div id="host-name-row" class="${settings.hostParticipates ? "" : "hidden"}">
        <label class="field-label">マスターの参加名
          <input id="host-name" class="input" maxlength="16" value="${escapeHtml(settings.hostName)}">
        </label>
      </div>
      <label class="check-row">
        <span><strong>お任せ(AI生成)</strong><small>通信なしのローカル生成。設定画面には結果まで非公開です。</small></span>
        <input id="host-auto-topic" type="checkbox" ${settings.autoTopic ? "checked" : ""}>
      </label>
      <div id="manual-topic-fields" class="${settings.autoTopic ? "hidden" : ""}">
        <label class="field-label">お題
          <input id="host-topic" class="input" value="${escapeHtml(settings.topic)}">
        </label>
        <label class="field-label">人狼の制約
          <input id="host-constraint" class="input" value="${escapeHtml(settings.constraint)}">
        </label>
        <label class="field-label">占い師ヒント
          <input id="host-hint" class="input" maxlength="8" value="${escapeHtml(settings.hint)}">
        </label>
      </div>
      ${settings.autoTopic ? `<div class="notice soft">お題・制約・ヒントはゲーム開始時に自動生成され、各参加者のカードにだけ表示されます。</div>` : ""}
      <div class="button-row">
        <button id="host-template" class="button secondary" ${settings.autoTopic ? "disabled" : ""}>手動候補</button>
        <button id="host-start" class="button primary">ゲーム開始</button>
      </div>
    `;
    panel.querySelectorAll("input, select").forEach(input => input.addEventListener("input", collectHostDraft));
    $("#host-participates").addEventListener("change", () => {
      collectHostDraft();
      renderHostSetup();
    });
    $("#host-auto-topic").addEventListener("change", () => {
      collectHostDraft();
      renderHostSetup();
    });
    $("#host-template").addEventListener("click", () => {
      const item = Core.TEMPLATES[Math.floor(Math.random() * Core.TEMPLATES.length)];
      hostDraftSettings = Core.normalizeSettings({ ...collectHostDraft(false), ...item });
      renderHostSetup();
    });
    $("#host-start").addEventListener("click", hostStartGame);
  }

  function collectHostDraft(save = true) {
    const settings = Core.normalizeSettings({
      wolfCount: Number($("#host-wolves")?.value || 1),
      maxWeeks: Number($("#host-max-weeks")?.value || 3),
      inputSeconds: Number($("#host-input-seconds")?.value || 30),
      discussionSeconds: Number($("#host-discussion-seconds")?.value || 0),
      useSeer: Boolean($("#host-use-seer")?.checked),
      hostParticipates: Boolean($("#host-participates")?.checked),
      hostName: $("#host-name")?.value || "マスター",
      autoTopic: Boolean($("#host-auto-topic")?.checked),
      topic: $("#host-topic")?.value || "",
      constraint: $("#host-constraint")?.value || "",
      hint: $("#host-hint")?.value || ""
    });
    if (save) hostDraftSettings = settings;
    return settings;
  }

  async function hostStartGame() {
    await run(async () => {
      const draft = collectHostDraft();
      await Room.mutateRoom(roomCode, state => {
        state.settings = draft;
        if (draft.hostParticipates) {
          Core.addOrUpdatePlayer(state, state.hostId, draft.hostName);
        } else {
          delete state.players[state.hostId];
        }
        Core.assignRoles(state);
        return Core.startWeek(state);
      });
    });
  }

  function renderHostParticipant() {
    const panel = $("#host-participant-panel");
    const card = $("#host-player-card");
    const me = room.players[Room.userId];
    const playing = Boolean(me && me.active !== false && room.phase !== Core.PHASES.LOBBY);
    panel.classList.toggle("hidden", !playing);
    if (!playing) {
      card.classList.add("hidden");
      return;
    }
    renderPrivateCard(me, "#host-player-card");
    renderParticipantPhase(panel, me, "host");
  }

  function renderHostPhase() {
    const panel = $("#host-phase-panel");
    const living = Core.livingPlayers(room);
    const suspects = Core.suspectPlayers(room);
    if (room.phase === Core.PHASES.LOBBY) {
      panel.innerHTML = `<h2>待機中</h2><p class="muted">参加者が部屋コードを入力して入室するのを待っています。</p>`;
      return;
    }
    if (room.phase === Core.PHASES.INPUT) {
      panel.innerHTML = `
        <h2>${room.week}週目: 伏せ入力</h2>
        <div class="countdown" data-countdown="${room.inputEndsAt}"></div>
        <p class="muted">送信済み ${Object.keys(room.submissions || {}).length} / ${living.length}</p>
        <button id="force-reveal" class="button primary full">開示フェーズへ</button>
      `;
      $("#force-reveal").addEventListener("click", () => advanceToReveal(true));
      return;
    }
    if (room.phase === Core.PHASES.REVEAL) {
      const current = Core.currentRevealPlayer(room);
      panel.innerHTML = `<h2>順番開示</h2><p>現在の開示順: <strong>${escapeHtml(current?.name || "完了")}</strong></p>`;
      return;
    }
    if (room.phase === Core.PHASES.SUSPECT_TALK) {
      panel.innerHTML = `
        <h2>容疑者のログなし発言</h2>
        <p class="muted">容疑者: ${suspects.map(player => escapeHtml(player.name)).join(", ")}</p>
        <button id="start-discussion" class="button primary full">話し合いへ</button>
      `;
      $("#start-discussion").addEventListener("click", () => mutate(state => Core.startDiscussion(state)));
      return;
    }
    if (room.phase === Core.PHASES.DISCUSSION) {
      panel.innerHTML = `
        <h2>話し合い</h2>
        ${room.discussionEndsAt ? `<div class="countdown" data-countdown="${room.discussionEndsAt}"></div>` : `<p class="muted">制限時間なし</p>`}
        <div class="button-row">
          <button id="start-vote" class="button warn">通常投票へ</button>
          <button id="start-final" class="button secondary">最終解決へ</button>
        </div>
      `;
      $("#start-vote").addEventListener("click", () => mutate(state => Core.startVote(state, false)));
      $("#start-final").addEventListener("click", () => mutate(state => Core.startVote(state, true)));
      return;
    }
    if (room.phase === Core.PHASES.VOTE || room.phase === Core.PHASES.FINAL_VOTE) {
      const voters = Core.voteVoters(room);
      panel.innerHTML = `
        <h2>${room.phase === Core.PHASES.FINAL_VOTE ? "最終解決" : "通常投票"}</h2>
        <p class="muted">投票済み ${Object.keys(room.votes || {}).length} / ${voters.length}</p>
      `;
      return;
    }
    if (room.phase === Core.PHASES.RESULT) {
      panel.innerHTML = `
        <h2>結果</h2>
        <p class="${room.winner === "villager" ? "role-villager" : "role-wolf"}">${room.winner === "villager" ? "村人陣営の勝ち" : "人狼陣営の勝ち"}</p>
        <p>${escapeHtml(room.reason)}</p>
        <div class="answer-list compact-list">
          <div><dt>お題</dt><dd>${escapeHtml(room.settings.topic)}</dd></div>
          <div><dt>制約</dt><dd>${escapeHtml(room.settings.constraint)}</dd></div>
          ${room.settings.useSeer ? `<div><dt>ヒント</dt><dd>${escapeHtml(room.settings.hint)}</dd></div>` : ""}
        </div>
        <button id="back-lobby" class="button primary full">同じ部屋で新規ゲーム</button>
      `;
      $("#back-lobby").addEventListener("click", () => mutate(state => {
        state.phase = Core.PHASES.LOBBY;
        state.week = 0;
        state.submissions = {};
        state.logs = [];
        state.votes = {};
        state.voteHistory = [];
        state.winner = "";
        state.reason = "";
        Object.values(state.players).forEach(player => {
          player.role = "";
          player.suspect = false;
        });
        return state;
      }));
    }
  }

  function renderPlayer() {
    const me = room.players[Room.userId];
    $("#player-title").textContent = me ? `${me.name} さん` : "参加者画面";
    renderPrivateCard(me, "#player-card");
    renderPlayerPhase(me);
    renderPlayers("#player-list", false);
    renderLogs("#player-log");
  }

  function renderPrivateCard(me, selector) {
    const card = $(selector);
    if (!me || !me.role || room.phase === Core.PHASES.LOBBY || room.phase === Core.PHASES.RESULT) {
      card.classList.add("hidden");
      return;
    }
    const privateCard = Core.privateCard(room, me.id);
    card.classList.remove("hidden");
    card.innerHTML = `
      <p class="card-label">お題</p>
      <strong class="card-topic">${escapeHtml(privateCard.topic)}</strong>
      <div class="card-divider"></div>
      <p class="card-label">役職</p>
      <strong class="card-role ${roleClass(privateCard.role)}">${escapeHtml(privateCard.role)}</strong>
      <div class="card-info"><strong>${escapeHtml(privateCard.label)}</strong><br>${escapeHtml(privateCard.value)}</div>
    `;
  }

  function renderPlayerPhase(me) {
    renderParticipantPhase($("#player-phase-panel"), me, "player");
  }

  function renderParticipantPhase(panel, me, prefix) {
    if (!me) {
      panel.innerHTML = `<h2>入室情報がありません</h2><p class="muted">トップに戻って入り直してください。</p>`;
      return;
    }
    if (room.phase === Core.PHASES.LOBBY) {
      panel.innerHTML = `<h2>待機中</h2><p class="muted">マスターがゲームを開始するまで待ってください。</p>`;
      return;
    }
    if (room.phase === Core.PHASES.INPUT) {
      if (me.suspect) {
        panel.innerHTML = `<h2>${room.week}週目: 伏せ入力</h2><p class="muted">あなたは容疑者です。伏せ入力はできません。</p>`;
        return;
      }
      const submitted = room.submissions?.[me.id];
      const inputId = `${prefix}-hidden-word`;
      const buttonId = `${prefix}-submit-word`;
      panel.innerHTML = `
        <h2>${room.week}週目: 伏せ入力</h2>
        <div class="countdown" data-countdown="${room.inputEndsAt}"></div>
        ${submitted ? `<p class="success-text">送信済み: ${escapeHtml(submitted.word)}</p>` : `
          <label class="field-label">伏せワード
            <input id="${inputId}" class="input" autocomplete="off" placeholder="お題に沿ったワード">
          </label>
          <button id="${buttonId}" class="button primary full">伏せて送信</button>
        `}
      `;
      if (!submitted) panel.querySelector(`#${buttonId}`).addEventListener("click", () => submitWord(inputId));
      return;
    }
    if (room.phase === Core.PHASES.REVEAL) {
      const current = Core.currentRevealPlayer(room);
      if (current?.id === me.id) {
        const word = room.submissions?.[me.id]?.word || "";
        const buttonId = `${prefix}-reveal-word`;
        panel.innerHTML = `
          <h2>あなたの開示順です</h2>
          <p class="muted">ボタンを押したら、公開されたワードを声に出して読んでください。</p>
          <button id="${buttonId}" class="button primary full">「${escapeHtml(word)}」を明らかにする</button>
        `;
        panel.querySelector(`#${buttonId}`).addEventListener("click", () => mutate(state => Core.revealCurrentWord(state, me.id)));
      } else {
        panel.innerHTML = `<h2>順番開示</h2><p>現在の開示順: <strong>${escapeHtml(current?.name || "完了")}</strong></p>`;
      }
      return;
    }
    if (room.phase === Core.PHASES.SUSPECT_TALK) {
      panel.innerHTML = me.suspect
        ? `<h2>ログなし発言</h2><p class="muted">声だけで発言できます。人狼を揺さぶるトラップを仕掛けられます。</p>`
        : `<h2>容疑者の発言中</h2><p class="muted">ログには残りません。よく聞いてください。</p>`;
      return;
    }
    if (room.phase === Core.PHASES.DISCUSSION) {
      panel.innerHTML = `<h2>話し合い</h2>${room.discussionEndsAt ? `<div class="countdown" data-countdown="${room.discussionEndsAt}"></div>` : `<p class="muted">制限時間なし。マスターが投票へ進めます。</p>`}`;
      return;
    }
    if (room.phase === Core.PHASES.VOTE || room.phase === Core.PHASES.FINAL_VOTE) {
      renderPlayerVote(panel, me);
      return;
    }
    if (room.phase === Core.PHASES.RESULT) {
      panel.innerHTML = renderResult();
    }
  }

  function renderPlayerVote(panel, me) {
    const voters = Core.voteVoters(room);
    const voted = room.votes?.[me.id];
    if (!voters.some(player => player.id === me.id)) {
      panel.innerHTML = `<h2>${room.phase === Core.PHASES.FINAL_VOTE ? "最終解決" : "通常投票"}</h2><p class="muted">あなたにはこの投票の投票権がありません。</p>`;
      return;
    }
    if (voted) {
      panel.innerHTML = `<h2>投票済み</h2><p class="muted">全員の投票を待っています。</p>`;
      return;
    }
    const candidates = Core.voteCandidates(room).filter(player => room.phase === Core.PHASES.FINAL_VOTE || player.id !== me.id);
    panel.innerHTML = `
      <h2>${room.phase === Core.PHASES.FINAL_VOTE ? "最終解決" : "通常投票"}</h2>
      <div class="vote-options">
        ${candidates.map(player => `<button class="vote-option" data-target="${player.id}">${escapeHtml(player.name)} に投票</button>`).join("")}
      </div>
    `;
    panel.querySelectorAll("[data-target]").forEach(button => {
      button.addEventListener("click", () => mutate(state => Core.castVote(state, me.id, button.dataset.target)));
    });
  }

  async function submitWord(inputId) {
    const input = document.getElementById(inputId);
    const word = input.value.trim();
    await run(async () => {
      await Room.mutateRoom(roomCode, state => Core.submitHiddenWord(state, Room.userId, word));
    });
  }

  async function advanceToReveal(fillMissing) {
    await mutate(state => {
      if (fillMissing) fillMissingWords(state);
      return Core.startReveal(state);
    });
  }

  function fillMissingWords(state) {
    Core.livingPlayers(state).forEach(player => {
      if (!state.submissions[player.id]) {
        state.submissions[player.id] = {
          playerId: player.id,
          word: "（未入力）",
          normalized: `__missing_${state.week}_${player.id}`,
          submittedAt: Date.now(),
          revealed: false
        };
      }
    });
  }

  async function tick() {
    renderCountdowns();
    if (!room || mode !== "host" || busy) return;
    if (room.phase === Core.PHASES.INPUT && (Date.now() >= room.inputEndsAt || Core.allLivingSubmitted(room))) {
      await advanceToReveal(Date.now() >= room.inputEndsAt);
    }
    if ((room.phase === Core.PHASES.VOTE || room.phase === Core.PHASES.FINAL_VOTE) && Core.allVotesSubmitted(room)) {
      await mutate(state => Core.resolveVotes(state));
    }
    if (room.phase === Core.PHASES.DISCUSSION && room.discussionEndsAt && Date.now() >= room.discussionEndsAt) {
      await mutate(state => Core.startVote(state, false));
    }
  }

  function renderCountdowns() {
    document.querySelectorAll("[data-countdown]").forEach(el => {
      const end = Number(el.dataset.countdown);
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      el.textContent = `${left}秒`;
      el.classList.toggle("danger", left <= 5);
    });
  }

  async function mutate(mutator) {
    await run(async () => {
      await Room.mutateRoom(roomCode, mutator);
    });
  }

  async function run(task) {
    if (busy) return;
    busy = true;
    try {
      await task();
    } catch (error) {
      showToast(error.message || String(error));
    } finally {
      busy = false;
    }
  }

  function renderPlayers(selector, revealRoles) {
    const result = room.phase === Core.PHASES.RESULT;
    $(selector).innerHTML = Core.activeRoster(room.players).map(player => {
      const role = (revealRoles && result) ? ` / ${player.role}` : "";
      const suspect = player.suspect ? " / 容疑者" : "";
      return `<span class="chip ${player.suspect ? "suspect" : ""}">${escapeHtml(player.name)}${escapeHtml(role)}${suspect}</span>`;
    }).join("") || `<span class="muted">まだ参加者がいません。</span>`;
  }

  function renderLogs(selector) {
    const logs = room.logs || [];
    $(selector).innerHTML = logs.length ? logs.map(log => `
      <div class="log-item">
        <strong>${log.week}週目 / ${escapeHtml(log.playerName)}</strong>
        <span>${escapeHtml(log.word)}</span>
      </div>
    `).join("") : `<div class="result-item">公開ログはまだありません。</div>`;
  }

  function renderResult() {
    const villagerWin = room.winner === "villager";
    return `
      <h2 class="${villagerWin ? "role-villager" : "role-wolf"}">${villagerWin ? "村人陣営の勝ち" : "人狼陣営の勝ち"}</h2>
      <p>${escapeHtml(room.reason)}</p>
      <div class="answer-list compact-list">
        <div><dt>お題</dt><dd>${escapeHtml(room.settings.topic)}</dd></div>
        <div><dt>制約</dt><dd>${escapeHtml(room.settings.constraint)}</dd></div>
        ${room.settings.useSeer ? `<div><dt>ヒント</dt><dd>${escapeHtml(room.settings.hint)}</dd></div>` : ""}
      </div>
      <div class="result-list">
        ${Core.activeRoster(room.players).map(player => `<div class="result-item two-col"><strong>${escapeHtml(player.name)}</strong><span class="${roleClass(player.role)}">${player.role}${player.suspect ? " / 容疑者" : ""}</span></div>`).join("")}
      </div>
    `;
  }

  function showScreen(id) {
    hideToast();
    document.querySelectorAll(".screen").forEach(screen => screen.classList.toggle("is-active", screen.id === id));
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

  function roleClass(role) {
    if (role === Core.ROLES.WOLF) return "role-wolf";
    if (role === Core.ROLES.SEER) return "role-seer";
    return "role-villager";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
