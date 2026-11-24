// Kanban board: drag-and-drop between status columns with optimistic updates,
// real-time sync over WebSockets, presence roster, and quick-create.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronLeft, Circle, Eye, Loader2, Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ws } from '../lib/ws';
import {
  BOARD_STATUSES,
  type Issue,
  type IssueEvent,
  type PresenceEvent,
  type PresenceUser,
  type Priority,
  type Project,
} from '../lib/types';
import { cn, timeAgo } from '../lib/utils';
import { Avatar, Button, EmptyState, Eyebrow, Input, LiveRegion, PriorityChip, Select, Skeleton } from '../components/ui';

const COLUMN_META: Record<string, { label: string; icon: typeof Circle; dot: string }> = {
  TODO: { label: 'To do', icon: Circle, dot: 'bg-slate-400' },
  IN_PROGRESS: { label: 'In progress', icon: Loader2, dot: 'bg-indigo-400' },
  IN_REVIEW: { label: 'In review', icon: Eye, dot: 'bg-amber-300' },
  DONE: { label: 'Done', icon: CheckCircle2, dot: 'bg-emerald-400' },
};

export function Board() {
  const { projectId = '' } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [present, setPresent] = useState<PresenceUser[]>([]);
  const [liveMessage, setLiveMessage] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('MEDIUM');
  const [creating, setCreating] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Issue ids with an in-flight local mutation — WS echoes for those are
  // ignored until the server response lands, so an optimistic edit is never
  // clobbered by its own broadcast.
  const pendingRef = useRef(new Set<string>());
  const issuesRef = useRef<Issue[]>([]);
  issuesRef.current = issues ?? [];

  const announce = useCallback((message: string) => setLiveMessage(`${message} — ${new Date().toLocaleTimeString()}`), []);

  const load = useCallback(async () => {
    try {
      const [projectData, page] = await Promise.all([api.getProject(projectId), api.listIssues(projectId)]);
      setProject(projectData);
      setIssues(page.content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load board');
      setIssues([]);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time: issue events for this project + presence roster.
  useEffect(() => {
    if (!user) return;
    const unsubIssues = ws.subscribe<IssueEvent>(`/topic/issues/${projectId}`, (event) => {
      if (event.type === 'CREATED') {
        setIssues((current) => (current?.some((issue) => issue.id === event.data.id) ? current : [event.data, ...(current ?? [])]));
        if (event.data.createdBy !== user.id) announce(`New issue: ${event.data.title}`);
      } else if (event.type === 'UPDATED') {
        if (pendingRef.current.has(event.data.id)) return;
        setIssues((current) => (current ?? []).map((issue) => (issue.id === event.data.id ? event.data : issue)));
        if (event.data.createdBy !== user.id) announce(`Issue updated: ${event.data.title}`);
      } else {
        setIssues((current) => (current ?? []).filter((issue) => issue.id !== event.issueId));
        announce('An issue was deleted');
      }
    });
    const unsubPresence = ws.subscribe<PresenceEvent>(`/topic/presence/${projectId}`, (event) => setPresent(event.users));

    // Presence join/leave for this page view.
    ws.publish(`/app/presence/${projectId}/join`, {});
    const joinTimer = setTimeout(() => ws.publish(`/app/presence/${projectId}/join`, {}), 1200); // re-assert after WS connect race
    return () => {
      clearTimeout(joinTimer);
      ws.publish(`/app/presence/${projectId}/leave`, {});
      unsubIssues();
      unsubPresence();
    };
  }, [projectId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Mutations ------------------------------------------------------------

  const createIssue = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      await api.createIssue({ projectId, title, priority: newPriority });
      setNewTitle('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const deleteIssue = async (issue: Issue) => {
    const snapshot = issuesRef.current;
    setIssues(snapshot.filter((candidate) => candidate.id !== issue.id));
    try {
      await api.deleteIssue(projectId, issue.id);
      toast.success('Issue deleted');
    } catch (err) {
      setIssues(snapshot);
      toast.error(err instanceof Error ? err.message : 'Delete failed — restored');
    }
  };

  /** Optimistic move: apply locally, PATCH, reconcile with server truth;
   *  roll back the snapshot on failure (e.g. a 409 from concurrent edit). */
  const moveIssue = async (issueId: string, status: Issue['status']) => {
    const snapshot = issuesRef.current;
    const issue = snapshot.find((candidate) => candidate.id === issueId);
    if (!issue || issue.status === status) return;

    pendingRef.current.add(issueId);
    setIssues(snapshot.map((candidate) => (candidate.id === issueId ? { ...candidate, status } : candidate)));
    try {
      const updated = await api.updateIssue(projectId, issueId, { status, version: issue.version });
      setIssues((current) => (current ?? []).map((candidate) => (candidate.id === issueId ? updated : candidate)));
    } catch (err) {
      setIssues(snapshot);
      toast.error(err instanceof Error ? err.message : 'Move failed — rolled back');
    } finally {
      pendingRef.current.delete(issueId);
    }
  };

  // --- Drag & drop ------------------------------------------------------------

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragStart = (event: DragStartEvent) => setActiveDragId(String(event.active.id));

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const targetStatus = (BOARD_STATUSES as string[]).includes(overId)
      ? overId
      : issuesRef.current.find((issue) => issue.id === overId)?.status;
    if (!targetStatus) return;
    void moveIssue(String(active.id), targetStatus as Issue['status']);
  };

  const activeIssue = useMemo(() => issues?.find((issue) => issue.id === activeDragId) ?? null, [issues, activeDragId]);
  const othersPresent = present.filter((person) => person.userId !== user?.id);

  return (
    <div className="flex flex-col gap-6">
      <LiveRegion message={liveMessage} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <Link to="/projects" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Projects
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{project?.name ?? 'Board'}</h1>
            {project && <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-400">{project.description}</span>}
          </div>
        </div>

        {/* Presence roster */}
        <div className="flex items-center gap-2" aria-label="People viewing this board">
          {othersPresent.length > 0 && (
            <div className="flex -space-x-2">
              {othersPresent.slice(0, 5).map((person) => (
                <Avatar key={person.userId} name={person.displayName} size="sm" className="ring-2 ring-ink-950" />
              ))}
            </div>
          )}
          <span className="text-xs text-slate-500">
            {othersPresent.length > 0 ? (
              <>
                <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400" aria-hidden="true" />
                {othersPresent.map((person) => person.displayName).join(', ')} viewing
              </>
            ) : (
              'Only you are here'
            )}
          </span>
        </div>
      </header>

      {/* Quick create */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void createIssue();
        }}
        className="glass flex flex-col gap-3 p-3 sm:flex-row"
        aria-label="Quick create issue"
      >
        <Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Type an issue title and press Enter…" maxLength={300} aria-label="Issue title" className="flex-1" />
        <div className="flex gap-3">
          <Select value={newPriority} onChange={(event) => setNewPriority(event.target.value as Priority)} aria-label="Priority">
            {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
          <Button type="submit" loading={creating} disabled={!newTitle.trim()} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            Add
          </Button>
        </div>
      </form>

      {/* Board */}
      {issues === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Loading board">
          {BOARD_STATUSES.map((status) => (
            <Skeleton key={status} className="h-96" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Issue board">
            {BOARD_STATUSES.map((status) => (
              <Column key={status} status={status} issues={issues.filter((issue) => issue.status === status)} onDelete={deleteIssue} />
            ))}
          </div>
          <DragOverlay>
            {activeIssue && (
              <div className="rotate-2 scale-105 cursor-grabbing opacity-90">
                <IssueCard issue={activeIssue} overlay />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({ status, issues, onDelete }: { status: (typeof BOARD_STATUSES)[number]; issues: Issue[]; onDelete: (issue: Issue) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = COLUMN_META[status];

  return (
    <section ref={setNodeRef} className={cn('flex min-h-[24rem] flex-col rounded-2xl border bg-white/[0.02] p-3 transition-colors', isOver ? 'border-indigo-400/40 bg-indigo-400/[0.05]' : 'border-white/[0.06]')} aria-label={`${meta.label} column, ${issues.length} issues`}>
      <header className="mb-3 flex items-center gap-2 px-1.5">
        <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden="true" />
        <meta.icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">{meta.label}</h2>
        <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400">{issues.length}</span>
      </header>

      <div className="flex flex-1 flex-col gap-2.5">
        {issues.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/[0.07] py-8 text-xs text-slate-600">Drop here</div>
        ) : (
          issues.map((issue) => <DraggableIssueCard key={issue.id} issue={issue} onDelete={onDelete} />)
        )}
      </div>
    </section>
  );
}

function DraggableIssueCard({ issue, onDelete }: { issue: Issue; onDelete: (issue: Issue) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: issue.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && 'opacity-30')}
    >
      <IssueCard issue={issue} onDelete={onDelete} />
    </div>
  );
}

function IssueCard({ issue, onDelete, overlay }: { issue: Issue; onDelete?: (issue: Issue) => void; overlay?: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={cn(
        'group relative cursor-grab rounded-xl border border-white/[0.08] bg-ink-800/80 p-3.5 shadow-card backdrop-blur-xl transition-colors hover:border-indigo-400/30',
        overlay && 'border-indigo-400/50 shadow-glow',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <PriorityChip priority={issue.priority} />
        {onDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(issue);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Delete issue ${issue.title}`}
            className="rounded-md p-1 text-slate-600 opacity-0 transition-all hover:bg-rose-400/10 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <Link to={`/projects/${issue.projectId}/issues/${issue.id}`} className="block text-sm font-medium leading-snug text-slate-100 transition-colors hover:text-indigo-200">
        {issue.title}
      </Link>
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-slate-600">v{issue.version} · {timeAgo(issue.updatedAt)}</span>
        {issue.priority === 'URGENT' && <Zap className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />}
      </div>
    </motion.div>
  );
}
