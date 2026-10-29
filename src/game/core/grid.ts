/** Uniform spatial hash grid storing integer payloads. */
export interface Grid {
  cell: number;
  cols: number;
  offset: number;
  cells: Map<number, number[]>;
  recycledCells: number[][];
}

export function createGrid(cell: number, worldRadius: number): Grid {
  const offset = worldRadius + cell;
  return {
    cell,
    offset,
    cols: Math.ceil((offset * 2) / cell) + 1,
    cells: new Map(),
    recycledCells: [],
  };
}

export function clearGrid(g: Grid) {
  for (const cell of g.cells.values()) {
    cell.length = 0;
    g.recycledCells.push(cell);
  }
  g.cells.clear();
}

function key(g: Grid, cx: number, cy: number) {
  return cy * g.cols + cx;
}

export function gridInsert(g: Grid, x: number, y: number, value: number) {
  const cx = Math.floor((x + g.offset) / g.cell);
  const cy = Math.floor((y + g.offset) / g.cell);
  const k = key(g, cx, cy);
  let list = g.cells.get(k);
  if (!list) {
    list = g.recycledCells.pop() ?? [];
    g.cells.set(k, list);
  }
  list.push(value);
}

/** Calls fn for every payload in cells overlapping the circle. Return true from fn to stop early. */
export function gridQuery(
  g: Grid,
  x: number,
  y: number,
  radius: number,
  fn: (value: number) => boolean | void,
) {
  const x0 = Math.floor((x - radius + g.offset) / g.cell),
    x1 = Math.floor((x + radius + g.offset) / g.cell);
  const y0 = Math.floor((y - radius + g.offset) / g.cell),
    y1 = Math.floor((y + radius + g.offset) / g.cell);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const list = g.cells.get(key(g, cx, cy));
      if (!list) continue;
      for (let i = 0; i < list.length; i++) if (fn(list[i]!)) return;
    }
  }
}
