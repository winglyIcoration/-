(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CWWCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const ROLES = {
    WOLF: "人狼",
    VILLAGER: "村人",
    SEER: "占い師"
  };

  const PHASES = {
    LOBBY: "lobby",
    INPUT: "input",
    REVEAL: "reveal",
    SUSPECT_TALK: "suspectTalk",
    DISCUSSION: "discussion",
    VOTE: "vote",
    FINAL_VOTE: "finalVote",
    RESULT: "result"
  };

  const TEMPLATES = [
    { topic: "動物", constraint: "サバンナにいる", hint: "生息地" },
    { topic: "食べ物", constraint: "朝ごはんで出やすい", hint: "時間" },
    { topic: "乗り物", constraint: "空を移動できる", hint: "場所" },
    { topic: "スポーツ", constraint: "ボールを使う", hint: "道具" },
    { topic: "家電", constraint: "キッチンで使う", hint: "場所" },
    { topic: "職業", constraint: "夜に働くことがある", hint: "時間" },
    { topic: "場所", constraint: "入場料がかかることが多い", hint: "料金" },
    { topic: "飲み物", constraint: "温かくして飲める", hint: "温度" }
  ];

  function defaultSettings() {
    return {
      wolfCount: 1,
      useSeer: false,
      inputSeconds: 30,
      discussionSeconds: 0,
      maxWeeks: 3,
      topic: "動物",
      constraint: "サバンナにいる",
      hint: "生息地"
    };
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function normalizeSettings(input) {
    const settings = { ...defaultSettings(), ...(input || {}) };
    settings.wolfCount = clamp(Number(settings.wolfCount) || 1, 1, 6);
    settings.useSeer = Boolean(settings.useSeer);
    settings.inputSeconds = clamp(Number(settings.inputSeconds) || 30, 10, 180);
    settings.discussionSeconds = clamp(Number(settings.discussionSeconds) || 0, 0, 600);
    settings.maxWeeks = clamp(Number(settings.maxWeeks) || 3, 1, 10);
    settings.topic = String(settings.topic || "").trim();
    settings.constraint = String(settings.constraint || "").trim();
    settings.hint = String(settings.hint || "").trim();
    return settings;
  }

  function validateStart(settingsInput, playersInput) {
    const settings = normalizeSettings(settingsInput);
    const players = activeRoster(playersInput);
    const errors = [];
    const names = players.map(player => normalizeText(player.name));

    if (players.length < 3) errors.push("3人以上の参加者が必要です。");
    if (new Set(names).size !== names.length) errors.push("同じ名前の参加者がいます。");
    if (settings.wolfCount >= players.length) errors.push("人狼人数は参加者数未満にしてください。");
    if (settings.useSeer && players.length < 4) errors.push("占い師を入れる場合は4人以上必要です。");
    if (settings.useSeer && players.length - settings.wolfCount < 2) errors.push("占い師を入れるには村人陣営の枠が足りません。");
    if (!settings.topic) errors.push("お題を入力してください。");
    if (!settings.constraint) errors.push("人狼の制約を入力してください。");
    if (settings.useSeer && !settings.hint) errors.push("占い師ヒントを入力してください。");

    return { ok: errors.length === 0, errors, settings, players };
  }

  function createRoom(roomCode, hostId) {
    return {
      version: 4,
      roomCode,
      hostId,
      phase: PHASES.LOBBY,
      settings: defaultSettings(),
      players: {},
      week: 0,
      inputEndsAt: null,
      discussionEndsAt: null,
      submissions: {},
      revealOrder: [],
      revealIndex: 0,
      logs: [],
      votes: {},
      voteHistory: [],
      winner: "",
      reason: "",
      updatedAt: Date.now()
    };
  }

  function addOrUpdatePlayer(state, playerId, name) {
    state.players[playerId] = {
      id: playerId,
      name: String(name || "").trim(),
      role: state.players[playerId]?.role || "",
      suspect: Boolean(state.players[playerId]?.suspect),
      joinedAt: state.players[playerId]?.joinedAt || Date.now(),
      active: true
    };
    state.updatedAt = Date.now();
    return state;
  }

  function activeRoster(playersMap) {
    return Object.values(playersMap || {}).filter(player => player && player.active !== false);
  }

  function livingPlayers(state) {
    return activeRoster(state.players).filter(player => !player.suspect);
  }

  function suspectPlayers(state) {
    return activeRoster(state.players).filter(player => player.suspect);
  }

  function usedWordsBeforeWeek(state, week = state.week) {
    return new Set((state.logs || []).filter(log => log.week < week).map(log => log.normalized));
  }

  function assignRoles(state, random = Math.random) {
    const validation = validateStart(state.settings, state.players);
    if (!validation.ok) throw new Error(validation.errors.join("\n"));

    const roles = [];
    for (let index = 0; index < validation.settings.wolfCount; index++) roles.push(ROLES.WOLF);
    if (validation.settings.useSeer) roles.push(ROLES.SEER);
    while (roles.length < validation.players.length) roles.push(ROLES.VILLAGER);

    shuffle(roles, random).forEach((role, index) => {
      state.players[validation.players[index].id].role = role;
      state.players[validation.players[index].id].suspect = false;
    });
    state.settings = validation.settings;
    state.week = 0;
    state.logs = [];
    state.voteHistory = [];
    state.winner = "";
    state.reason = "";
    return state;
  }

  function startWeek(state, now = Date.now()) {
    state.week += 1;
    state.phase = PHASES.INPUT;
    state.inputEndsAt = now + state.settings.inputSeconds * 1000;
    state.discussionEndsAt = null;
    state.submissions = {};
    state.revealOrder = livingPlayers(state).map(player => player.id);
    state.revealIndex = 0;
    state.votes = {};
    state.updatedAt = now;
    return state;
  }

  function submitHiddenWord(state, playerId, word, now = Date.now()) {
    if (state.phase !== PHASES.INPUT) throw new Error("伏せ入力の時間ではありません。");
    const player = state.players[playerId];
    if (!player || player.suspect) throw new Error("容疑者は伏せ入力できません。");
    if (!livingPlayers(state).some(item => item.id === playerId)) throw new Error("生存者だけが伏せ入力できます。");
    const normalized = normalizeText(word);
    if (!normalized) throw new Error("ワードを入力してください。");
    if (normalized === normalizeText(state.settings.topic)) throw new Error("お題そのものは入力できません。");
    if (normalized === normalizeText(state.settings.constraint)) throw new Error("制約そのものは入力できません。");
    if (usedWordsBeforeWeek(state).has(normalized)) throw new Error("過去週で公開済みのワードは使えません。");

    state.submissions[playerId] = {
      playerId,
      word: String(word).trim(),
      normalized,
      submittedAt: now,
      revealed: false
    };
    state.updatedAt = now;
    return state;
  }

  function allLivingSubmitted(state) {
    return livingPlayers(state).every(player => state.submissions[player.id]);
  }

  function startReveal(state, now = Date.now()) {
    if (state.phase !== PHASES.INPUT) throw new Error("伏せ入力後だけ開示できます。");
    const missing = livingPlayers(state).filter(player => !state.submissions[player.id]);
    if (missing.length) throw new Error(`未送信: ${missing.map(player => player.name).join(", ")}`);
    state.phase = PHASES.REVEAL;
    state.revealOrder = livingPlayers(state).map(player => player.id);
    state.revealIndex = 0;
    state.updatedAt = now;
    return state;
  }

  function currentRevealPlayer(state) {
    if (state.phase !== PHASES.REVEAL) return null;
    const id = state.revealOrder[state.revealIndex];
    return state.players[id] || null;
  }

  function revealCurrentWord(state, playerId, now = Date.now()) {
    const current = currentRevealPlayer(state);
    if (!current || current.id !== playerId) throw new Error("今はあなたの開示順ではありません。");
    const submission = state.submissions[playerId];
    if (!submission) throw new Error("伏せ入力が見つかりません。");

    submission.revealed = true;
    state.logs.push({
      id: `w${state.week}-${state.logs.length + 1}`,
      week: state.week,
      playerId,
      playerName: current.name,
      word: submission.word,
      normalized: submission.normalized,
      revealedAt: now
    });
    state.revealIndex += 1;

    if (state.revealIndex >= state.revealOrder.length) {
      state.phase = suspectPlayers(state).length ? PHASES.SUSPECT_TALK : PHASES.DISCUSSION;
    }
    state.updatedAt = now;
    return state;
  }

  function startDiscussion(state, now = Date.now()) {
    state.phase = PHASES.DISCUSSION;
    state.discussionEndsAt = state.settings.discussionSeconds
      ? now + state.settings.discussionSeconds * 1000
      : null;
    state.votes = {};
    state.updatedAt = now;
    return state;
  }

  function startVote(state, final = false, now = Date.now()) {
    if (final) {
      const suspects = suspectPlayers(state);
      if (!suspects.length) return finishGame(state, "wolf", "解答権を持つ容疑者がいないため、人狼陣営の勝ちです。", now);
      state.phase = PHASES.FINAL_VOTE;
    } else {
      state.phase = PHASES.VOTE;
    }
    state.votes = {};
    state.updatedAt = now;
    return state;
  }

  function voteVoters(state) {
    if (state.phase === PHASES.FINAL_VOTE) return suspectPlayers(state);
    if (state.phase === PHASES.VOTE) return livingPlayers(state);
    return [];
  }

  function voteCandidates(state) {
    if (state.phase === PHASES.FINAL_VOTE || state.phase === PHASES.VOTE) return livingPlayers(state);
    return [];
  }

  function castVote(state, voterId, targetId, now = Date.now()) {
    const voters = voteVoters(state);
    const candidates = voteCandidates(state);
    if (!voters.some(player => player.id === voterId)) throw new Error("投票権がありません。");
    if (!candidates.some(player => player.id === targetId)) throw new Error("投票先が不正です。");
    if (state.phase === PHASES.VOTE && voterId === targetId && candidates.length > 1) throw new Error("通常投票では自分に投票できません。");
    state.votes[voterId] = targetId;
    state.updatedAt = now;
    return state;
  }

  function allVotesSubmitted(state) {
    const voters = voteVoters(state);
    return voters.length > 0 && voters.every(player => state.votes[player.id]);
  }

  function resolveVotes(state, now = Date.now()) {
    if (![PHASES.VOTE, PHASES.FINAL_VOTE].includes(state.phase)) throw new Error("投票中ではありません。");
    if (!allVotesSubmitted(state)) throw new Error("未投票の参加者がいます。");

    const final = state.phase === PHASES.FINAL_VOTE;
    const counts = {};
    Object.values(state.votes).forEach(targetId => {
      counts[targetId] = (counts[targetId] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const topCount = sorted[0][1];
    const top = sorted.filter(([, count]) => count === topCount).map(([id]) => id);
    const tied = top.length !== 1;
    const targetId = tied ? "" : top[0];
    const target = state.players[targetId];

    state.voteHistory.push({
      week: state.week,
      final,
      result: tied ? "同数" : target.name,
      votes: Object.entries(state.votes).map(([voterId, votedId]) => ({
        voterId,
        voterName: state.players[voterId]?.name || "不明",
        targetId: votedId,
        targetName: state.players[votedId]?.name || "不明"
      }))
    });

    if (final) {
      if (!tied && target.role === ROLES.WOLF) return finishGame(state, "villager", "最終解決で人狼を告発できました。", now);
      return finishGame(state, "wolf", tied ? "最終解決で意見が割れました。" : "最終解決で人狼以外を告発しました。", now);
    }

    if (!tied && target.role === ROLES.WOLF) {
      return finishGame(state, "villager", `${target.name}さんが人狼でした。`, now);
    }
    if (!tied) target.suspect = true;

    if (shouldForceFinal(state)) return startVote(state, true, now);
    return startWeek(state, now);
  }

  function shouldForceFinal(state) {
    const living = livingPlayers(state);
    const livingWolves = living.filter(player => player.role === ROLES.WOLF).length;
    return state.week >= state.settings.maxWeeks || living.length <= livingWolves + 1;
  }

  function finishGame(state, winner, reason, now = Date.now()) {
    state.phase = PHASES.RESULT;
    state.winner = winner;
    state.reason = reason;
    state.updatedAt = now;
    return state;
  }

  function privateCard(state, playerId) {
    const player = state.players[playerId];
    if (!player) return null;
    const card = { topic: state.settings.topic, role: player.role, label: "制約", value: "なし" };
    if (player.role === ROLES.WOLF) {
      card.label = "あなたの制約";
      card.value = state.settings.constraint;
    }
    if (player.role === ROLES.SEER) {
      card.label = "占い師ヒント";
      card.value = state.settings.hint;
    }
    return card;
  }

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function shuffle(values, random) {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }

  return {
    ROLES,
    PHASES,
    TEMPLATES,
    defaultSettings,
    normalizeText,
    normalizeSettings,
    validateStart,
    createRoom,
    addOrUpdatePlayer,
    activeRoster,
    livingPlayers,
    suspectPlayers,
    usedWordsBeforeWeek,
    assignRoles,
    startWeek,
    submitHiddenWord,
    allLivingSubmitted,
    startReveal,
    currentRevealPlayer,
    revealCurrentWord,
    startDiscussion,
    startVote,
    voteVoters,
    voteCandidates,
    castVote,
    allVotesSubmitted,
    resolveVotes,
    shouldForceFinal,
    privateCard,
    clone
  };
});
