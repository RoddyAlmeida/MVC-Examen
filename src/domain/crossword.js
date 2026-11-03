const { normalizeAnswer } = require("./questions");

function cleanWord(value) {
  return normalizeAnswer(value).toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function cellsFor(word, row, col, direction) {
  return [...word].map((letter, index) => ({
    row: row + (direction === "vertical" ? index : 0),
    col: col + (direction === "horizontal" ? index : 0),
    letter,
  }));
}

function candidateIsValid(candidateCells, occupied, direction) {
  let intersections = 0;
  for (const cell of candidateCells) {
    const existing = occupied.get(`${cell.row},${cell.col}`);
    if (existing && existing !== cell.letter) return 0;
    if (existing === cell.letter) {
      intersections += 1;
      continue;
    }
    const neighbors = direction === "horizontal"
      ? [[cell.row - 1, cell.col], [cell.row + 1, cell.col]]
      : [[cell.row, cell.col - 1], [cell.row, cell.col + 1]];
    if (neighbors.some(([row, col]) => occupied.has(`${row},${col}`))) return 0;
  }
  const first = candidateCells[0];
  const last = candidateCells[candidateCells.length - 1];
  const before = direction === "horizontal" ? [first.row, first.col - 1] : [first.row - 1, first.col];
  const after = direction === "horizontal" ? [last.row, last.col + 1] : [last.row + 1, last.col];
  if (occupied.has(`${before[0]},${before[1]}`) || occupied.has(`${after[0]},${after[1]}`)) return 0;
  return intersections;
}

function buildCrosswordLayout(entries) {
  const words = entries.map((entry) => ({ ...entry, word: cleanWord(entry.answer) }));
  const occupied = new Map();
  const placements = [];

  words.forEach((entry, wordIndex) => {
    let best = null;
    if (wordIndex === 0) {
      best = { row: 0, col: 0, direction: "horizontal", cells: cellsFor(entry.word, 0, 0, "horizontal") };
    } else {
      for (const placed of placements) {
        const direction = placed.direction === "horizontal" ? "vertical" : "horizontal";
        for (let placedIndex = 0; placedIndex < placed.word.length; placedIndex += 1) {
          for (let wordIndexInCandidate = 0; wordIndexInCandidate < entry.word.length; wordIndexInCandidate += 1) {
            if (placed.word[placedIndex] !== entry.word[wordIndexInCandidate]) continue;
            const anchor = placed.cells[placedIndex];
            const row = anchor.row - (direction === "vertical" ? wordIndexInCandidate : 0);
            const col = anchor.col - (direction === "horizontal" ? wordIndexInCandidate : 0);
            const candidateCells = cellsFor(entry.word, row, col, direction);
            const intersections = candidateIsValid(candidateCells, occupied, direction);
            if (intersections && (!best || intersections > best.intersections)) {
              best = { row, col, direction, cells: candidateCells, intersections };
            }
          }
        }
      }
      if (!best) {
        const maxRow = placements.reduce((maximum, placed) => Math.max(maximum, ...placed.cells.map((cell) => cell.row)), 0);
        const row = maxRow + 2;
        best = { row, col: 0, direction: "horizontal", cells: cellsFor(entry.word, row, 0, "horizontal") };
      }
    }

    best.word = entry.word;
    best.clue = entry.clue;
    best.index = wordIndex;
    placements.push(best);
    best.cells.forEach((cell) => occupied.set(`${cell.row},${cell.col}`, cell.letter));
  });

  const minRow = Math.min(...[...occupied.keys()].map((key) => Number(key.split(",")[0])));
  const minCol = Math.min(...[...occupied.keys()].map((key) => Number(key.split(",")[1])));
  const maxRow = Math.max(...[...occupied.keys()].map((key) => Number(key.split(",")[0])));
  const maxCol = Math.max(...[...occupied.keys()].map((key) => Number(key.split(",")[1])));
  const width = maxCol - minCol + 1;
  const height = maxRow - minRow + 1;
  const clueNumbers = new Map();

  for (const placement of placements) {
    placement.row -= minRow;
    placement.col -= minCol;
    placement.cells = placement.cells.map((cell) => ({ ...cell, row: cell.row - minRow, col: cell.col - minCol }));
    const key = `${placement.row},${placement.col}`;
    if (!clueNumbers.has(key)) clueNumbers.set(key, clueNumbers.size + 1);
    placement.number = clueNumbers.get(key);
  }

  const grid = Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) => {
    const key = `${row + minRow},${col + minCol}`;
    const active = occupied.has(key);
    return {
      row,
      col,
      active,
      number: clueNumbers.get(`${row},${col}`) || null,
    };
  }));

  return {
    grid,
    words: placements.map(({ clue, index, number, direction, row, col, cells, word }) => ({
      clue,
      index,
      number,
      direction,
      row,
      col,
      cells: cells.map(({ row: cellRow, col: cellCol }) => ({ row: cellRow, col: cellCol })),
      answer: word,
    })),
  };
}

module.exports = { buildCrosswordLayout, cleanWord };
