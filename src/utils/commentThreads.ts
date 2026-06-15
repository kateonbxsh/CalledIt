type ThreadableComment = {
  id: string;
  parentCommentId?: string | null;
  replyTo?: { id: string } | null;
};

export interface CommentThread<T> {
  root: T;
  replies: T[];
}

export function buildCommentThreads<T extends ThreadableComment>(comments: T[]): CommentThread<T>[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const rootIdFor = (comment: T) => {
    let parentId = comment.parentCommentId ?? comment.replyTo?.id ?? null;
    const visited = new Set([comment.id]);
    while (parentId && byId.has(parentId) && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = byId.get(parentId)!;
      const nextParentId = parent.parentCommentId ?? parent.replyTo?.id ?? null;
      if (!nextParentId || !byId.has(nextParentId)) return parent.id;
      parentId = nextParentId;
    }
    return parentId && byId.has(parentId) ? parentId : null;
  };

  const roots: T[] = [];
  const repliesByRoot = new Map<string, T[]>();
  comments.forEach((comment) => {
    const rootId = rootIdFor(comment);
    if (!rootId || rootId === comment.id) {
      roots.push(comment);
      return;
    }
    repliesByRoot.set(rootId, [...(repliesByRoot.get(rootId) ?? []), comment]);
  });

  return roots.map((root) => ({
    root,
    replies: repliesByRoot.get(root.id) ?? [],
  }));
}
