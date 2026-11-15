// Undo/redo stacks for the block editor. Snapshots are plain values (the editor stores page.blocks as JSON text).
export function createHistory(limit = 200) {
  let past = [], future = [];
  return {
    /** Remember `prev`, the state before a change. A new change makes redo impossible. */
    record(prev) {
      past.push(prev);
      if (past.length > limit) past.shift();
      future = [];
    },
    /** Returns the state to go back to, given the `current` state, or null. */
    undo(current) {
      if (!past.length) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(current);
      return future.pop();
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear() { past = []; future = []; },
  };
}
