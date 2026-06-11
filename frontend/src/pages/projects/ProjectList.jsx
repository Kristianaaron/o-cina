import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listProjects, createProject, deleteProject } from '../../api/projects'

const TAG_COLORS = [
  'bg-blue-500/20 text-blue-400',
  'bg-purple-500/20 text-purple-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-amber-500/20 text-amber-400',
  'bg-rose-500/20 text-rose-400',
  'bg-cyan-500/20 text-cyan-400',
]

function Tag({ tag, index }) {
  const color = TAG_COLORS[index % TAG_COLORS.length]
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-mono ${color}`}>
      {tag}
    </span>
  )
}

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', description: '', tags: '' })

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

  useEffect(() => { fetchProjects() }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    fetchProjects(search)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      await createProject({
        name: form.name.trim(),
        description: form.description.trim() || null,
        tags,
      })
      setForm({ name: '', description: '', tags: '' })
      setShowCreate(false)
      fetchProjects()
    } catch (e) {
      setError(e.message)
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

  const timeAgo = (ts) => {
    if (!ts) return ''
    const diff = Date.now() / 1000 - ts
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Projects</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Workspaces with sessions, memory, and agent assignments
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-medium rounded hover:bg-white transition-colors"
        >
          + New Project
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
        />
        <button type="submit" className="px-4 py-2 text-sm border border-zinc-700 rounded hover:border-zinc-600 transition-colors">
          Search
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm rounded">
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded p-5 space-y-4">
          <h2 className="font-mono text-lg">New Project</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 font-mono">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Project"
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-700"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 font-mono">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 font-mono">Tags (comma-separated)</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="coding, research, deployment"
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-medium rounded hover:bg-white transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      {loading ? (
        <div className="text-zinc-500 font-mono text-sm">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <p className="font-mono">No projects yet.</p>
          <p className="text-sm mt-1">Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-zinc-900/50 border border-zinc-800 rounded p-5 hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-start justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <h3 className="font-mono font-medium text-lg">{p.name}</h3>
                  {p.description && (
                    <p className="text-zinc-500 text-sm mt-1 line-clamp-2">{p.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm px-2"
                >
                  ×
                </button>
              </div>
              {p.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.tags.map((tag, i) => (
                    <Tag key={i} tag={tag} index={i} />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-4 text-xs text-zinc-600 font-mono">
                <span>Created {timeAgo(p.created_at)}</span>
                <span className="text-zinc-800">|</span>
                <span onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer text-zinc-500 hover:text-zinc-400">
                  Open →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
