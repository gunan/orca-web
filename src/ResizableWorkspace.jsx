import React, { Children, cloneElement, useEffect, useId, useRef, useState } from 'react';
import './workspace-layout.css';

const storageKey = 'orca-web-prepare-sidebar-width';
function storedWidth() {
  try {
    const value = Number(localStorage.getItem(storageKey));
    return Number.isFinite(value) && value >= 220 && value <= 680 ? value : null;
  } catch { return null; }
}

export default function ResizableWorkspace({ selected, children }) {
  const host = useRef(), drag = useRef(), sidebarId = useId();
  const [containerWidth, setContainerWidth] = useState(window.innerWidth);
  const [preferred, setPreferred] = useState(storedWidth);
  const narrow = containerWidth <= 800;
  const minimum = narrow ? 220 : 280;
  const maximum = Math.max(minimum, Math.min(680, containerWidth - 256 - (selected && !narrow ? 220 : 0)));
  const defaultWidth = narrow ? 250 : containerWidth <= 1100 ? 300 : Math.min(392, Math.max(320, containerWidth * .222));
  const width = Math.round(Math.max(minimum, Math.min(maximum, preferred ?? defaultWidth)));

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try {
      if (preferred === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(preferred));
    } catch { /* A blocked preference store must not disable resizing. */ }
  }, [preferred]);

  function change(value) { setPreferred(Math.round(Math.max(minimum, Math.min(maximum, value)))); }
  function keyDown(event) {
    const step = event.shiftKey ? 40 : 10;
    if (event.key === 'ArrowLeft') change(width - step);
    else if (event.key === 'ArrowRight') change(width + step);
    else if (event.key === 'Home') change(minimum);
    else if (event.key === 'End') change(maximum);
    else if (event.key === 'Enter') setPreferred(null);
    else return;
    event.preventDefault(); event.stopPropagation();
  }
  function finish(event) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const panels = Children.toArray(children);
  return <div ref={host} className={`workspace editor-workspace resizable-workspace ${selected ? '' : 'empty-selection'} ${narrow ? 'narrow-workspace' : ''}`} style={{ '--sidebar-width': `${width}px` }}>
    {cloneElement(panels[0], { id: sidebarId })}
    <div className="sidebar-divider" role="separator" aria-label="Resize settings panel" aria-orientation="vertical" aria-controls={sidebarId} aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={width} aria-valuetext={`${width} pixels`} tabIndex={0}
      title="Drag to resize settings. Arrow keys adjust width; Enter or double-click resets it."
      onKeyDown={keyDown} onDoubleClick={() => setPreferred(null)}
      onPointerDown={event => { if (event.button !== 0) return; drag.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }}
      onPointerMove={event => { if (drag.current) change(drag.current.width + event.clientX - drag.current.x); }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { drag.current = null; }}/>
    {panels.slice(1)}
  </div>;
}
