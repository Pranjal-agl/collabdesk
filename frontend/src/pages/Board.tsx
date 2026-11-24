// Board: drag cards between status trays with optimistic updates, live sync
// over WebSockets, teammates' cursors (and the cards they're carrying), a
// highlighter mark on anything someone else just changed, and a rubber stamp
// when work lands in Done.
// Keyboard: N focuses "add issue"; on a card, Shift+←/→ moves it a column,
// Enter opens it.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AnimatePresence, motion, useSpring } from 'framer-motion';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ws } from '../lib/ws';
import { usePeople } from '../lib/usePeople';
import { BOARD_STATUSES, type Issue, type IssueEvent, type PresenceEvent, type PresenceUser, type Priority, type Project } from '../lib/types';
import { cn, firstName, personInk, personName, PRIORITIES, PRIORITY_LABEL, rememberPerson, STATUS_INK, STATUS_LABEL, STATUS_WASH, timeAgo } from '../lib/utils';
import { Avatar, Button, Input, Kbd, LiveRegion, PriorityMark, Segmented, Skeleton } from '../components/ui';
import { Odometer, Stamp } from '../components/motion';
import { CursorLayer, useLiveCursors, type RemoteCursor } from '../components/LiveCursors';
import { NEW_ISSUE_EVENT } from '../components/CommandPalette';

type BoardStatus = (typeof BOARD_STATUSES)[number];
type Scope = 'ALL' | 'MINE';

/** A teammate's recent change, shown on the card for a few seconds. */
interface Mark {
  who: string;
  seed: string;
  what: string;
}

const MARK_MS = 7000;
const SLAM_MS = 1400;

