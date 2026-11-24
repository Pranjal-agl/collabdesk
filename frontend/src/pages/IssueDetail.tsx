// Issue detail: inline editing with optimistic rollback, a live discussion
// thread over WebSockets, presence, and server-truth reconciliation on 409s.
// Status and priority live in a side rail as direct switches.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ws } from '../lib/ws';
import type { Comment, CommentEvent, Issue, IssueEvent, PresenceEvent, PresenceUser, Priority, Project, TypingEvent } from '../lib/types';
import { usePeople } from '../lib/usePeople';
import { Odometer, Stamp, TypingDots } from '../components/motion';
import { cn, firstName, formatDate, knownName, personInk, personName, PRIORITIES, PRIORITY_LABEL, rememberPerson, STATUSES, STATUS_INK, STATUS_LABEL, timeAgo } from '../lib/utils';
import { Avatar, Button, Kbd, LiveRegion, PriorityMark, Segmented, Skeleton, Textarea } from '../components/ui';

export function IssueDetail() {
  const { projectId = '', issueId = '' } = useParams();
  const { user } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [present, setPresent] = useState<PresenceUser[]>([]);
  const [liveMessage, setLiveMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [remoteEdit, setRemoteEdit] = useState<{ who: string; seed: string; at: number } | null>(null);
  const [freshComments, setFreshComments] = useState<Set<string>>(new Set());
  const [typists, setTypists] = useState<Record<string, { name: string; at: number }>>({});
  const [justDone, setJustDone] = useState(false);
  const directory = usePeople();
  const typingSent = useRef(0);
  const typingStop = useRef<ReturnType<typeof setTimeout>>();

  const pendingRef = useRef(new Set<string>());
  const issueRef = useRef<Issue | null>(null);
  issueRef.current = issue;
  const presentRef = useRef<PresenceUser[]>([]);
  presentRef.current = present;

  const announce = useCallback((message: string) => setLiveMessage(`${message}. ${new Date().toLocaleTimeString()}`), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [issueData, commentList, projectData] = await Promise.all([
          api.getIssue(projectId, issueId),
          api.listComments(issueId),
          api.getProject(projectId),
        ]);
        if (cancelled) return;
        setIssue(issueData);
        setComments(commentList);
        setProject(projectData);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Couldn’t load this issue');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, issueId]);

  // Real-time: this issue's updates, its comment thread, and presence.
  useEffect(() => {
    if (!user) return;
    const unsubIssues = ws.subscribe<IssueEvent>(`/topic/issues/${projectId}`, (event) => {
      if (event.type !== 'UPDATED' || event.data.id !== issueId || pendingRef.current.has(issueId)) return;
      const current = issueRef.current;
      if (!current || event.data.version <= current.version) return;
      if (event.actorId === user.id) {
        setIssue(event.data); // our own edit from another tab
        return;
      }
      if (current.status !== 'DONE' && event.data.status === 'DONE') setJustDone(true);
      setIssue(event.data);
      const others = presentRef.current.filter((person) => person.userId !== user.id);
      const editor = event.actorId
        ? { who: firstName(personName(event.actorId)), seed: event.actorId }
        : others.length === 1
          ? { who: firstName(others[0].displayName), seed: others[0].userId }
          : { who: 'A teammate', seed: 'teammate' };
      setRemoteEdit({ ...editor, at: Date.now() });
      announce(`${editor.who} updated this issue`);
    });
    const unsubComments = ws.subscribe<CommentEvent>(`/topic/issues/${issueId}/comments`, (event) => {
      if (event.type === 'CREATED') {
        setComments((current) => (current?.some((comment) => comment.id === event.data.id) ? current : [...(current ?? []), event.data]));
        if (event.data.authorId !== user.id) {
          setFreshComments((current) => new Set(current).add(event.data.id));
          announce(`New comment from ${personName(event.data.authorId)}`);
        }
      } else {
        setComments((current) => (current ?? []).filter((comment) => comment.id !== event.commentId));
      }
    });
    const unsubTyping = ws.subscribe<TypingEvent>(`/topic/typing/${issueId}`, (event) => {
      if (event.userId === user.id) return;
      rememberPerson(event.userId, event.displayName);
      setTypists((current) => {
        const next = { ...current };
        if (event.typing) next[event.userId] = { name: event.displayName, at: Date.now() };
        else delete next[event.userId];
        return next;
      });
    });
    // A dropped "stopped typing" frame must not leave dots up forever.
    const pruneTypists = setInterval(() => {
      setTypists((current) => {
        const alive = Object.entries(current).filter(([, value]) => Date.now() - value.at < 6000);
        return alive.length === Object.keys(current).length ? current : Object.fromEntries(alive);
      });
    }, 1500);
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
      unsubComments();
      unsubTyping();
      clearInterval(pruneTypists);
      unsubPresence();
      ws.publish(`/app/typing/${issueId}`, { typing: false });
    };
  }, [projectId, issueId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Tell teammates we're writing; at most every 1.5s, and "stopped" after 3s idle. */
  const signalTyping = useCallback(() => {
    const now = Date.now();
    if (now - typingSent.current > 1500) {
      typingSent.current = now;
      ws.publish(`/app/typing/${issueId}`, { typing: true });
    }
    clearTimeout(typingStop.current);
    typingStop.current = setTimeout(() => {
      typingSent.current = 0;
      ws.publish(`/app/typing/${issueId}`, { typing: false });
    }, 3000);
  }, [issueId]);

  /** Optimistic patch: snapshot, apply locally, PATCH, reconcile; roll back on error. */
  const patchIssue = useCallback(
    async (patch: Partial<Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'assigneeId'>> & { clearAssignee?: boolean }) => {
      const current = issueRef.current;
      if (!current) return false;
      const snapshot = current;
      pendingRef.current.add(issueId);
      const { clearAssignee, ...fields } = patch;
      setIssue({ ...current, ...fields, ...(clearAssignee ? { assigneeId: null } : {}) });
      if (patch.status === 'DONE' && current.status !== 'DONE') setJustDone(true);
      try {
        const updated = await api.updateIssue(projectId, issueId, { ...patch, version: snapshot.version });
        setIssue(updated);
        return true;
      } catch (err) {
        setIssue(snapshot);
        toast.error(err instanceof Error ? `${err.message}. Your change was undone.` : 'Couldn’t save. Your change was undone.');
        return false;
      } finally {
        pendingRef.current.delete(issueId);
      }
    },
    [projectId, issueId],
  );

  const commitTitle = async () => {
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (!title || title === issue?.title) return;
    await patchIssue({ title });
  };

  const sendComment = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    // Optimistic: temp comment renders instantly, replaced by server truth.
    const temp: Comment = { id: `tmp-${Date.now()}`, issueId, authorId: user?.id ?? '', body, createdAt: new Date().toISOString(), version: 0 };
    setComments((current) => [...(current ?? []), temp]);
    setDraft('');
    clearTimeout(typingStop.current);
    typingSent.current = 0;
    ws.publish(`/app/typing/${issueId}`, { typing: false });
    try {
      const saved = await api.createComment(issueId, body);
      setComments((current) => {
        const list = current ?? [];
        // The WS echo may have landed first; keep a single copy.
        return list.some((comment) => comment.id === saved.id) ? list.filter((comment) => comment.id !== temp.id) : list.map((comment) => (comment.id === temp.id ? saved : comment));
      });
    } catch (err) {
      setComments((current) => (current ?? []).filter((comment) => comment.id !== temp.id));
      setDraft(body);
      toast.error(err instanceof Error ? err.message : 'Couldn’t post your comment');
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (comment: Comment) => {
    const snapshot = comments ?? [];
    setComments(snapshot.filter((candidate) => candidate.id !== comment.id));
    try {
      await api.deleteComment(issueId, comment.id);
    } catch (err) {
      setComments(snapshot);
      toast.error(err instanceof Error ? `${err.message}. The comment is back.` : 'Couldn’t delete. The comment is back.');
    }
  };

  if (!issue) {
    return (
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const othersPresent = present.filter((person) => person.userId !== user?.id);
  const creator = personName(issue.createdBy);

  return (
    <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <LiveRegion message={liveMessage} />

      <div className="min-w-0">
        <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1 rounded text-sm text-graphite hover:text-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {project ? project.name : 'Back to board'}
        </Link>

        {/* Title: click to edit, Enter/blur saves, Esc cancels */}
        <div className="mt-4">
          {editingTitle ? (
            <textarea
              autoFocus
              rows={2}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void commitTitle();
                }
                if (event.key === 'Escape') setEditingTitle(false);
              }}
              aria-label="Issue title"
              maxLength={300}
              className="display-tight w-full resize-none rounded-md border border-ink bg-card px-2 py-1 text-3xl text-ink focus-visible:outline-none sm:text-4xl"
            />
          ) : (
            <h1>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(issue.title);
                  setEditingTitle(true);
                }}
                className="display-tight -mx-2 rounded-md px-2 py-1 text-left text-3xl transition-colors hover:bg-blotter-deep/70 sm:text-4xl"
                title="Click to rename"
              >
                <span key={remoteEdit?.at ?? 'plain'} className={remoteEdit ? 'marker-swipe' : undefined}>
                  {issue.title}
                </span>
              </button>
              {issue.status === 'DONE' && <Stamp key={justDone ? 'slam' : 'rest'} slam={justDone} className="ml-3 translate-y-[-0.35em] align-middle text-2xl" />}
            </h1>
          )}
        </div>

        <AnimatePresence>
          {(remoteEdit || othersPresent.length > 0) && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" role="status">
              {othersPresent.length > 0 && (
                <span className="flex items-center gap-2 text-graphite">
                  <span className="flex -space-x-1.5">
                    {othersPresent.slice(0, 4).map((person) => (
                      <Avatar key={person.userId} name={person.displayName} seed={person.userId} size="xs" ring />
                    ))}
                  </span>
                  {othersPresent.map((person) => firstName(person.displayName)).join(', ')} {othersPresent.length === 1 ? 'is' : 'are'} on this board
                </span>
              )}
              {remoteEdit && (
                <span className="font-semibold" style={{ color: personInk(remoteEdit.seed) }}>
                  {remoteEdit.who} changed this {timeAgo(new Date(remoteEdit.at).toISOString())}
                </span>
              )}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Description */}
        <section aria-labelledby="desc-heading" className="mt-8">
          <h2 id="desc-heading" className="sr-only">
            Description
          </h2>
          {descDraft === null ? (
            <button
              type="button"
              onClick={() => setDescDraft(issue.description ?? '')}
              className="-mx-3 block w-[calc(100%+1.5rem)] rounded-md px-3 py-2.5 text-left text-lg leading-relaxed transition-colors hover:bg-blotter-deep/60"
            >
              {issue.description ? (
                <span className="block max-w-[68ch] whitespace-pre-wrap text-ink-soft">{issue.description}</span>
              ) : (
                <span className="text-graphite">Add a description so the next person knows what done looks like.</span>
              )}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <Textarea
                autoFocus
                value={descDraft}
                onChange={(event) => setDescDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setDescDraft(null);
                }}
                rows={5}
                className="max-w-[72ch] text-lg"
                placeholder="What needs to happen, and how will you know it’s done?"
                aria-label="Description"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => void patchIssue({ description: descDraft }).then(() => setDescDraft(null))}>
                  Save description
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setDescDraft(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Discussion */}
        <section aria-labelledby="discussion-heading" className="mt-12 border-t-2 border-ink pt-5">
          <h2 id="discussion-heading" className="flex items-baseline gap-3">
            <span className="display text-2xl">Discussion</span>
            <Odometer value={comments?.length ?? 0} className="text-graphite" />
          </h2>

          {comments === null ? (
            <Skeleton className="mt-5 h-32 w-full" />
          ) : comments.length === 0 ? (
            <p className="mt-4 text-graphite">No comments yet. Questions, decisions and links go here so they stay with the issue.</p>
          ) : (
            <ol className="mt-5 flex flex-col">
              <AnimatePresence initial={false}>
                {comments.map((comment) => {
                  const author = personName(comment.authorId);
                  const sendingNow = comment.id.startsWith('tmp-');
                  const fresh = freshComments.has(comment.id);
                  return (
                    <motion.li
                      key={comment.id}
                      layout
                      initial={{ opacity: 0, y: 6, backgroundColor: fresh ? 'rgba(228,240,74,0.9)' : 'rgba(228,240,74,0)' }}
                      animate={{ opacity: sendingNow ? 0.6 : 1, y: 0, backgroundColor: 'rgba(228,240,74,0)' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, backgroundColor: { duration: 2.4, ease: 'easeOut' } }}
                      className="group -mx-3 flex gap-3 rounded-md px-3 py-3"
                    >
                      <Avatar name={author} seed={comment.authorId} size="sm" className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-semibold" style={{ color: personInk(comment.authorId) }}>
                            {comment.authorId === user?.id ? 'You' : firstName(author)}
                          </span>
                          <span className="ml-2 text-graphite">{sendingNow ? 'Posting…' : timeAgo(comment.createdAt)}</span>
                        </p>
                        <p className="mt-1 max-w-[68ch] whitespace-pre-wrap leading-relaxed">{comment.body}</p>
                      </div>
                      {comment.authorId === user?.id && !sendingNow && (
                        <button
                          type="button"
                          onClick={() => void deleteComment(comment)}
                          aria-label="Delete your comment"
                          className="self-start rounded p-1 text-graphite opacity-0 transition-opacity hover:bg-alarm-wash hover:text-alarm focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          )}

          <AnimatePresence>
            {Object.keys(typists).length > 0 && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
                aria-live="polite"
              >
                <span className="flex items-center gap-2 py-2 text-sm font-medium" style={{ color: personInk(Object.keys(typists)[0]) }}>
                  <Avatar name={Object.values(typists)[0].name} seed={Object.keys(typists)[0]} size="xs" />
                  {Object.values(typists)
                    .map((typist) => firstName(typist.name))
                    .join(' and ')}{' '}
                  {Object.keys(typists).length === 1 ? 'is' : 'are'} writing
                  <TypingDots />
                </span>
              </motion.p>
            )}
          </AnimatePresence>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendComment();
            }}
            className="mt-4 flex gap-3"
          >
            <Avatar name={(user && knownName(user.id)) ?? user?.name ?? '?'} seed={user?.id} size="sm" className="mt-2" />
            <div className="flex-1">
              <Textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (event.target.value.trim()) signalTyping();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void sendComment();
                  }
                }}
                rows={2}
                placeholder="Add to the discussion"
                aria-label="Comment"
                maxLength={2000}
                className="resize-y"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="hidden items-center gap-1 text-xs text-graphite sm:flex">
                  <Kbd>Ctrl</Kbd>
                  <Kbd>Enter</Kbd>
                  <span className="ml-1">to post</span>
                </span>
                <Button type="submit" variant="primary" size="sm" disabled={!draft.trim() || sending} className="ml-auto">
                  Post comment
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>

      {/* Rail */}
      <aside aria-label="Issue properties" className="lg:sticky lg:top-24 lg:self-start">
        <div className="paper flex flex-col gap-6 p-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Status</h2>
            <Segmented
              vertical
              label="Status"
              options={STATUSES}
              value={issue.status}
              onChange={(status) => void patchIssue({ status })}
              tone={(status) => STATUS_INK[status]}
              render={(status, selected) => (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selected ? '#FBFCF8' : STATUS_INK[status] }} aria-hidden="true" />
                  {STATUS_LABEL[status]}
                </span>
              )}
            />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Priority</h2>
            <Segmented
              vertical
              label="Priority"
              options={PRIORITIES}
              value={issue.priority}
              onChange={(priority: Priority) => void patchIssue({ priority })}
              render={(priority, selected) => (
                <span className="flex items-center gap-2">
                  <PriorityMark priority={priority} showLabel={false} inverse={selected} />
                  {PRIORITY_LABEL[priority]}
                </span>
              )}
            />
          </div>
          {directory.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Assignee</h2>
              <Segmented
                vertical
                label="Assignee"
                options={['NONE', ...directory.map((person) => person.id)]}
                value={issue.assigneeId ?? 'NONE'}
                onChange={(value) => void patchIssue(value === 'NONE' ? { clearAssignee: true } : { assigneeId: value })}
                render={(value) =>
                  value === 'NONE' ? (
                    <span className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-full border border-dashed border-current opacity-60" aria-hidden="true" />
                      Nobody yet
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Avatar name={personName(value)} seed={value} size="xs" />
                      {value === user?.id ? `${firstName(personName(value))} (you)` : firstName(personName(value))}
                    </span>
                  )
                }
              />
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-rule/70 pt-4 text-sm">
            <dt className="text-graphite">Opened by</dt>
            <dd className="flex items-center gap-1.5">
              <Avatar name={creator} seed={issue.createdBy} size="xs" />
              {firstName(creator)}
            </dd>
            <dt className="text-graphite">Opened</dt>
            <dd>{formatDate(issue.createdAt)}</dd>
            <dt className="text-graphite">Updated</dt>
            <dd>{timeAgo(issue.updatedAt)}</dd>
            <dt className="text-graphite">Revision</dt>
            <dd className="font-mono" title="Every save is checked against this number, so two people editing at once can’t overwrite each other.">
              {issue.version}
            </dd>
          </dl>
        </div>
        <p className={cn('mt-3 px-1 text-xs leading-relaxed text-graphite')}>
          If a teammate saves first, your change is undone and theirs is shown, so nothing is lost silently.
        </p>
      </aside>
    </div>
  );
}
