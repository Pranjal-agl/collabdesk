// Projects: one ledger sheet, a row per project with its status strip, plus
// an inline create row.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { BOARD_STATUSES, type IssueStatus, type Project } from '../lib/types';
import { cn, STATUS_FILL, STATUS_LABEL, timeAgo } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { Button, EmptyState, Input, Label, Skeleton } from '../components/ui';
import { Odometer } from '../components/motion';

type Tally = Record<IssueStatus, number>;
const emptyTally = (): Tally => ({ TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0, CANCELLED: 0 });
const openCount = (tally: Tally) => tally.TODO + tally.IN_PROGRESS + tally.IN_REVIEW;

export function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listProjects();
        if (cancelled) return;
        setProjects(list);
        const entries = await Promise.all(
          list.map(async (project) => {
            const page = await api.listIssues(project.id);
            const tally = emptyTally();
            for (const issue of page.content) tally[issue.status]++;
            return [project.id, tally] as const;
          }),
        );
        if (!cancelled) setTallies(Object.fromEntries(entries));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Couldn’t load projects');
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (showCreate) nameRef.current?.focus();
  }, [showCreate]);

  const openTotal = useMemo(() => Object.values(tallies).reduce((sum, tally) => sum + openCount(tally), 0), [tallies]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const project = await api.createProject({ name: name.trim(), description: description.trim() || undefined });
      toast.success(`Created ${project.name}`);
      setName('');
      setDescription('');
      setShowCreate(false);
      setProjects((current) => [project, ...(current ?? [])]);
      setTallies((current) => ({ ...current, [project.id]: emptyTally() }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t create the project');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (project: Project) => {
    if (!confirm(`Delete ${project.name} and every issue in it? This can’t be undone.`)) return;
    try {
      await api.deleteProject(project.id);
      setProjects((current) => (current ?? []).filter((candidate) => candidate.id !== project.id));
      toast.success(`Deleted ${project.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t delete the project');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="display-tight text-3xl sm:text-4xl">Projects</h1>
          <p className="mt-3 text-lg text-ink-soft">
            {projects === null
              ? 'Loading your workspace…'
              : projects.length === 0
                ? 'Nothing here yet.'
                : (
                  <>
                    <Odometer value={openTotal} /> open {openTotal === 1 ? 'issue' : 'issues'} across <Odometer value={projects.length} />{' '}
                    {projects.length === 1 ? 'project' : 'projects'}.
                  </>
                )}
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate((value) => !value)} aria-expanded={showCreate} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          New project
        </Button>
      </header>

      <AnimatePresence initial={false}>
        {showCreate && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
            aria-label="New project"
          >
            <form onSubmit={create} className="paper grid gap-4 p-5 md:grid-cols-[1fr_2fr_auto] md:items-end">
              <div>
                <Label htmlFor="project-name">Name</Label>
                <Input ref={nameRef} id="project-name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="Website relaunch" />
              </div>
              <div>
                <Label htmlFor="project-desc">What’s it for? (optional)</Label>
                <Input id="project-desc" maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="One line your team will recognise" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" loading={creating} disabled={!name.trim()}>
                  Create project
                </Button>
                <Button variant="quiet" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {projects === null ? (
        <div className="flex flex-col gap-2" aria-label="Loading projects">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-24" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="Start your first board"
          hint="A project is a board your whole team can work on at once. Give it a name and you can add issues right away."
          action={
            <Button variant="ink" onClick={() => setShowCreate(true)} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
              New project
            </Button>
          }
        />
      ) : (
        <section aria-label="Projects" className="paper overflow-hidden">
          <div className="hidden items-center justify-end gap-4 border-b border-rule/70 px-5 py-2.5 text-xs text-graphite md:flex">
            {BOARD_STATUSES.map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_FILL[status] }} aria-hidden="true" />
                {STATUS_LABEL[status]}
              </span>
            ))}
          </div>
          <ul>
            {projects.map((project, index) => (
              <ProjectRow key={project.id} index={index} project={project} tally={tallies[project.id]} onDelete={user?.role === 'ADMIN' || project.createdBy === user?.id ? remove : undefined} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProjectRow({ project, tally, index, onDelete }: { project: Project; tally?: Tally; index: number; onDelete?: (project: Project) => void }) {
  const total = tally ? BOARD_STATUSES.reduce((sum, status) => sum + tally[status], 0) : 0;
  return (
    <motion.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: index * 0.06 }}
      className="group relative border-b border-rule/60 last:border-b-0"
    >
      <Link
        to={`/projects/${project.id}`}
        state={{ project }}
        className="grid gap-x-10 gap-y-3 px-5 py-5 transition-colors hover:bg-blotter/35 focus-visible:bg-blotter/35 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7rem] md:items-center"
      >
        <div className="min-w-0">
          <motion.h2
            layoutId={`project-title-${project.id}`}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="display w-fit text-2xl leading-tight group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4"
          >
            {project.name}
          </motion.h2>
          <p className="mt-1 line-clamp-2 max-w-[60ch] text-ink-soft">{project.description || 'No description'}</p>
        </div>

        <div>
          {tally ? (
            <>
              <div
                className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-blotter"
                role="img"
                aria-label={BOARD_STATUSES.map((status) => `${tally[status]} ${STATUS_LABEL[status].toLowerCase()}`).join(', ')}
              >
                {total > 0 &&
                  BOARD_STATUSES.map((status, segment) =>
                    tally[status] > 0 ? (
                      <motion.span
                        key={status}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(tally[status] / total) * 100}%` }}
                        transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.1 + index * 0.08 + segment * 0.05 }}
                        style={{ backgroundColor: STATUS_FILL[status] }}
                      />
                    ) : null,
                  )}
              </div>
              <p className="mt-2 text-sm text-graphite">
                {total === 0 ? 'No issues yet' : `${openCount(tally)} open, ${tally.DONE} done`}
              </p>
            </>
          ) : (
            <Skeleton className="h-3 w-full" />
          )}
        </div>

        <p className="text-sm text-graphite md:text-right">Started {timeAgo(project.createdAt)}</p>
      </Link>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(project)}
          aria-label={`Delete ${project.name}`}
          className={cn(
            'absolute right-3 top-3 rounded-md p-1.5 text-graphite opacity-0 transition-opacity hover:bg-alarm-wash hover:text-alarm',
            'focus-visible:opacity-100 group-hover:opacity-100',
          )}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </motion.li>
  );
}
