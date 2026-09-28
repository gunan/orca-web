/** Process-wide importer scheduling covers HTTP imports as well as raw jobs.
 * A queued entry owns no native process or temporary directory. */
export function createPrusaImportQueue({maxPending=4}={}) {
  if (!Number.isInteger(maxPending) || maxPending < 0 || maxPending > 4) throw new Error('Invalid Prusa queue bound');
  let active = false;
  const pending = [];
  const cancelled = () => new Error('Native Prusa import cancelled while queued');
  const expired = () => new Error('Native Prusa import timed out while queued');
  function drain() {
    if (active || !pending.length) return;
    const entry = pending.shift();
    entry.cleanup();
    if (entry.signal?.aborted || entry.deadline <= Date.now()) {
      entry.reject(entry.signal?.aborted ? cancelled() : expired());
      drain();
      return;
    }
    active = true;
    Promise.resolve().then(entry.task).then(entry.resolve, entry.reject).finally(() => { active = false; drain(); });
  }
  return {
    run(task, {signal,deadline}={}) {
      if (typeof task !== 'function' || !Number.isFinite(deadline)) return Promise.reject(new Error('Prusa import requires one finite deadline'));
      if (signal?.aborted) return Promise.reject(cancelled());
      if (deadline <= Date.now()) return Promise.reject(expired());
      if (active && pending.length >= maxPending) return Promise.reject(new Error('Native Prusa import queue is full (one active, four waiting)'));
      return new Promise((resolve,reject) => {
        let timer;
        const remove = error => {
          const index = pending.indexOf(entry);
          if (index < 0) return;
          pending.splice(index,1); entry.cleanup(); reject(error);
        };
        const abort = () => remove(cancelled());
        const entry = {task,resolve,reject,signal,deadline,cleanup() { clearTimeout(timer); signal?.removeEventListener('abort',abort); }};
        pending.push(entry);
        signal?.addEventListener('abort',abort,{once:true});
        timer = setTimeout(() => remove(expired()), Math.max(1,deadline-Date.now()));
        timer.unref?.();
        drain();
      });
    },
    get state() { return {active:Number(active),pending:pending.length}; }
  };
}
export const prusaImportQueue = createPrusaImportQueue();
