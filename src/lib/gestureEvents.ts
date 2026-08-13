type GestureListener<T> = (data: T) => void;

class EventBus {
  private listeners: { [event: string]: GestureListener<any>[] } = {};

  on<T>(event: string, listener: GestureListener<T>) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return () => this.off(event, listener);
  }

  off<T>(event: string, listener: GestureListener<T>) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
  }

  emit<T>(event: string, data: T) {
    if (!this.listeners[event]) return;
    for (const listener of this.listeners[event]) {
      listener(data);
    }
  }
}

export const gestureEvents = new EventBus();