export function Board() {
  const { projectId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  usePeople();
  // Arriving from the project list we already know the project, so the title
  // can be on screen immediately and fly in from the row that was clicked.
  const [project, setProject] = useState<Project | null>(() => {
    const passed = (location.state as { project?: Project } | null)?.project;
    return passed && passed.id === projectId ? passed : null;
  });
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [present, setPresent] = useState<PresenceUser[]>([]);
  const [liveMessage, setLiveMessage] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('MEDIUM');
  const [creating, setCreating] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [slams, setSlams] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<Scope>('ALL');
  const [dealing, setDealing] = useState(true);
  const titleRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Issue ids with an in-flight local mutation — WS echoes for those are
  // ignored until the server response lands, so an optimistic edit is never
  // clobbered by its own broadcast.
  const pendingRef = useRef(new Set<string>());
  const issuesRef = useRef<Issue[]>([]);
  issuesRef.current = issues ?? [];
  const presentRef = useRef<PresenceUser[]>([]);
  presentRef.current = present;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const cursors = useLiveCursors(projectId, user?.id, boardRef, activeDragId);
  const heldBy = useMemo(() => {
    const held: Record<string, RemoteCursor> = {};
    for (const cursor of Object.values(cursors)) if (cursor.dragging) held[cursor.dragging] = cursor;
    return held;
  }, [cursors]);

  const announce = useCallback((message: string) => setLiveMessage(`${message}. ${new Date().toLocaleTimeString()}`), []);

  const later = useCallback((key: string, ms: number, fn: () => void) => {
    clearTimeout(timers.current.get(key));
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        fn();
      }, ms),
    );
  }, []);

  const mark = useCallback(
    (issueId: string, value: Mark) => {
      setMarks((current) => ({ ...current, [issueId]: value }));
      later(`mark-${issueId}`, MARK_MS, () =>
        setMarks((current) => {
          const next = { ...current };
          delete next[issueId];
          return next;
        }),
      );
    },
    [later],
  );

  const slam = useCallback(
    (issueId: string) => {
      setSlams((current) => new Set(current).add(issueId));
      later(`slam-${issueId}`, SLAM_MS, () =>
        setSlams((current) => {
          const next = new Set(current);
          next.delete(issueId);
          return next;
        }),
      );
    },
    [later],
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const load = useCallback(async () => {
    try {
      const [projectData, page] = await Promise.all([api.getProject(projectId), api.listIssues(projectId)]);
      setProject(projectData);
      setIssues(page.content);
      setTimeout(() => setDealing(false), 1400);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t load this board');
      setIssues([]);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time: issue events for this project + presence roster.
  useEffect(() => {
    if (!user) return;

    const actorOf = (actorId: string | undefined, fallbackId?: string) => {
      if (actorId) return { who: firstName(personName(actorId)), seed: actorId };
      if (fallbackId) return { who: firstName(personName(fallbackId)), seed: fallbackId };
      const others = presentRef.current.filter((person) => person.userId !== user.id);
      return others.length === 1 ? { who: firstName(others[0].displayName), seed: others[0].userId } : { who: 'A teammate', seed: 'teammate' };
    };

    const unsubIssues = ws.subscribe<IssueEvent>(`/topic/issues/${projectId}`, (event) => {
      if (event.actorId === user.id) {
        // Our own change from another tab, or the echo of this one: just sync.
        if (event.type === 'DELETED') setIssues((current) => (current ?? []).filter((issue) => issue.id !== event.issueId));
        else if (!pendingRef.current.has(event.data.id)) {
          setIssues((current) => {
            const list = current ?? [];
            const known = list.find((issue) => issue.id === event.data.id);
            if (!known) return [event.data, ...list];
            return known.version >= event.data.version ? list : list.map((issue) => (issue.id === event.data.id ? event.data : issue));
          });
        }
        return;
      }
      if (event.type === 'CREATED') {
        setIssues((current) => (current?.some((issue) => issue.id === event.data.id) ? current : [event.data, ...(current ?? [])]));
        const actor = actorOf(event.actorId, event.data.createdBy);
        mark(event.data.id, { ...actor, what: 'added this' });
        announce(`${actor.who} added ${event.data.title}`);
      } else if (event.type === 'UPDATED') {
        if (pendingRef.current.has(event.data.id)) return;
        const before = issuesRef.current.find((issue) => issue.id === event.data.id);
        if (before && event.data.version <= before.version) return;
        setIssues((current) => (current ?? []).map((issue) => (issue.id === event.data.id ? event.data : issue)));
        const actor = actorOf(event.actorId);
        const moved = before && before.status !== event.data.status;
        mark(event.data.id, { ...actor, what: moved ? `moved this to ${STATUS_LABEL[event.data.status]}` : 'updated this' });
        if (moved && event.data.status === 'DONE') slam(event.data.id);
        announce(`${actor.who} ${moved ? `moved ${event.data.title} to ${STATUS_LABEL[event.data.status]}` : `updated ${event.data.title}`}`);
      } else {
        setIssues((current) => (current ?? []).filter((issue) => issue.id !== event.issueId));
        announce(`${actorOf(event.actorId).who} deleted an issue`);
      }
    });
    const unsubPresence = ws.subscribe<PresenceEvent>(`/topic/presence/${projectId}`, (event) => {
      event.users.forEach((person) => rememberPerson(person.userId, person.displayName));
      setPresent(event.users);
    });

    ws.publish(`/app/presence/${projectId}/join`, {});
    const joinTimer = setTimeout(() => ws.publish(`/app/presence/${projectId}/join`, {}), 1200); // re-assert after WS connect race
    return () => {
      clearTimeout(joinTimer);
      ws.publish(`/app/presence/${projectId}/leave`, {});
      unsubIssues();
      unsubPresence();
    };
  }, [projectId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // "N" (or the command palette) jumps to the add-issue field.
  useEffect(() => {
    const focusAdd = () => {
      titleRef.current?.focus();
      titleRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      event.preventDefault();
      focusAdd();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(NEW_ISSUE_EVENT, focusAdd);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(NEW_ISSUE_EVENT, focusAdd);
    };
  }, []);

  // --- Mutations ------------------------------------------------------------

  const createIssue = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const created = await api.createIssue({ projectId, title, priority: newPriority });
      // Insert directly too: the WS echo is deduped by id, and the board stays
      // correct even while the socket is reconnecting.
      setIssues((current) => (current?.some((issue) => issue.id === created.id) ? current : [created, ...(current ?? [])]));
      setNewTitle('');
      if (scope === 'MINE') setScope('ALL'); // a new issue is unassigned; don't let it vanish
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t add the issue');
    } finally {
      setCreating(false);
    }
  };

  const deleteIssue = async (issue: Issue) => {
    const snapshot = issuesRef.current;
    setIssues(snapshot.filter((candidate) => candidate.id !== issue.id));
    try {
      await api.deleteIssue(projectId, issue.id);
      toast(`Deleted “${issue.title}”`);
    } catch (err) {
      setIssues(snapshot);
      toast.error(err instanceof Error ? `${err.message}. The issue is back where it was.` : 'Couldn’t delete. The issue is back where it was.');
    }
  };

  /** Optimistic move: apply locally, PATCH, reconcile with server truth;
   *  roll back the snapshot on failure (e.g. a 409 from concurrent edit). */
  const moveIssue = useCallback(
    async (issueId: string, status: Issue['status']) => {
      const snapshot = issuesRef.current;
      const issue = snapshot.find((candidate) => candidate.id === issueId);
      if (!issue || issue.status === status) return;

      pendingRef.current.add(issueId);
      setIssues(snapshot.map((candidate) => (candidate.id === issueId ? { ...candidate, status } : candidate)));
      if (status === 'DONE') slam(issueId);
      try {
        const updated = await api.updateIssue(projectId, issueId, { status, version: issue.version });
        setIssues((current) => (current ?? []).map((candidate) => (candidate.id === issueId ? updated : candidate)));
      } catch (err) {
        setIssues(snapshot);
        toast.error(err instanceof Error ? `${err.message}. Moved it back.` : 'Couldn’t move it. Moved it back.');
      } finally {
        pendingRef.current.delete(issueId);
      }
    },
    [projectId, slam],
  );

  const onCardKey = (event: ReactKeyboardEvent, issue: Issue) => {
    if (event.key === 'Enter') {
      navigate(`/projects/${projectId}/issues/${issue.id}`);
      return;
    }
    if (!event.shiftKey || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
    event.preventDefault();
    const index = BOARD_STATUSES.indexOf(issue.status as BoardStatus);
    const next = BOARD_STATUSES[index + (event.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    void moveIssue(issue.id, next);
    announce(`Moved ${issue.title} to ${STATUS_LABEL[next]}`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-issue="${issue.id}"]`)?.focus());
  };

  // --- Drag & drop ------------------------------------------------------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  // Tilt the dragged card with the hand's horizontal speed, like paper.
  const tilt = useSpring(0, { stiffness: 300, damping: 22 });
  const lastX = useRef(0);

  const onDragStart = (event: DragStartEvent) => {
    lastX.current = 0;
    setActiveDragId(String(event.active.id));
  };

  const onDragMove = (event: DragMoveEvent) => {
    const dx = event.delta.x - lastX.current;
    lastX.current = event.delta.x;
    tilt.set(Math.max(-9, Math.min(9, dx * 0.9)));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    tilt.set(0);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    const targetStatus = (BOARD_STATUSES as string[]).includes(overId) ? overId : issuesRef.current.find((issue) => issue.id === overId)?.status;
    if (!targetStatus) return;
    void moveIssue(String(active.id), targetStatus as Issue['status']);
  };

  const activeIssue = useMemo(() => issues?.find((issue) => issue.id === activeDragId) ?? null, [issues, activeDragId]);
  const othersPresent = present.filter((person) => person.userId !== user?.id);
  const visible = useMemo(() => (issues ?? []).filter((issue) => scope === 'ALL' || issue.assigneeId === user?.id), [issues, scope, user?.id]);
  const mineCount = useMemo(() => (issues ?? []).filter((issue) => issue.assigneeId === user?.id && issue.status !== 'DONE').length, [issues, user?.id]);

  return (
    <div className="flex flex-col gap-7">
      <LiveRegion message={liveMessage} />

      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <Link to="/projects" className="mb-2 inline-flex items-center gap-1 rounded text-sm text-graphite hover:text-ink">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> All projects
          </Link>
          {project ? (
            <>
              <motion.h1 layoutId={`project-title-${project.id}`} className="display-tight w-fit text-3xl sm:text-4xl" transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
                {project.name}
              </motion.h1>
              {project.description && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-3 max-w-[64ch] text-lg text-ink-soft">
                  {project.description}
                </motion.p>
              )}
            </>
          ) : (
            <Skeleton className="h-14 w-80" />
          )}
        </div>

        <PresenceRoster others={othersPresent} />
      </header>

      {/* Add issue */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void createIssue();
        }}
        className="paper flex flex-col gap-3 p-2 lg:flex-row lg:items-center"
        aria-label="Add an issue"
      >
        <div className="relative flex-1">
          <Input
            ref={titleRef}
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Add an issue to To do"
            maxLength={300}
            aria-label="New issue title"
            aria-keyshortcuts="N"
            className="h-11 border-transparent bg-transparent pr-12 text-lg hover:border-transparent focus:border-rule"
          />
          {!newTitle && (
            <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 sm:block">
              <Kbd>N</Kbd>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Priority"
            options={PRIORITIES}
            value={newPriority}
            onChange={setNewPriority}
            render={(priority, selected) => (
              <span className="flex items-center gap-1.5">
                <PriorityMark priority={priority} showLabel={false} inverse={selected} />
                {PRIORITY_LABEL[priority]}
              </span>
            )}
          />
          <Button type="submit" variant="primary" loading={creating} disabled={!newTitle.trim()} className="h-10">
            Add issue
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show"
          options={['ALL', 'MINE'] as const}
          value={scope}
          onChange={setScope}
          render={(value) =>
            value === 'ALL' ? (
              'Everyone’s issues'
            ) : (
              <span className="flex items-center gap-2">
                Assigned to me
                <span className="rounded-full bg-marker px-1.5 text-xs font-semibold text-ink">
                  <Odometer value={mineCount} />
                </span>
              </span>
            )
          }
        />
        <p className="hidden text-sm text-graphite lg:block">
          Drag cards between columns, or select one and press <Kbd>Shift</Kbd> <Kbd>→</Kbd>
        </p>
      </div>

      {/* Board */}
      {issues === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Loading board">
          {BOARD_STATUSES.map((status) => (
            <Skeleton key={status} className="h-96 rounded-tray" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveDragId(null);
            tilt.set(0);
          }}
          accessibility={{
            screenReaderInstructions: {
              draggable: 'Press Shift with the left or right arrow to move this issue to the previous or next column. Press Enter to open it.',
            },
          }}
        >
          <div ref={boardRef} className="relative">
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-4 lg:overflow-visible lg:px-0">
              {BOARD_STATUSES.map((status, columnIndex) => (
                <Column
                  key={status}
                  status={status}
                  columnIndex={columnIndex}
                  issues={visible.filter((issue) => issue.status === status)}
                  marks={marks}
                  slams={slams}
                  heldBy={heldBy}
                  dealing={dealing}
                  emptyHint={scope === 'MINE' ? 'Nothing of yours here.' : undefined}
                  onDelete={deleteIssue}
                  onCardKey={onCardKey}
                  dragging={activeDragId !== null}
                />
              ))}
            </div>
            <CursorLayer cursors={cursors} issues={issues} boardRef={boardRef} />
          </div>
          <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
            {activeIssue && (
              <motion.div style={{ rotate: tilt }} initial={{ scale: 1 }} animate={{ scale: 1.035 }} className="cursor-grabbing">
                <IssueCard issue={activeIssue} lifted />
              </motion.div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function PresenceRoster({ others }: { others: PresenceUser[] }) {
  const names = others.map((person) => firstName(person.displayName));
  const text =
    names.length === 0
      ? 'Just you on this board'
      : names.length === 1
        ? `${names[0]} is here too`
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are here too`;
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex -space-x-2">
        <AnimatePresence initial={false}>
          {others.slice(0, 5).map((person) => (
            <motion.span
              key={person.userId}
              initial={{ scale: 0.3, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="relative"
            >
              <Avatar name={person.displayName} seed={person.userId} size="md" ring />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-blotter bg-person-moss" aria-hidden="true" />
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <span className="text-sm text-graphite">{text}</span>
    </div>
  );
}

function Column({
  status,
  columnIndex,
  issues,
  marks,
  slams,
  heldBy,
  dealing,
  emptyHint,
  onDelete,
  onCardKey,
  dragging,
}: {
  status: BoardStatus;
  columnIndex: number;
  issues: Issue[];
  marks: Record<string, Mark>;
  slams: Set<string>;
  heldBy: Record<string, RemoteCursor>;
  dealing: boolean;
  emptyHint?: string;
  onDelete: (issue: Issue) => void;
  onCardKey: (event: ReactKeyboardEvent, issue: Issue) => void;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]}, ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`}
      className={cn(
        'relative flex min-h-[18rem] w-[82vw] shrink-0 snap-start flex-col rounded-tray border-t-[3px] p-2 shadow-inset transition-[background-color,outline-color,filter] duration-150 sm:w-[21rem] lg:min-h-[26rem] lg:w-auto',
        'outline-dashed outline-2 -outline-offset-4',
        isOver ? 'brightness-[0.97]' : dragging ? 'outline-rule' : 'outline-transparent',
      )}
      style={{
        borderTopColor: STATUS_INK[status],
        // Each tray takes a faint wash of its column's colour.
        backgroundColor: `color-mix(in srgb, ${STATUS_WASH[status]} ${isOver ? 70 : 42}%, #CBD2C8)`,
        outlineColor: isOver ? STATUS_INK[status] : undefined,
      }}
    >
      <header className="flex items-center justify-between px-2 pb-3 pt-1.5">
        <h2 className="display flex items-center gap-2 text-xl">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_INK[status] }} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </h2>
        <span className="rounded-full px-2 py-0.5 font-mono text-sm font-bold" style={{ backgroundColor: STATUS_WASH[status], color: STATUS_INK[status] }}>
          <Odometer value={issues.length} />
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2">
        {issues.length === 0 ? (
          <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-graphite">
            {emptyHint ?? (status === 'DONE' ? 'Finished work lands here.' : 'Drag a card here.')}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {issues.map((issue, row) => (
              <DraggableIssueCard
                key={issue.id}
                issue={issue}
                mark={marks[issue.id]}
                slam={slams.has(issue.id)}
                heldBy={heldBy[issue.id]}
                dealDelay={dealing ? 0.12 + columnIndex * 0.07 + row * 0.06 : undefined}
                onDelete={onDelete}
                onKeyDown={onCardKey}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}

/** Deterministic little rotation per card so the deal looks hand-thrown. */
function tossAngle(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 13) - 6) * 1.2;
}

function DraggableIssueCard({
  issue,
  mark,
  slam,
  heldBy,
  dealDelay,
  onDelete,
  onKeyDown,
}: {
  issue: Issue;
  mark?: Mark;
  slam: boolean;
  heldBy?: RemoteCursor;
  dealDelay?: number;
  onDelete: (issue: Issue) => void;
  onKeyDown: (event: ReactKeyboardEvent, issue: Issue) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.id });
  const dealt = dealDelay !== undefined;
  return (
    <motion.div
      layout
      layoutId={issue.id}
      initial={dealt ? { opacity: 0, y: -46, rotate: tossAngle(issue.id), scale: 1.04 } : { opacity: 0, y: -6 }}
      animate={{ opacity: heldBy ? 0.45 : 1, y: 0, rotate: 0, scale: slam ? [1, 0.965, 1.01, 1] : 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
      whileHover={isDragging ? undefined : { y: -2 }}
      transition={{
        type: 'spring',
        stiffness: 420,
        damping: 32,
        delay: dealt ? dealDelay : 0,
        scale: slam ? { duration: 0.42, delay: 0.08, times: [0, 0.3, 0.7, 1] } : { type: 'spring', stiffness: 420, damping: 32 },
      }}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        data-issue={issue.id}
        aria-roledescription="issue card"
        aria-label={`${issue.title}, ${PRIORITY_LABEL[issue.priority]} priority`}
        onKeyDown={(event) => {
          listeners?.onKeyDown?.(event);
          onKeyDown(event, issue);
        }}
        className={cn('cursor-grab touch-manipulation rounded-card outline-offset-2', isDragging && 'opacity-35')}
        style={heldBy ? { outline: `2px dashed ${personInk(heldBy.userId)}`, outlineOffset: 2 } : undefined}
      >
        <IssueCard issue={issue} mark={mark} slam={slam} onDelete={onDelete} />
      </div>
    </motion.div>
  );
}

function IssueCard({ issue, mark, slam, onDelete, lifted }: { issue: Issue; mark?: Mark; slam?: boolean; onDelete?: (issue: Issue) => void; lifted?: boolean }) {
  const ink = mark ? personInk(mark.seed) : undefined;
  const assignee = issue.assigneeId ? personName(issue.assigneeId) : null;
  return (
    <article
      className={cn(
        'group paper relative overflow-hidden px-3.5 pb-3 pt-3 transition-shadow',
        lifted ? 'shadow-lifted' : 'hover:shadow-[0_1px_0_#B4BDB2,0_10px_20px_-10px_rgba(24,33,28,0.35)]',
      )}
      style={ink ? { boxShadow: `inset 3px 0 0 ${ink}, 0 1px 0 #B4BDB2, 0 2px 6px -3px rgba(24,33,28,0.25)` } : undefined}
    >
      {issue.status === 'DONE' && <Stamp slam={slam} className="absolute right-3 top-7 text-lg" />}

      <div className="flex items-center justify-between gap-2">
        <PriorityMark priority={issue.priority} />
        {onDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (confirm(`Delete “${issue.title}”?`)) onDelete(issue);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={`Delete ${issue.title}`}
            className="-mr-1 -mt-1 rounded p-1 text-graphite opacity-0 transition-opacity hover:bg-alarm-wash hover:text-alarm focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <Link
        to={`/projects/${issue.projectId}/issues/${issue.id}`}
        tabIndex={-1}
        draggable={false}
        className={cn('relative mt-2 block font-medium leading-snug text-ink hover:underline hover:decoration-1 hover:underline-offset-2', issue.status === 'DONE' && 'pr-16 text-ink-soft')}
      >
        <span key={mark ? `${mark.what}-${issue.version}` : 'plain'} className={mark ? 'marker-swipe' : undefined}>
          {issue.title}
        </span>
      </Link>

      <AnimatePresence initial={false}>
        {mark && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden text-xs font-semibold"
            style={{ color: ink }}
          >
            <span className="block pt-1.5">
              {mark.who} {mark.what}
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-3 flex items-center gap-2 text-xs text-graphite">
        {assignee ? (
          <>
            <Avatar name={assignee} seed={issue.assigneeId!} size="xs" />
            <span title="Assigned to">{firstName(assignee)}</span>
          </>
        ) : (
          <>
            <span className="h-5 w-5 rounded-full border border-dashed border-graphite/60" aria-hidden="true" />
            <span>Unassigned</span>
          </>
        )}
        <span className="numeric ml-auto" title={`Last changed ${new Date(issue.updatedAt).toLocaleString()}`}>
          {timeAgo(issue.updatedAt)}
        </span>
      </div>
    </article>
  );
}
