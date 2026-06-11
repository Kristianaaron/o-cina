import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../api/agents'

// ── Async thunks ────────────────────────────────────────────────────────────

export const fetchAgents = createAsyncThunk(
  'agents/fetchAgents',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await api.listAgents(params)
    } catch (e) {
      return rejectWithValue(e.message)
    }
  }
)

export const fetchAgent = createAsyncThunk(
  'agents/fetchAgent',
  async (id, { rejectWithValue }) => {
    try {
      return await api.getAgent(id)
    } catch (e) {
      return rejectWithValue(e.message)
    }
  }
)

export const registerAgent = createAsyncThunk(
  'agents/registerAgent',
  async (data, { rejectWithValue }) => {
    try {
      return await api.registerAgent(data)
    } catch (e) {
      return rejectWithValue(e.message)
    }
  }
)

export const startAgent = createAsyncThunk(
  'agents/startAgent',
  async (id, { rejectWithValue }) => {
    try {
      return await api.startAgent(id)
    } catch (e) {
      return rejectWithValue(e.message)
    }
  }
)

export const stopAgent = createAsyncThunk(
  'agents/stopAgent',
  async (id, { rejectWithValue }) => {
    try {
      return await api.stopAgent(id)
    } catch (e) {
      return rejectWithValue(e.message)
    }
  }
)

export const restartAgent = createAsyncThunk(
  'agents/restartAgent',
  async (id, { rejectWithValue }) => {
    try {
      return await api.restartAgent(id)
    } catch (e) {
      return rejectWithValue(e.message)
    }
  }
)

export const deleteAgent = createAsyncThunk(
  'agents/deleteAgent',
  async (id, { rejectWithValue }) => {
    try {
      await api.deleteAgent(id)
      return id
    } catch (e) {
      return rejectWithValue(e.message)
    }
  }
)

export const fetchAgentMetrics = createAsyncThunk(
  'agents/fetchAgentMetrics',
  async (id, { rejectWithValue }) => {
    try {
      return await api.getAgentMetrics(id)
    } catch (e) {
      return rejectWithValue(e.message)
    }
  }
)

export const fetchAgentLogs = createAsyncThunk(
  'agents/fetchAgentLogs',
  async (id, { rejectWithValue }) => {
    try {
      return await api.getAgentLogs(id, 200)
    } catch (e) {
      return rejectWithValue(e.message)
    }
  }
)

// ── Slice ───────────────────────────────────────────────────────────────────

const agentsSlice = createSlice({
  name: 'agents',
  initialState: {
    list: [],
    total: 0,
    selected: null,
    metrics: null,
    logs: '',
    loading: false,
    filters: {},
    error: null,
    actionInProgress: null, // 'starting' | 'stopping' | 'restarting' | 'deleting'
  },
  reducers: {
    setFilters: (state, action) => {
      state.filters = action.payload
    },
    clearSelected: (state) => {
      state.selected = null
      state.metrics = null
      state.logs = ''
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchAgents
      .addCase(fetchAgents.pending, (state) => { state.loading = true; state.error = null })
      .addCase(fetchAgents.fulfilled, (state, action) => {
        state.loading = false
        state.list = action.payload.agents || []
        state.total = action.payload.total || 0
      })
      .addCase(fetchAgents.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // fetchAgent
      .addCase(fetchAgent.fulfilled, (state, action) => {
        state.selected = action.payload
        // Also update in list
        const idx = state.list.findIndex(a => a.id === action.payload.id)
        if (idx >= 0) state.list[idx] = action.payload
      })
      // registerAgent
      .addCase(registerAgent.fulfilled, (state, action) => {
        state.list.push(action.payload)
        state.total = state.list.length
      })
      // start/stop/restart/delete — update status in list
      .addCase(startAgent.pending, (state, action) => { state.actionInProgress = 'starting' })
      .addCase(startAgent.fulfilled, (state, action) => {
        state.actionInProgress = null
        const idx = state.list.findIndex(a => a.id === action.meta.arg)
        if (idx >= 0) {
          state.list[idx].status = 'running'
          state.list[idx].pid = action.payload.pid
        }
        if (state.selected?.id === action.meta.arg) {
          state.selected.status = 'running'
          state.selected.pid = action.payload.pid
        }
      })
      .addCase(startAgent.rejected, (state) => { state.actionInProgress = null })

      .addCase(stopAgent.pending, (state) => { state.actionInProgress = 'stopping' })
      .addCase(stopAgent.fulfilled, (state, action) => {
        state.actionInProgress = null
        const idx = state.list.findIndex(a => a.id === action.meta.arg)
        if (idx >= 0) {
          state.list[idx].status = 'stopped'
          state.list[idx].pid = null
        }
        if (state.selected?.id === action.meta.arg) {
          state.selected.status = 'stopped'
          state.selected.pid = null
        }
      })
      .addCase(stopAgent.rejected, (state) => { state.actionInProgress = null })

      .addCase(restartAgent.fulfilled, (state, action) => {
        const idx = state.list.findIndex(a => a.id === action.meta.arg)
        if (idx >= 0) state.list[idx].status = 'running'
        if (state.selected?.id === action.meta.arg) state.selected.status = 'running'
      })

      .addCase(deleteAgent.fulfilled, (state, action) => {
        state.list = state.list.filter(a => a.id !== action.payload)
        state.total = state.list.length
      })

      // metrics
      .addCase(fetchAgentMetrics.fulfilled, (state, action) => {
        state.metrics = action.payload
      })

      // logs
      .addCase(fetchAgentLogs.fulfilled, (state, action) => {
        state.logs = action.payload?.log || ''
      })
  },
})

export const { setFilters, clearSelected } = agentsSlice.actions
export default agentsSlice.reducer
