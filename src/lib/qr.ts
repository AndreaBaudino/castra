import { useEffect, useState } from 'react'

/** A QR of `text` as an SVG path of 1×1 squares on an n×n grid; undefined while the library loads. */
export function useQr(text: string) {
  const [qr, setQr] = useState<{ n: number; d: string }>()
  useEffect(() => {
    // loaded only here: no weight for whoever never shows one
    import('qrcode-generator').then(({ default: qrcode }) => {
      const q = qrcode(0, 'M')
      q.addData(text)
      q.make()
      const n = q.getModuleCount()
      let d = ''
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`
      setQr({ n, d })
    })
  }, [text])
  return qr
}
