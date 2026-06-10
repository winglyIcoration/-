(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.CWWCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const ROLES = {
    WOLF: "人狼",
    VILLAGER: "村人",
    SEER: "占い師"
  };

  const TEMPLATES = [
    { topic: "動物", constraint: "サバンナにいる", hint: "生息地" },
    { topic: "食べ物", constraint: "朝ごはんで出やすい", hint: "食べる時間" },
    { topic: "乗り物", constraint: "空を移動できる", hint: "移動する場所" },
    { topic: "スポーツ", constraint: "ボールを使う", hint: "道具" },
    { topic: "家電", constraint: "キッチンで使う", hint: "使う場所" },
    { topic: "学校にあるもの", constraint: "先生がよく使う", hint: "使う人" },
    { topic: "職業", constraint: "夜に働くことがある", hint: "働く時間" },
    { topic: "場所", constraint: "入場料がかかることが多い", hint: "お金" },
    { topic: "ゲーム", constraint: "複数人で遊ぶ", hint: "人数" },
    { topic: "飲み物", constraint: "温かくして飲める", hint: "温度" },
    { topic: "道具", constraint: "切るために使う", hint: "用途" },
    { topic: "映画", constraint: "子どもと見やすい", hint: "対象年齢" }
  ];

  function defaultSettings() {
    return {
      playerCount: 4,
      wolfCount: 1,
      useSeer: false,
      discussionSeconds: 60,
      names: ["プレイヤー1", "プレイヤー2", "プレイヤー3", "プレイヤー4"],
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function maxWolfCount(settings) {
    const playerCount = Number(settings.playerCount) || 4;
    return Math.max(1, settings.useSeer ? playerCount - 2 : playerCount - 1);
  }

  function normalizeSettings(input) {
    const settings = { ...defaultSettings(), ...(input || {}) };
    settings.playerCount = clamp(Number(settings.playerCount) || 4, 3, 12);
    settings.useSeer = Boolean(settings.useSeer) && settings.playerCount >= 4;
    settings.wolfCount = clamp(Number(settings.wolfCount) || 1, 1, maxWolfCount(settings));
    settings.discussionSeconds = clamp(Number(settings.discussionSeconds) || 60, 15, 600);
    settings.names = Array.isArray(settings.names) ? settings.names.slice(0, settings.playerCount) : [];
    while (settings.names.length < settings.playerCount) {
      settings.names.push(`プレイヤー${settings.names.length + 1}`);
    }
    settings.names = settings.names.map((name, index) => String(name || "").trim() || `プレイヤー${index + 1}`);
    settings.topic = String(settings.topic || "").trim();
    settings.constraint = String(settings.constraint || "").trim();
    settings.hint = String(settings.hint || "").trim();
    return settings;
  }

  function validateSettings(input) {
    const settings = normalizeSettings(input);
    const errors = [];
    const normalizedNames = settings.names.map(normalizeText);
    const uniqueNames = new Set(normalizedNames);

    if (settings.playerCount < 3) errors.push("3人以上で開始してください。");
    if (uniqueNames.size !== settings.names.length) errors.push("同じ名前のプレイヤーがいます。");
    if (settings.wolfCount < 1 || settings.wolfCount > maxWolfCount(settings)) errors.push("人狼人数が多すぎます。");
    if (settings.useSeer && settings.playerCount < 4) errors.push("占い師を入れる場合は4人以上にしてください。");
    if (!settings.topic) errors.push("お題を入力してください。");
    if (!settings.constraint) errors.push("人狼の制約を入力してください。");
    if (settings.useSeer && !settings.hint) errors.push("占い師ヒントを入力してください。");

    return { ok: errors.length === 0, errors, settings };
  }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function assignRoles(settings, random = Math.random) {
    const roles = [];
    for (let index = 0; index < settings.wolfCount; index++) roles.push(ROLES.WOLF);
    if (settings.useSeer) roles.push(ROLES.SEER);
    while (roles.length < settings.playerCount) roles.push(ROLES.VILLAGER);
    return shuffle(roles, random);
  }

  function createGame(input, random = Math.random) {
    const validation = validateSettings(input);
    if (!validation.ok) {
      throw new Error(validation.errors.join("\n"));
    }

    const settings = validation.settings;
    const roles = assignRoles(settings, random);
    const players = settings.names.map((name, index) => ({
      id: `p${index + 1}`,
      name,
      role: roles[index],
      suspect: false
    }));

    return {
      version: 3,
      phase: "reveal",
      settings,
      players,
      revealIndex: 0,
      cardOpen: false,
      currentTurn: 1,
      timerLeft: settings.discussionSeconds,
      logs: [],
      vote: null,
      voteHistory: [],
      winner: "",
      reason: ""
    };
  }

  function activePlayers(state) {
    return state.players.filter(player => !player.suspect);
  }

  function suspectPlayers(state) {
    return state.players.filter(player => player.suspect);
  }

  function privateCard(state, playerId) {
    const player = state.players.find(item => item.id === playerId);
    if (!player) throw new Error("プレイヤーが見つかりません。");
    const card = {
      name: player.name,
      role: player.role,
      topic: state.settings.topic,
      infoLabel: "制約",
      info: "なし"
    };
    if (player.role === ROLES.WOLF) {
      card.infoLabel = "あなたの制約";
      card.info = state.settings.constraint;
    }
    if (player.role === ROLES.SEER) {
      card.infoLabel = "占い師ヒント";
      card.info = state.settings.hint;
    }
    return card;
  }

  function addLog(state, input) {
    if (state.phase !== "discussion") throw new Error("話し合い中だけ発言ログを追加できます。");
    const player = activePlayers(state).find(item => item.id === input.playerId);
    if (!player) throw new Error("発言者は投票対象に残っているプレイヤーから選んでください。");

    const word = String(input.word || "").trim();
    const normalized = normalizeText(word);
    if (!normalized) throw new Error("発言ワードを入力してください。");
    if (normalized === normalizeText(state.settings.topic)) throw new Error("お題そのものは発言できません。");
    if (normalized === normalizeText(state.settings.constraint)) throw new Error("制約そのものは発言できません。");
    if (state.logs.some(log => log.normalized === normalized)) throw new Error("その発言ワードはすでに使われています。");

    state.logs.push({
      id: `l${Date.now()}-${state.logs.length + 1}`,
      turn: state.currentTurn,
      playerId: player.id,
      playerName: player.name,
      word,
      normalized,
      time: input.time || ""
    });
    return state;
  }

  function undoLog(state) {
    if (!state.logs.length) throw new Error("取り消せる発言ログがありません。");
    state.logs.pop();
    return state;
  }

  function startDiscussion(state) {
    state.phase = "discussion";
    state.cardOpen = false;
    state.timerLeft = state.settings.discussionSeconds;
    return state;
  }

  function startVote(state, mode = "normal") {
    const finalMode = mode === "final";
    const suspects = suspectPlayers(state);
    const voters = finalMode && suspects.length ? suspects : activePlayers(state);
    const candidates = activePlayers(state);
    if (!voters.length) throw new Error("投票者がいません。");
    if (!candidates.length) throw new Error("投票対象がいません。");

    state.phase = finalMode ? "finalVote" : "vote";
    state.vote = {
      mode: finalMode ? "final" : "normal",
      voters: voters.map(player => player.id),
      candidates: candidates.map(player => player.id),
      index: 0,
      ballots: [],
      choicesOpen: false
    };
    return state;
  }

  function currentVoter(state) {
    if (!state.vote) return null;
    return state.players.find(player => player.id === state.vote.voters[state.vote.index]) || null;
  }

  function canSkipVote(state) {
    return state.vote && state.vote.mode === "normal" && state.currentTurn === 1;
  }

  function legalVoteTargets(state) {
    if (!state.vote) return [];
    const voter = currentVoter(state);
    const candidates = state.vote.candidates.filter(id => id !== voter?.id);
    const targets = candidates.length ? candidates : state.vote.candidates.slice();
    if (canSkipVote(state)) targets.push("skip");
    return targets;
  }

  function castVote(state, targetId) {
    if (!state.vote) throw new Error("投票が開始されていません。");
    const voter = currentVoter(state);
    if (!voter) throw new Error("現在の投票者が見つかりません。");
    if (!legalVoteTargets(state).includes(targetId)) throw new Error("その投票先は選べません。");

    state.vote.ballots.push({ voterId: voter.id, targetId });
    state.vote.index += 1;
    state.vote.choicesOpen = false;

    if (state.vote.index >= state.vote.voters.length) {
      resolveVote(state);
    }
    return state;
  }

  function resolveVote(state) {
    const vote = state.vote;
    if (!vote) throw new Error("解決する投票がありません。");

    const counts = {};
    vote.ballots.forEach(ballot => {
      counts[ballot.targetId] = (counts[ballot.targetId] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((left, right) => right[1] - left[1]);
    const topCount = sorted[0]?.[1] || 0;
    const topTargets = sorted.filter(([, count]) => count === topCount).map(([targetId]) => targetId);
    const tied = topTargets.length !== 1;
    const targetId = tied ? "tie" : topTargets[0];
    const target = state.players.find(player => player.id === targetId);

    state.voteHistory.push(createVoteHistory(state, vote, targetId, tied));
    state.vote = null;

    if (vote.mode === "final") {
      if (!tied && target?.role === ROLES.WOLF) {
        finishGame(state, "villager", "最終解決で人狼を告発できました。");
      } else {
        finishGame(state, "wolf", tied ? "最終解決で意見が割れました。" : "最終解決で人狼以外を告発しました。");
      }
      return state;
    }

    if (tied || targetId === "skip") {
      advanceAfterMiss(state, tied ? "投票が同数でした。" : "告発を見送りました。");
      return state;
    }

    if (target?.role === ROLES.WOLF) {
      finishGame(state, "villager", `${target.name}さんが人狼でした。`);
      return state;
    }

    if (target) target.suspect = true;
    advanceAfterMiss(state, `${target?.name || "投票先"}さんは人狼ではありませんでした。`);
    return state;
  }

  function createVoteHistory(state, vote, targetId, tied) {
    const result = tied
      ? "同数"
      : targetId === "skip"
        ? "告発なし"
        : playerName(state, targetId);

    return {
      turn: state.currentTurn,
      mode: vote.mode,
      result,
      ballots: vote.ballots.map(ballot => ({
        voterId: ballot.voterId,
        voterName: playerName(state, ballot.voterId),
        targetId: ballot.targetId,
        targetName: ballot.targetId === "skip" ? "告発なし" : playerName(state, ballot.targetId)
      }))
    };
  }

  function playerName(state, playerId) {
    return state.players.find(player => player.id === playerId)?.name || "不明";
  }

  function shouldEnterFinal(state) {
    const active = activePlayers(state);
    const activeWolves = active.filter(player => player.role === ROLES.WOLF).length;
    const villagerSideCount = state.players.filter(player => player.role !== ROLES.WOLF).length;
    const maxTurns = Math.max(1, villagerSideCount - 1);
    return state.currentTurn >= maxTurns || active.length <= activeWolves + 1;
  }

  function advanceAfterMiss(state, reason) {
    state.reason = reason;
    if (shouldEnterFinal(state)) {
      startVote(state, "final");
      return state;
    }
    state.currentTurn += 1;
    startDiscussion(state);
    return state;
  }

  function finishGame(state, winner, reason) {
    state.phase = "result";
    state.winner = winner;
    state.reason = reason;
    return state;
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  return {
    ROLES,
    TEMPLATES,
    defaultSettings,
    normalizeText,
    normalizeSettings,
    validateSettings,
    maxWolfCount,
    assignRoles,
    createGame,
    activePlayers,
    suspectPlayers,
    privateCard,
    addLog,
    undoLog,
    startDiscussion,
    startVote,
    currentVoter,
    canSkipVote,
    legalVoteTargets,
    castVote,
    cloneState
  };
});
