// Issue detail: inline editing with optimistic rollback, live comment thread
// over WebSockets, presence, and server-truth reconciliation on 409s.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, Pencil, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ws } from '../lib/ws';
import type { Comment, CommentEvent, Issue, IssueEvent, PresenceEvent, PresenceUser, Priority } from '../lib/types';
import { cn, timeAgo } from '../lib/utils';
import { Avatar, Button, Input, LiveRegion, PriorityChip, Select, Skeleton, StatusBadge } from '../components/ui';

export function IssueDetail() {
  const { projectId = '', issueId = '' } = useParams();
  const { user } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [present, setPresent] = useState<PresenceUser[]>([]);
  const [liveMessage, setLiveMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState<string | null>(null);

  const pendingRef = useRef(new Set<string>());
  const issueRef = useRef<Issue | null>(null);
  issueRef.current = issue;

  const announce = useCallback((message: string) => setLiveMessage(`${message} — ${new Date().toLocaleTimeString()}`), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [issueData, commentList] = await Promise.all([api.getIssue(projectId, issueId), api.listComments(issueId)]);
        if (cancelled) return;
        setIssue(issueData);
        setComments(commentList);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load issue');
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
      setIssue((current) => {
        if (!current || event.data.version <= current.version) return current;
        announce(`Issue updated by a teammate: ${event.data.title}`);
        return event.data;
      });
    });
    const unsubComments = ws.subscribe<CommentEvent>(`/topic/issues/${issueId}/comments`, (event) => {
      if (event.type === 'CREATED') {
        setComments((current) => (current?.some((comment) => comment.id === event.data.id) ? current : [...(current ?? []), event.data]));
        if (event.data.authorId !== user.id) announce(`New comment from ${nameOf(event.data.authorId)}`);
      } else {
        setComments((current) => (current ?? []).filter((comment) => comment.id !== event.commentId));
      }
    });
    const unsubPresence = ws.subscribe<PresenceEvent>(`/topic/presence/${projectId}`, (event) => setPresent(event.users));

    ws.publish(`/app/presence/${projectId}/join`, {});
    return () => {
      ws.publish(`/app/presence/${projectId}/leave`, {});
      unsubIssues();
      unsubComments();
      unsubPresence();
    };
  }, [projectId, issueId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = useCallback(
    (id: string) => (id === user?.id ? user.name : id.startsWith('00000000-0000-0000-0000-000000000002') ? 'Bob Member' : id.startsWith('00000000-0000-0000-0000-000000000001') ? 'Alice Admin' : 'Teammate'),
    [user],
  );

  /** Optimistic patch: snapshot, apply locally, PATCH, reconcile; roll back on error. */
  const patchIssue = useCallback(
    async (patch: Partial<Pick<Issue, 'title' | 'description' | 'status' | 'priority'>>) => {
      const current = issueRef.current;
      if (!current) return;
      const snapshot = current;
      pendingRef.current.add(issueId);
      setIssue({ ...current, ...patch });
      try {
        const updated = await api.updateIssue(projectId, issueId, { ...patch, version: snapshot.version });
        setIssue(updated);
      } catch (err) {
        setIssue(snapshot);
        toast.error(err instanceof Error ? err.message : 'Save failed — rolled back');
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
    if (!body) return;
    setSending(true);
    // Optimistic: temp comment renders instantly, replaced by server truth.
    const temp: Comment = {
      id: `tmp-${Date.now()}`,
      issueId,
      authorId: user?.id ?? '',
      body,
      createdAt: new Date().toISOString(),
      version: 0,
    };
    setComments((current) => [...(current ?? []), temp]);
    setDraft('');
    try {
      const saved = await api.createComment(issueId, body);
      setComments((current) => (current ?? []).map((comment) => (comment.id === temp.id ? saved : comment)));
    } catch (err) {
      setComments((current) => (current ?? []).filter((comment) => comment.id !== temp.id));
      setDraft(body);
      toast.error(err instanceof Error ? err.message : 'Comment failed');
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
      toast.error(err instanceof Error ? err.message : 'Delete failed — restored');
    }
  };

  if (!issue) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const othersPresent = present.filter((person) => person.userId !== user?.id);

  return (
    <div className="flex flex-col gap-6">
      <LiveRegion message={liveMessage} />

      <Link to={`/projects/${projectId}`} className="inline-flex w-fit items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-300">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to board
      </Link>

      {othersPresent.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400" role="status">
          <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400" aria-hidden="true" />
          {othersPresent.map((person) => person.displayName).join(', ')} {othersPresent.length === 1 ? 'is' : 'are'} viewing this issue
        </div>
      )}

      <motion.article initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="glass-strong p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <PriorityChip priority={issue.priority} />
          <StatusBadge status={issue.status} />
          <span className="ml-auto font-mono text-[11px] text-slate-600">
            {issue.id.slice(0, 8)} · v{issue.version} · updated {timeAgo(issue.updatedAt)}
          </span>
        </div>

        {/* Title: click to edit, Enter/blur commits, Esc cancels */}
        {editingTitle ? (
          <Input
            autoFocus
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void commitTitle();
              if (event.key === 'Escape') setEditingTitle(false);
            }}
            aria-label="Issue title"
            className="mb-2 font-display text-2xl font-semibold"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setTitleDraft(issue.title);
              setEditingTitle(true);
            }}
            className="group mb-2 flex w-full items-start gap-2 text-left"
            aria-label={`Edit title: ${issue.title}`}
          >
            <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{issue.title}</h1>
            <Pencil className="mt-1.5 h-4 w-4 shrink-0 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </button>
        )}

        <div className="mb-5 flex flex-wrap gap-3">
          <Select value={issue.status} onChange={(event) => void patchIssue({ status: event.target.value as Issue['status'] })} aria-label="Status">
            {['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'].map((status) => (
              <option key={status} value={status}>
                {status.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
          <Select value={issue.priority} onChange={(event) => void patchIssue({ priority: event.target.value as Priority })} aria-label="Priority">
            {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
        </div>

        {/* Description */}
        <section aria-label="Description">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Description</h2>
          {descDraft === null ? (
            <button
              type="button"
              onClick={() => setDescDraft(issue.description ?? '')}
              className="block w-full rounded-xl border border-transparent px-3 py-2.5 text-left text-sm text-slate-300 transition-colors hover:border-white/10 hover:bg-white/[0.03]"
            >
              {issue.description || <span className="text-slate-600">Add a description…</span>}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                autoFocus
                value={descDraft}
                onChange={(event) => setDescDraft(event.target.value)}
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-ink-900/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/60"
                placeholder="What is this issue about?"
                aria-label="Description"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void patchIssue({ description: descDraft }).then(() => setDescDraft(null))} icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDescDraft(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>
      </motion.article>

      {/* Comments */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.08 }} className="glass p-6" aria-label="Comments">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          Discussion
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400">{comments?.length ?? 0}</span>
        </h2>

        {comments === null ? (
          <Skeleton className="h-32 w-full" />
        ) : comments.length === 0 ? (
          <p className="mb-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">No comments yet — start the thread.</p>
        ) : (
          <ul className="mb-5 flex flex-col gap-1">
            {comments.map((comment) => (
              <motion.li
                key={comment.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('group flex gap-3 rounded-xl p-3 transition-colors hover:bg-white/[0.03]', comment.id.startsWith('tmp-') && 'opacity-60')}
              >
                <Avatar name={nameOf(comment.authorId)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">
                    <span className="font-medium text-slate-300">{nameOf(comment.authorId)}</span> · {timeAgo(comment.createdAt)}
                    {comment.id.startsWith('tmp-') && <span className="ml-1.5 text-indigo-300">sending…</span>}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-200">{comment.body}</p>
                </div>
                {comment.authorId === user?.id && !comment.id.startsWith('tmp-') && (
                  <button
                    type="button"
                    onClick={() => void deleteComment(comment)}
                    aria-label="Delete comment"
                    className="rounded-md p-1 text-slate-600 opacity-0 transition-all hover:bg-rose-400/10 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </motion.li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sendComment();
          }}
          className="flex gap-2"
        >
          <Avatar name={user?.name ?? '?'} size="sm" className="mt-1" />
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a comment…" aria-label="Comment" maxLength={2000} />
          <Button type="submit" loading={sending} disabled={!draft.trim()} aria-label="Send comment" icon={<Send className="h-4 w-4" aria-hidden="true" />}>
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </motion.section>
    </div>
  );
}
