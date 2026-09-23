import { isListId, projectIdOf, type ListId } from './lists'

/** URL of a task list: /tasks/today, /tasks/project/<id>. */
export function listPath(list: ListId, taskId?: string) {
  const projectId = projectIdOf(list)
  const base = projectId ? `/tasks/project/${projectId}` : `/tasks/${list}`
  return taskId ? `${base}?task=${taskId}` : base
}

/** Inverse of `listPath` for the router params. Unknown input falls back to Today. */
export function listFromParams(list?: string, projectId?: string): ListId {
  if (list === 'project' && projectId) return `project:${projectId}`
  return isListId(list) && !list.startsWith('project:') ? list : 'today'
}
