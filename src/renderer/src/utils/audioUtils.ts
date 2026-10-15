/**
 * Tiện ích xử lý âm thanh & chuyển đổi đường cong âm lượng thính giác (Perceptual Volume Curve)
 *
 * Áp dụng đường cong bậc hai (Quadratic Taper / Stevens' Power Law - G = x^2),
 * mô phỏng chính xác chiết áp âm lượng logarit (Audio Logarithmic Potentiometer)
 * phù hợp với độ nhạy thính giác của tai người theo định luật Weber-Fechner:
 *
 * - x = 0.00 -> Gain = 0.0000 (-∞ dB, Tắt tiếng hoàn toàn)
 * - x = 0.05 -> Gain = 0.0025 (-52 dB, Mức nghe siêu nhỏ đêm khuya)
 * - x = 0.10 -> Gain = 0.0100 (-40 dB, Mức nghe êm dịu / tai nghe nhạy)
 * - x = 0.25 -> Gain = 0.0625 (-24 dB, Nhạc nền nhẹ nhàng)
 * - x = 0.50 -> Gain = 0.2500 (-12 dB, Cảm giác bằng 50% độ to thính giác)
 * - x = 0.75 -> Gain = 0.5625 (-5.0 dB, Âm lượng nghe thông thường)
 * - x = 1.00 -> Gain = 1.0000 (0 dB, Toàn phần Bit-Perfect)
 */

/**
 * Chuyển đổi vị trí thanh trượt âm lượng tuyến tính (0.0 đến 1.0)
 * sang hệ số khuếch đại biên độ thực tế theo đường cong cảm nhận thính giác (Perceptual Volume Curve).
 *
 * @param sliderPos Vị trí thanh trượt từ 0.0 đến 1.0
 * @returns Hệ số biên độ thực tế (Gain) từ 0.0 đến 1.0
 */
export function sliderToGain(sliderPos: number): number {
  if (typeof sliderPos !== 'number' || isNaN(sliderPos) || sliderPos <= 0) {
    return 0
  }
  if (sliderPos >= 1) {
    return 1
  }
  const clamped = Math.max(0, Math.min(1, sliderPos))
  return clamped * clamped
}

/**
 * Chuyển đổi ngược lại từ hệ số khuếch đại biên độ (Gain) sang vị trí thanh trượt (0.0 đến 1.0).
 *
 * @param gain Hệ số biên độ từ 0.0 đến 1.0
 * @returns Vị trí thanh trượt từ 0.0 đến 1.0
 */
export function gainToSlider(gain: number): number {
  if (typeof gain !== 'number' || isNaN(gain) || gain <= 0) {
    return 0
  }
  if (gain >= 1) {
    return 1
  }
  const clamped = Math.max(0, Math.min(1, gain))
  return Math.sqrt(clamped)
}
