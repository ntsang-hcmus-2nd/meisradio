/**
 * Thuật toán Fisher-Yates Shuffle chuẩn O(n)
 * Đảm bảo xác suất phân phối đồng đều, loại bỏ hoàn toàn hiện tượng thiên vị (bias) của sort(Math.random - 0.5)
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  if (!array || array.length <= 1) return [...(array || [])]
  const copy = [...array]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}
