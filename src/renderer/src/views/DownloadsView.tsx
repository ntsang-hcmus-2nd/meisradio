import { DownloadsView as BaseDownloadsView } from '../components/DownloadsView'
import { useSoulseekStore } from '../stores/soulseekStore'

/**
 * Action clears completed/failed/cancelled downloads via soulseekClearCompletedDownloads IPC API
 * and syncs remaining downloads to the soulseek store.
 */
export const soulseekClearCompletedDownloads = async (): Promise<any> => {
  try {
    if ((window as any).api?.soulseekClearCompletedDownloads) {
      const remaining = await (window as any).api.soulseekClearCompletedDownloads()
      if (Array.isArray(remaining)) {
        useSoulseekStore.getState().setDownloads(remaining)
        return remaining
      }
    }
  } catch (err) {
    console.error('[DownloadsView] Error clearing completed downloads via API:', err)
  }
  useSoulseekStore.getState().clearCompletedDownloads()
  return undefined
}

export const DownloadsView = BaseDownloadsView
export default DownloadsView
