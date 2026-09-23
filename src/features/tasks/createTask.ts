import { addDays, projectsRepo, tagsRepo, tasksRepo, type Project, type Tag } from '@/data'
import { projectIdOf, type ListId } from './lists'
import { normalizeName, type ParsedTask } from './quickAddParser'

export function findProject(projects: Project[], name: string) {
  const key = normalizeName(name)
  return (
    projects.find((p) => normalizeName(p.name) === key) ??
    projects.find((p) => normalizeName(p.name).startsWith(key))
  )
}

export const findTag = (tags: Tag[], name: string) =>
  tags.find((t) => normalizeName(t.name) === normalizeName(name))

/**
 * Creates a task from quick-add input. Unknown `#project` / `@tag` names are created on the
 * fly. The current list supplies defaults: its project, or today/tomorrow for date lists.
 */
export async function createFromQuickAdd(
  parsed: ParsedTask,
  ctx: { list: ListId; projects: Project[]; tags: Tag[]; today: ReturnType<typeof addDays> },
) {
  if (!parsed.title) return undefined

  let projectId = projectIdOf(ctx.list)
  if (parsed.projectName) {
    projectId =
      findProject(ctx.projects, parsed.projectName)?.id ??
      (await projectsRepo.create({ name: parsed.projectName })).id
  }

  const tagIds: string[] = []
  for (const name of parsed.tagNames) {
    tagIds.push(findTag(ctx.tags, name)?.id ?? (await tagsRepo.create({ name })).id)
  }

  const listDefaultDay =
    ctx.list === 'today' ? ctx.today : ctx.list === 'upcoming' ? addDays(ctx.today, 1) : undefined

  return tasksRepo.create({
    title: parsed.title,
    projectId,
    tagIds,
    priority: parsed.priority,
    estimateMin: parsed.estimateMin,
    plannedDate: parsed.plannedDate ?? listDefaultDay,
    dueDate: parsed.dueDate,
  })
}
