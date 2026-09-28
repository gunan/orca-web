import React, { useEffect, useRef } from 'react';
export default function Modal({ children, onClose, className = '', ...props }) {
  const ref = useRef();
  useEffect(() => {
    const dialog = ref.current, previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog {...props} ref={ref} className={`app-modal ${className}`} onCancel={event => { event.preventDefault(); onClose?.(); }} onClick={event => {
    if (event.target !== ref.current) return;
    const box = ref.current.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose?.();
  }}>{children}</dialog>;
}
