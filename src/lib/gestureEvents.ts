export type GestureListener<T> = (data: T) => void;

export interface GestureEventMap {
  rotate: { dx: number; dy: number };
  zoom: { delta: number };
  reset: boolean;
  click: { x: number; y: number };
  pointer_move: { x: number; y: number };
  peace: boolean;
  run_code: boolean;
  play_flow: boolean;
  pause_flow: boolean;
  step_forward: boolean;
  step_back: boolean;
  cancel: boolean;
  gesture_confirmed: { gesture: string; action: string };
}

class EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: { [event: string]: ((data: any) => void)[] } = {};

  on<K extends keyof GestureEventMap>(
    event: K,
    listener: GestureListener<GestureEventMap[K]>
  ): () => void;
  on<T = unknown>(event: string, listener: GestureListener<T>): () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (data: any) => void): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof GestureEventMap>(
    event: K,
    listener: GestureListener<GestureEventMap[K]>
  ): void;
  off<T = unknown>(event: string, listener: GestureListener<T>): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, listener: (data: any) => void): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
  }

  emit<K extends keyof GestureEventMap>(
    event: K,
    data: GestureEventMap[K]
  ): void;
  emit<T = unknown>(event: string, data: T): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, data: any): void {
    if (!this.listeners[event]) return;
    for (const listener of this.listeners[event]) {
      listener(data);
    }
  }
}

export const gestureEvents = new EventBus();
