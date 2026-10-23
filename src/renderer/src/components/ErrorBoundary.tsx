import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="fixed inset-0 bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 z-[9999] select-none">
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 max-w-lg w-full flex flex-col items-center text-center shadow-2xl backdrop-blur-xl animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-5">
              <AlertTriangle size={28} />
            </div>
            <h2 className="text-xl font-bold mb-2">Đã xảy ra sự cố giao diện</h2>
            <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
              Ứng dụng phát hiện lỗi trong quá trình hiển thị. Bạn có thể thử khôi phục lại màn hình
              hoặc tải lại ứng dụng.
            </p>
            {this.state.error?.message && (
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-left font-mono text-xs text-red-400/90 overflow-x-auto mb-6 max-h-32">
                {this.state.error.message}
              </div>
            )}
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition cursor-pointer"
              >
                Thử lại
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-theme-10 hover:brightness-110 text-white text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-theme-10/20"
              >
                <RefreshCw size={16} />
                <span>Tải lại</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
