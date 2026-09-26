import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class JobStore {
  constructor(root) {
    this.root = root;
    this.jobs = new Map();
    this.index = path.join(root, 'jobs.json');
  }

  async init() {
    await mkdir(this.root, { recursive: true });
    try {
      const jobs = JSON.parse(await readFile(this.index, 'utf8'));
      for (const job of jobs) this.jobs.set(job.id, job.status === 'slicing' ? { ...job, status: 'failed', error: 'Server restarted during slicing' } : job);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await this.persist();
  }

  async set(job) { this.jobs.set(job.id, job); await this.persist(); return job; }
  get(id) { return this.jobs.get(id); }
  list() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async delete(id) { const existed = this.jobs.delete(id); if (existed) await this.persist(); return existed; }
  async persist() { await writeFile(this.index, JSON.stringify([...this.jobs.values()], null, 2)); }
}
