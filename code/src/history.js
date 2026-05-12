export class HistoryManager {
  constructor(limit = 100) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.group = null;
  }

  beginGroup(label) {
    if (this.group) return;
    this.group = {
      id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      commands: []
    };
  }

  endGroup() {
    if (!this.group) return;
    if (this.group.commands.length > 0) {
      this.push({
        id: this.group.id,
        type: "group",
        label: this.group.label,
        before: this.group.commands[0].before,
        after: this.group.commands[this.group.commands.length - 1].after,
        timestamp: new Date().toISOString(),
        groupId: this.group.id,
        commands: this.group.commands
      });
    }
    this.group = null;
  }

  track(command) {
    if (this.group) {
      this.group.commands.push(command);
      return;
    }
    this.push(command);
  }

  push(command) {
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo(applyState) {
    if (!this.canUndo()) return false;
    const cmd = this.undoStack.pop();
    applyState(cmd.before);
    this.redoStack.push(cmd);
    return true;
  }

  redo(applyState) {
    if (!this.canRedo()) return false;
    const cmd = this.redoStack.pop();
    applyState(cmd.after);
    this.undoStack.push(cmd);
    return true;
  }
}
