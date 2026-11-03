const { assertPort, contracts } = require("../ports");
const { leaderboardRows } = require("../domain/leaderboard");

function createLeaderboard({ data }) {
  assertPort("leaderboard", data, contracts.leaderboard);
  async function getExamLeaderboard(exam) {
    const results = await data.listEligibleResults(exam);
    return leaderboardRows(results);
  }

  return { getExamLeaderboard, leaderboardRows };
}

module.exports = { createLeaderboard };
