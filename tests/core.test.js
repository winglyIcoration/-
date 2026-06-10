const assert = require("node:assert/strict");
const Core = require("../game-core");

function makeSettings(extra = {}) {
  return Core.normalizeSettings({
    playerCount: 4,
    wolfCount: 1,
    useSeer: true,
    discussionSeconds: 30,
    names: ["A", "B", "C", "D"],
    topic: "動物",
    constraint: "サバンナにいる",
    hint: "生息地",
    ...extra
  });
}

function makeGameWithRoles(roles) {
  const state = Core.createGame(makeSettings({ playerCount: roles.length, names: roles.map((_, i) => `P${i + 1}`), useSeer: false }), () => 0);
  state.players.forEach((player, index) => {
    player.role = roles[index];
  });
  Core.startDiscussion(state);
  return state;
}

{
  const validation = Core.validateSettings(makeSettings({ names: ["A", "A", "C", "D"] }));
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /同じ名前/);
}

{
  const state = Core.createGame(makeSettings(), () => 0);
  const roles = state.players.map(player => player.role);
  assert.equal(roles.filter(role => role === Core.ROLES.WOLF).length, 1);
  assert.equal(roles.filter(role => role === Core.ROLES.SEER).length, 1);
}

{
  const state = makeGameWithRoles([Core.ROLES.WOLF, Core.ROLES.VILLAGER, Core.ROLES.VILLAGER]);
  Core.addLog(state, { playerId: "p2", word: "ライオン", time: "10:00" });
  assert.throws(() => Core.addLog(state, { playerId: "p3", word: " ライオン ", time: "10:01" }), /すでに使われています/);
  assert.throws(() => Core.addLog(state, { playerId: "p3", word: "動物", time: "10:01" }), /お題そのもの/);
}

{
  const state = makeGameWithRoles([Core.ROLES.WOLF, Core.ROLES.VILLAGER, Core.ROLES.VILLAGER]);
  Core.startVote(state, "normal");
  Core.castVote(state, "p2");
  Core.castVote(state, "p1");
  Core.castVote(state, "p1");
  assert.equal(state.phase, "result");
  assert.equal(state.winner, "villager");
}

{
  const state = makeGameWithRoles([Core.ROLES.WOLF, Core.ROLES.VILLAGER, Core.ROLES.VILLAGER, Core.ROLES.VILLAGER]);
  Core.startVote(state, "normal");
  Core.castVote(state, "p2");
  Core.castVote(state, "p3");
  Core.castVote(state, "p2");
  Core.castVote(state, "p2");
  assert.equal(state.players.find(player => player.id === "p2").suspect, true);
  assert.equal(["discussion", "finalVote"].includes(state.phase), true);
}

{
  const state = makeGameWithRoles([Core.ROLES.WOLF, Core.ROLES.VILLAGER, Core.ROLES.VILLAGER]);
  state.players.find(player => player.id === "p2").suspect = true;
  Core.startVote(state, "final");
  Core.castVote(state, "p1");
  assert.equal(state.phase, "result");
  assert.equal(state.winner, "villager");
}

console.log("core tests ok");
