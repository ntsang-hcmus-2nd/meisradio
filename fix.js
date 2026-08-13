const fs = require('fs');
let content = fs.readFileSync('src/renderer/src/App.tsx', 'utf8');

const brokenBlock = `                    <div className="border-t border-zinc-800 pt-6 mt-6">
                          <span>15k</span>
                          <span>10k</span>
                          <span>5k</span>
                          <span>1k</span>
                          <span>0Hz</span>
                        </div>

                        {/* LỚP PHỦ TRỤC X: HIỂN THỊ THỜI GIAN (Giây) */}
                        <div className="absolute bottom-0 left-12 right-0 h-6 bg-zinc-950/90 border-t border-zinc-800 flex items-center justify-between px-4 text-[10px] text-zinc-400 font-mono z-10 pointer-events-none">
                          <span>-10s</span>
                          <span>-7.5s</span>
                          <span>-5s</span>
                          <span>-2.5s</span>
                          <span className="text-emerald-500 font-bold">Hiện tại (0s)</span>
                        </div>

                        {/* CANVAS VẼ PHỔ (Lùi vào để nhường chỗ cho Trục X/Y) */}
                        <div className="absolute top-0 left-12 right-0 bottom-6 z-0">
                          <canvas ref={spectrogramCanvasRef} width={1024} height={276} className="w-full h-full" />
                        </div>

                        {!isPlaying && (
                          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <span className="text-zinc-400 text-sm font-medium">Đang tạm dừng - Vui lòng phát nhạc để phân tích âm thanh</span>
                          </div>
                        )}
                      </div>
                    </div>`;

const fixedBlock = `                    <div className="border-t border-zinc-800 pt-6 mt-6">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-emerald-400 font-semibold">Trình phân tích phổ (Spectrogram)</h3>
                        <button onClick={() => setShowSpectrogram(!showSpectrogram)} className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-300 transition">
                          {showSpectrogram ? 'Tắt' : 'Bật'}
                        </button>
                      </div>
                      <p className="text-sm text-zinc-400 mb-4">Theo dõi biểu đồ thác nước tần số (Waterfall) thời gian thực của bản nhạc hiện tại. Khuyến nghị phát nhạc Chất lượng cao (Lossless) để kiểm tra dải cắt tần (Frequency Cutoff).</p>
                      
                      {showSpectrogram && (
                        <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden relative flex flex-col" style={{ height: '300px' }}>
                          
                          {/* LỚP PHỦ TRỤC Y: HIỂN THỊ TẦN SỐ (Hz) */}
                          <div className="absolute top-0 left-0 bottom-0 w-12 bg-zinc-950/90 border-r border-zinc-800 flex flex-col justify-between py-2 text-[10px] text-zinc-400 font-mono text-center z-10 pointer-events-none">
                            <span>15k</span>
                            <span>10k</span>
                            <span>5k</span>
                            <span>1k</span>
                            <span>0Hz</span>
                          </div>

                          {/* CANVAS VẼ PHỔ */}
                          <div className="absolute top-0 left-12 right-0 bottom-0 z-0">
                            <canvas ref={spectrogramCanvasRef} width={1024} height={276} className="w-full h-full" />
                          </div>

                          {!isPlaying && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                              <span className="text-zinc-400 text-sm font-medium">Đang tạm dừng - Vui lòng phát nhạc để phân tích âm thanh</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>`;

let normalizedContent = content.replace(/\r\n/g, '\n');
let normalizedBroken = brokenBlock.replace(/\r\n/g, '\n');
if (normalizedContent.includes(normalizedBroken)) {
  fs.writeFileSync('src/renderer/src/App.tsx', normalizedContent.replace(normalizedBroken, fixedBlock));
  console.log('Fixed successfully');
} else {
  console.log('Pattern not found');
}
