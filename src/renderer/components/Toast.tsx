import React, { useEffect, useState, useCallback, useRef } from 'react';

export interface ToastMessage {
  id: number;
  text: string;
}

let toastIdCounter = 0;
let toastListeners: ((msg: ToastMessage) => void)[] = [];

export function showToast(text: string): void {
  const msg: ToastMessage = { id: ++toastIdCounter, text };
  toastListeners.forEach((fn) => fn(msg));
}

const Toast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const addToast = useCallback((msg: ToastMessage) => {
    setToasts((prev) => [...prev, msg]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      timersRef.current.delete(msg.id);
    }, 2000);
    timersRef.current.set(msg.id, timer);
  }, []);

  useEffect(() => {
    toastListeners.push(addToast);
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== addToast);
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
};

export default Toast;
