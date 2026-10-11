import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { fetchAgents } from './store/agentsSlice'

/** Refresh agent list; skip ticks while the tab is hidden. */
export function useAgentPoll(intervalMs = 12000) {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(fetchAgents({}))
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      dispatch(fetchAgents({}))
    }
    const id = setInterval(tick, intervalMs)
    const onVis = () => {
      if (!document.hidden) dispatch(fetchAgents({}))
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [dispatch, intervalMs])
}
