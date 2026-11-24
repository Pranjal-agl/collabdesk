// Project dashboard: stats, create flow, and a staggered card grid.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderKanban, Plus, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { Issue, Project } from '../lib/types';
import { timeAgo } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { Avatar, Button, EmptyState, Eyebrow, Input, Magnetic, Skeleton, Stat, Textarea } from '../components/ui';

export function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [issueCounts, setIssueCounts] = useState<Record<string, { open: number; done: number }>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listProjects();
        if (cancelled) return;
        setProjects(list);
        // Per-project issue counts: one parallel fetch per project, deduped.
        const counts = await Promise.all(
          list.map(async (project) => {
            const page = await api.listIssues(project.id);
            const tally = { open: 0, done: 0 };
            for (const issue of page.content as Issue[]) {
              if (issue.status === 'DONE' || issue.status === 'CANCELLED') tally.done++;
              else tally.open++;
            }
            return [project.id, tally] as const;
          }),
        );
        if (!cancelled) setIssueCounts(Object.fromEntries(counts));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load projects');
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    const values = Object.values(issueCounts);
    return {
      projects: projects?.length ?? 0,
      open: values.reduce((sum, value) => sum + value.open, 0),
      done: values.reduce((sum, value) => sum + value.done, 0),
    };
  }, [projects, issueCounts]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const project = await api.createProject({ name: name.trim(), description: description.trim() || undefined });
      toast.success(`Project "${project.name}" created`);
      setName('');
      setDescription('');
      setShowCreate(false);
      setProjects((current) => [project, ...(current ?? [])]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (project: Project) => {
    if (!confirm(`Delete "${project.name}" and all its issues?`)) return;
    try {
      await api.deleteProject(project.id);
      setProjects((current) => (current ?? []).filter((candidate) => candidate.id !== project.id));
      toast.success('Project deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Workspace</Eyebrow>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {user ? `${user.name.split(' ')[0]}, your projects` : 'Projects'}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">Pick up where the team left off — boards update live.</p>
        </div>
        <Magnetic strength={0.2}>
          <Button onClick={() => setShowCreate((value) => !value)} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            New project
          </Button>
        </Magnetic>
      </header>

      <section aria-label="Workspace statistics" className="grid grid-cols-3 gap-3">
        <Stat label="Projects" value={totals.projects} />
        <Stat label="Open issues" value={totals.open} hint="Across all projects" />
        <Stat label="Shipped" value={totals.done} hint="Done or cancelled" />
      </section>

      <AnimatePresence>
        {showCreate && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
            aria-label="Create project"
          >
            <form onSubmit={create} className="glass flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="project-name" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  Name
                </label>
                <Input id="project-name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Website relaunch" />
              </div>
              <div className="flex-[2]">
                <label htmlFor="project-desc" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                  Description
                </label>
                <Textarea id="project-desc" rows={1} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this project about?" className="resize-none" />
              </div>
              <Button type="submit" loading={creating} disabled={!name.trim()}>
                Create
              </Button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {projects === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading projects">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-8 w-8" aria-hidden="true" />}
          title="No projects yet"
          hint="Create your first project above — it takes seconds and the board is live immediately."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Projects">
          {projects.map((project, index) => {
            const counts = issueCounts[project.id];
            return (
              <motion.li
                key={project.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  to={`/projects/${project.id}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-indigo-400/40 hover:bg-white/[0.06] hover:shadow-glow"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-cyan-400/25 text-indigo-300 ring-1 ring-white/10">
                      <FolderKanban className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-slate-600 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-indigo-300" aria-hidden="true" />
                  </div>
                  <h2 className="font-display text-lg font-semibold text-white">{project.name}</h2>
                  <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-400">{project.description ?? 'No description yet.'}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {counts && (
                        <>
                          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-cyan-300">{counts.open} open</span>
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-emerald-300">{counts.done} done</span>
                        </>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-600">created {timeAgo(project.createdAt)}</span>
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}

      <p className="flex items-center gap-2 text-xs text-slate-600">
        <Avatar name={user?.name ?? '?'} size="sm" />
        Signed in as {user?.email} · tenant-scoped data · row-level isolation enforced server-side
      </p>
    </div>
  );
}
