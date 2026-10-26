import { useRef } from 'react'

/** Tap → onClick, press and hold (or right click) → onLongPress. Moving the finger (scrolling) cancels the hold. */
export function useLongPress(onClick: () => void, onLongPress?: () => void) {
  const timer = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const start = useRef<[number, number]>([0, 0])
  if (!onLongPress) return { onClick }
  const cancel = () => clearTimeout(timer.current)
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false
      start.current = [e.clientX, e.clientY]
      timer.current = window.setTimeout(() => {
        fired.current = true
        navigator.vibrate?.(30)
        onLongPress()
      }, 500)
    },
    // scrolling the list is not a long press
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.abs(e.clientX - start.current[0]) + Math.abs(e.clientY - start.current[1]) > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick: () => {
      if (!fired.current) onClick()
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      cancel()
      if (!fired.current) onLongPress()
      fired.current = true
    },
  }
}
