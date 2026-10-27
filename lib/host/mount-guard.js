// Mount-once coordination across overlapping plugin HMR generations.



export const MOUNTED = Symbol.for("dsh-web.mounted-plugins");
export const WAITERS = Symbol.for("dsh-web.mounted-plugins.waiters");

export function mountedSet() {
  const existing = globalThis[MOUNTED];
  if (existing instanceof Set) return existing;
  const created = new Set();
  globalThis[MOUNTED] = created;
  return created;
}

export function mountWaiters() {
  return (globalThis[WAITERS] ??= new Map());
}

export function mountOnce(packageName, fn) {
  const mount = (...args) => {
    const mounted = mountedSet();
    const ctx = args[0];
    if (mounted.has(packageName)) {
      const waiters = mountWaiters();
      const queue = waiters.get(packageName) ?? [];
      let alive = true;
      const pending = {
        run: () => {
          if (alive) mount(...args);
        },
      };
      ctx?.effect?.(() => () => {
        alive = false;
        const idx = queue.indexOf(pending);
        if (idx >= 0) queue.splice(idx, 1);
      });
      queue.push(pending);
      waiters.set(packageName, queue);
      return;
    }
    mounted.add(packageName);
    ctx?.effect?.(() => () => {
      mounted.delete(packageName);
      const waiters = mountWaiters();
      const queue = waiters.get(packageName);
      if (queue === undefined) return;
      waiters.delete(packageName);
      for (const waiter of queue.splice(0)) {
        queueMicrotask(() => waiter.run());
      }
    });
    return fn(...args);
  };
  return mount;
}
