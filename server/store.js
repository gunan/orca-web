import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export class JobStore {
  #pending = Promise.resolve();

  constructor(root) {
    this.root = root;
    this.jobs = new Map();
    this.index = path.join(root, 'jobs.json');
  }

  async init() {
    return this.#enqueue(async () => {
      await mkdir(this.root, { recursive: true });
      let saved = [];
      try {
        saved = JSON.parse(await readFile(this.index, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (!Array.isArray(saved)) throw new Error('Invalid job index: expected an array');
      const jobs = new Map();
      for (const job of saved) {
        if (!job || typeof job !== 'object' || Array.isArray(job) || typeof job.id !== 'string' || !job.id || jobs.has(job.id)) {
          throw new Error('Invalid job index: each job must have a unique string id');
        }
        jobs.set(job.id, ['queued', 'slicing'].includes(job.status)
          ? { ...job, status: 'failed', error: `Job interrupted by server restart while ${job.status}` }
          : job);
      }
      await this.#write(jobs);
      this.jobs = jobs;
    });
  }

  async set(job) {
    const snapshot = structuredClone(job);
    return this.#enqueue(async () => {
      const next = new Map(this.jobs);
      next.set(snapshot.id, snapshot);
      await this.#write(next);
      this.jobs = next;
      return structuredClone(snapshot);
    });
  }

  async transition(id, statuses, changes) {
    const snapshot = structuredClone(changes);
    return this.#enqueue(async () => {
      const current = this.jobs.get(id);
      if (!current || !statuses.includes(current.status)) return structuredClone(current);
      const updated = { ...current, ...snapshot, id: current.id };
      const next = new Map(this.jobs);
      next.set(id, updated);
      await this.#write(next);
      this.jobs = next;
      return structuredClone(updated);
    });
  }

  get(id) { return structuredClone(this.jobs.get(id)); }

  list() {
    return structuredClone([...this.jobs.values()])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(id) {
    return this.#enqueue(async () => {
      if (!this.jobs.has(id)) return false;
      const next = new Map(this.jobs);
      next.delete(id);
      await this.#write(next);
      this.jobs = next;
      return true;
    });
  }

  async persist() {
    return this.#enqueue(() => this.#write(this.jobs));
  }

  #enqueue(operation) {
    const result = this.#pending.then(operation);
    // A failed operation must reach its caller without blocking subsequent jobs.
    this.#pending = result.catch(() => {});
    return result;
  }

  async #write(jobs) {
    const data = JSON.stringify([...jobs.values()], null, 2);
    const temporary = path.join(this.root, `.jobs-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.index);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
}
