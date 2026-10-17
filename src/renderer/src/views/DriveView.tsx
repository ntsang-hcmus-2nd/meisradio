import React from 'react'
import { Cloud, Search, Wifi, Download, ListMusic } from 'lucide-react'
import { useSettingsStore, useLibraryStore, useUIStore } from '../stores'
import { useTranslation, useLanguage } from '../locales'

interface DriveViewProps {
  loadLibrary: () => void
  processedLibraryTracks?: any[]
  /** Stream All: đẩy cả folder Drive vào hàng đợi phát trực tuyến (KHÔNG động vào libraryTracks) */
  onStreamAll?: (tracks: any[]) => void
  showAlert: (options: {
    title?: string
    message: string | React.ReactNode
    confirmText?: string
    onConfirm?: () => void
  }) => void
}

export function DriveView({ loadLibrary, processedLibraryTracks = [], onStreamAll, showAlert }: DriveViewProps) {
  const { t } = useTranslation()
  const { language } = useLanguage()

  const {
    driveLink,
    setDriveLink,
    isFetchingDrive,
    setIsFetchingDrive,
    driveFiles,
    setDriveFiles,
    setCloudActionTrack,
    isDownloading,
    setIsDownloading,
    setDownloadProgress
  } = useSettingsStore()

  const { libraryPath, searchQuery } = useLibraryStore()
  const showToast = useUIStore((s) => s.showToast)

  const handleDriveSubmit = async () => {
    const match = driveLink.match(/folders\/([-\w]+)/) || driveLink.match(/id=([-\w]+)/)
    if (!match) {
      showAlert({
        title: t('common.warning'),
        message:
          language === 'vi'
            ? 'Vui lòng nhập liên kết thư mục Google Drive hợp lệ!'
            : 'Please enter a valid Google Drive folder link!'
      })
      return
    }
    setIsFetchingDrive(true)
    try {
      const folderId = match[1]
      // @ts-ignore
      const result = await window.api?.fetchDriveFiles?.(folderId)
      if (result?.success) {
        if (result.tracks.length === 0)
          showAlert({
            title: t('common.notice'),
            message:
              language === 'vi'
                ? 'Không tìm thấy tệp âm thanh nào. Hãy đảm bảo thư mục đã bật "Bất kỳ ai có liên kết"!'
                : 'No audio files found. Please ensure the folder is shared with "Anyone with the link"!'
          })
        else setDriveFiles(result.tracks)
      } else {
        showAlert({
          title: t('common.error'),
          message: (language === 'vi' ? 'Lỗi từ hệ thống: ' : 'System error: ') + (result?.error || 'Unknown')
        })
      }
    } catch (err) {
      showAlert({
        title: t('common.error'),
        message: language === 'vi' ? 'Lỗi kết nối tới hệ thống!' : 'Failed to connect to system!'
      })
    }
    setIsFetchingDrive(false)
  }

  const handleDriveStream = () => {
    if (driveFiles.length === 0) return
    // KHÔNG nối tạm file Drive vào libraryTracks — chỉ đẩy vào hàng đợi phát trực tuyến,
    // giữ thư viện chính sạch (không còn bài "ma" khi quét lại hoặc danh sách thư mục khác nhau)
    onStreamAll?.(driveFiles)
    showToast(
      language === 'vi'
        ? `Đang phát trực tuyến ${driveFiles.length} tệp từ Google Drive...`
        : `Streaming ${driveFiles.length} files from Google Drive...`,
      'success'
    )
  }

  const handleDriveDownload = async () => {
    if (!libraryPath) {
      showToast(t('toasts.setLibraryFirst'), 'error')
      return
    }
    setIsDownloading(true)
    setDownloadProgress({ current: 0, total: driveFiles.length, fileName: t('common.loading') })
    try {
      // @ts-ignore
      const result = await window.api?.downloadMultipleFiles?.(driveFiles, processedLibraryTracks)
      if (result?.success) {
        if (result.tracks.length > 0) {
          showToast(t('toasts.driveDownloadFinished', { count: result.tracks.length }), 'success')
          loadLibrary()
        }
      } else {
        showToast(t('toasts.systemError') + (result?.error || ''), 'error')
      }
    } catch (e) {
      showToast(t('toasts.downloadError'), 'error')
    }
    setIsDownloading(false)
    setDownloadProgress(null)
  }

  const lowerQuery = searchQuery.toLowerCase()
  const filteredDriveFiles = searchQuery
    ? driveFiles.filter((f) => f.title.toLowerCase().includes(lowerQuery))
    : driveFiles

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-3 text-white">
          <Cloud className="text-theme-10" /> {t('driveView.title')}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{t('driveView.desc')}</p>
      </div>

      {/* Input box link drive */}
      <div className="bg-theme-60/40 border border-theme-30/70 rounded-xl p-5 mb-8 shadow-sm">
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          {t('driveView.folderLink')}
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder={t('driveView.folderLinkPlaceholder')}
            value={driveLink}
            onChange={(e) => setDriveLink(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDriveSubmit()}
            className="flex-1 bg-theme-60/60 border border-theme-30/80 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-theme-10 placeholder-zinc-500 transition"
          />
          <button
            onClick={handleDriveSubmit}
            disabled={!driveLink || isFetchingDrive}
            title={t('driveView.scanData')}
            className="sys-btn bg-theme-10 hover:bg-theme-10 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {isFetchingDrive ? (
              <span className="animate-pulse">{t('driveView.scanning')}</span>
            ) : (
              <>
                <Search size={15} />
                <span className="btn-text">{t('driveView.scanData')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Kết quả / Danh sách file đã tìm thấy */}
      <div className="flex-1 flex flex-col bg-theme-60/30 border border-theme-30/50 rounded-xl p-6 min-h-[300px]">
        {driveFiles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
            <Cloud size={56} className="mb-4 opacity-20" />
            <p className="text-lg">{t('driveView.emptyTitle')}</p>
            <p className="text-sm mt-1">{t('driveView.emptyDesc')}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-theme-30/50">
              <h3 className="font-bold text-white">
                {searchQuery
                  ? t('driveView.foundResults', {
                      count: filteredDriveFiles.length,
                      query: searchQuery
                    })
                  : t('driveView.foundAudioFiles', {
                      count: driveFiles.length
                    })}
              </h3>
              <div className="flex gap-3">
                <button
                  onClick={handleDriveStream}
                  title={t('driveView.streamAll')}
                  className="sys-btn flex items-center gap-2 bg-theme-10/10 text-theme-10 hover:bg-theme-10/20 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer"
                >
                  <Wifi size={16} />{' '}
                  <span className="btn-text">{t('driveView.streamAll')}</span>
                </button>
                <button
                  onClick={handleDriveDownload}
                  disabled={isDownloading}
                  title={t('driveView.downloadLossless')}
                  className="sys-btn flex items-center gap-2 bg-theme-30 text-white hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 cursor-pointer"
                >
                  {isDownloading ? (
                    <span className="animate-pulse">{t('common.loading')}</span>
                  ) : (
                    <>
                      <Download size={16} />{' '}
                      <span className="btn-text">
                        {t('driveView.downloadLossless')}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto pr-2">
              {filteredDriveFiles.length === 0 ? (
                <p className="text-zinc-500 text-center mt-10">
                  {t('songsView.noSongsMatched', { query: searchQuery })}
                </p>
              ) : (
                filteredDriveFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 p-3 bg-theme-60/40 hover:bg-theme-30/80 rounded-lg border border-theme-30/50 transition"
                  >
                    <div className="w-10 h-10 bg-theme-30 rounded flex items-center justify-center flex-shrink-0 text-theme-10">
                      <ListMusic size={18} />
                    </div>
                    <div className="flex-1 truncate">
                      <p className="font-semibold text-white truncate text-sm">
                        {f.title}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {t('driveView.originalFormat')}:{' '}
                        <span className="text-theme-10/80 uppercase">
                          {f.format}
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={() => setCloudActionTrack(f)}
                      className="px-3 py-1.5 bg-theme-30 hover:bg-zinc-700 rounded text-xs text-zinc-300 font-medium transition cursor-pointer"
                    >
                      {t('common.options')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
export default DriveView
