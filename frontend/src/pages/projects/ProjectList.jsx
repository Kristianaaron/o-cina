import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listProjects, createProject, deleteProject } from '../../api/projects'
import { IconAdd, IconProjects, IconTrash } from '../../components/icons'
import { plural, timeAgo } from '../../lib/format'
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Notice,
  PageHeader,
  Surface,
  Tag,
  Textarea,
  inputClass,
} from '../../components/ui'

const EMPTY_FORM = { name: '', description: '', tags: '' }

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  const fetchProjects = async (searchQuery = '') => {
    try {
      setLoading(true)
      const params = searchQuery ? { search: searchQuery } : {}
      const data = await listProjects(params)
      setProjects(data.projects || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Initial load, then debounced search as you type
  useEffect(() => {
    const t = setTimeout(() => fetchProjects(search), search ? 250 : 0)
    return () => clearTimeout(t)
  }, [search])

  const handleCreate = async (e) => {
    e?.preventDefault()
    if (!form.name.trim()) return
    try {
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean)
      await createProject({
        name: form.name.trim(),
        description: form.description.trim() || null,
        tags,
      })
      setForm(EMPTY_FORM)
      setShowCreate(false)
      fetchProjects(search)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this project and all its data?')) return
    try {
      await deleteProject(id)
      fetchProjects(search)
    } catch (e) {
      setError(e.message)
    }
  }

  const open = (id) => navigate(`/projects/${id}`)

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${plural(projects.length, 'project')} · sessions and shared semantic memory`}
        actions={(
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <IconAdd className="h-3.5 w-3.5" />
            New project
          </Button>
        )}
      />

      <div className="mb-6">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className={`${inputClass} h-8 w-full py-0 text-xs sm:w-64`}
        />
      </div>

      {error && <div className="mb-6"><Notice onDismiss={() => setError(null)}>{error}</Notice></div>}

      <Modal
        open={showCreate}
        title="New project"
        description="A project holds sessions and a memory bank agents can recall from."
        onClose={() => setShowCreate(false)}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate} disabled={!form.name.trim()}>Create</Button>
          </>
        )}
      >
        <form className="space-y-4" onSubmit={handleCreate}>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My project"
              autoFocus
            />
          </Field>
          <Field label="Description" hint="optional">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </Field>
          <Field label="Tags" hint="comma-separated">
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="coding, research"
            />
          </Field>
          <button type="submit" hidden />
        </form>
      </Modal>

      {loading && projects.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1].map((i) => <Surface key={i} className="h-36 animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={IconProjects}
          title={search ? 'No projects match' : 'No projects yet'}
          body="Projects give agents a shared, semantically indexed memory bank."
          action={!search && <Button variant="primary" onClick={() => setShowCreate(true)}>New project</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <Surface
              key={p.id}
              interactive
              role="button"
              tabIndex={0}
              onClick={() => open(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  open(p.id)
                }
              }}
              className="group flex min-h-[9rem] flex-col p-5"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-mono text-sm font-semibold text-zinc-50">{p.name}</h3>
                  <p className="mt-1 line-clamp-2 text-[13px] text-zinc-500">{p.description || 'No description'}</p>
                </div>
                <IconButton
                  label={`Delete ${p.name}`}
                  size="sm"
                  className="-mr-1.5 -mt-1 opacity-0 hover:!text-red-300 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(p.id)
                  }}
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </IconButton>
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                <div className="flex min-w-0 flex-wrap gap-1">
                  {p.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                </div>
                <span className="shrink-0 font-mono text-[10px] text-zinc-600">{timeAgo(p.created_at)}</span>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  )
}
