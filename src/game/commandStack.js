export class CommandStack {
  constructor(onChange) {
    this.stack = [];
    this.onChange = onChange;
  }

  snapshot(target) {
    if (target && Object.hasOwn(target, "normalYaw")) {
      return {
        id: target.id,
        normalYaw: target.normalYaw
      };
    }
    return {
      id: target.id,
      state: target.state,
      cell: target.cell ? { ...target.cell } : null,
      colorKey: target.colorKey,
      emitDir: target.emitDir,
      coneDeg: target.coneDeg,
      kind: target.kind,
      holder: target.holder ?? null
    };
  }

  restore(target, snap) {
    if (Object.hasOwn(snap, "normalYaw")) {
      target.normalYaw = snap.normalYaw;
      return;
    }
    target.state = snap.state;
    target.cell = snap.cell ? { ...snap.cell } : null;
    target.colorKey = snap.colorKey;
    target.emitDir = snap.emitDir;
    target.coneDeg = snap.coneDeg;
    target.kind = snap.kind;
    target.holder = snap.holder;
  }

  push(target, before, after) {
    const targetType = Object.hasOwn(before, "normalYaw") ? "mirror" : "block";
    this.stack.push({ id: target.id, targetType, before, after });
  }

  undo(level) {
    const command = this.stack.pop();
    if (!command) return false;
    const target =
      command.targetType === "mirror"
        ? level.mirrors?.find((mirror) => mirror.id === command.id)
        : level.blocks.find((block) => block.id === command.id);
    if (!target) return false;
    this.restore(target, command.before);
    this.onChange?.();
    return true;
  }

  clear() {
    this.stack.length = 0;
  }
}
