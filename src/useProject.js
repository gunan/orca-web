import { useCallback, useRef, useState } from 'react';
import { emptyProject } from '../shared/project.js';

export default function useProject() {
  const [state, setState] = useState({ past: [], present: emptyProject(), future: [] });
  const ref = useRef(state); ref.current = state;
  const update = useCallback((action, { history = true } = {}) => {
    setState(current => {
      const next = typeof action === 'function' ? action(current.present) : action;
      if (next === current.present) return current;
      return { past: history ? [...current.past.slice(-49), current.present] : current.past, present: next, future: history ? [] : current.future };
    });
  }, []);
  const undo = useCallback(() => setState(current => current.past.length ? { past: current.past.slice(0, -1), present: current.past.at(-1), future: [current.present, ...current.future] } : current), []);
  const redo = useCallback(() => setState(current => current.future.length ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) } : current), []);
  const replace = useCallback(next => setState({ past: [], present: next, future: [] }), []);
  return { project: state.present, update, undo, redo, replace, canUndo: !!state.past.length, canRedo: !!state.future.length, ref };
}
