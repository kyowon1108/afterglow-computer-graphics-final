export class CommandStack {
  constructor(onChange) {
    this.stack = [];
    this.onChange = onChange;
  }

  snapshot(block) {
    return {
      id: block.id,
      state: block.state,
      cell: block.cell ? { ...block.cell } : null,
      colorKey: block.colorKey,
      holder: block.holder ?? null
    };
  }

  restore(block, snap) {
    block.state = snap.state;
    block.cell = snap.cell ? { ...snap.cell } : null;
    block.colorKey = snap.colorKey;
    block.holder = snap.holder;
  }

  push(block, before, after) {
    this.stack.push({ id: block.id, before, after });
  }

  undo(level) {
    const command = this.stack.pop();
    if (!command) return false;
    const block = level.blocks.find((b) => b.id === command.id);
    if (!block) return false;
    this.restore(block, command.before);
    this.onChange?.();
    return true;
  }

  clear() {
    this.stack.length = 0;
  }
}

