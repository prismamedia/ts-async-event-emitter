import { clearTimeout, setTimeout } from 'timers';

type MaybePromise<T> = Promise<T> | T;

export type EventMap = Record<any, any>;

export type EventListener<D = any> = (eventData: D) => MaybePromise<void>;

export type BoundOff = () => void;

export class EventEmitter<TEventMap extends EventMap = any, TEventName extends keyof TEventMap = keyof TEventMap> {
  protected eventListenerSetMap = new Map<TEventName, Set<EventListener>>();

  protected getEventListenerSet<N extends TEventName, L extends EventListener<TEventMap[N]>>(eventName: N): Set<L> {
    let eventListenerSet = this.eventListenerSetMap.get(eventName);
    if (!eventListenerSet) {
      eventListenerSet = new Set<L>();

      this.eventListenerSetMap.set(eventName, eventListenerSet);
    }

    return eventListenerSet as Set<L>;
  }

  public off<N extends TEventName>(eventName?: N, eventListener?: EventListener<TEventMap[N]>): void {
    if (eventName) {
      if (this.eventListenerSetMap.has(eventName)) {
        const eventListenerSet = this.getEventListenerSet(eventName);

        if (eventListener) {
          eventListenerSet.delete(eventListener);

          if (eventListenerSet.size === 0) {
            this.eventListenerSetMap.delete(eventName);
          }
        } else {
          this.eventListenerSetMap.delete(eventName);
        }
      }
    } else {
      this.eventListenerSetMap.clear();
    }
  }

  public on<N extends TEventName>(eventName: N, eventListener: EventListener<TEventMap[N]>): BoundOff {
    this.getEventListenerSet(eventName).add(eventListener);

    return this.off.bind(this, eventName, eventListener);
  }

  public once<N extends TEventName>(eventName: N, eventListener: EventListener<TEventMap[N]>): BoundOff {
    const eventListenerWrapper: EventListener<TEventMap[N]> = async eventData => {
      this.off(eventName, eventListenerWrapper);

      await eventListener(eventData);
    };

    return this.on(eventName, eventListenerWrapper);
  }

  public async wait<N extends TEventName, D extends TEventMap[N]>(eventName: N, timeout?: number): Promise<D> {
    return new Promise<D>((resolve, reject) => {
      let off: BoundOff;

      const timeoutId =
        typeof timeout === 'number' && timeout > 0
          ? setTimeout(() => {
              off && off();

              reject(`Has waited for "${eventName}" more than ${timeout}ms`);
            }, timeout)
          : null;

      off = this.once(eventName, eventData => {
        timeoutId && clearTimeout(timeoutId);

        resolve(eventData);
      });
    });
  }

  public getEventNames(): Array<TEventName> {
    return [...this.eventListenerSetMap.keys()];
  }

  public async emit<N extends TEventName>(eventName: N, eventData: TEventMap[N]): Promise<void> {
    if (this.eventListenerSetMap.has(eventName)) {
      await Promise.all([...this.getEventListenerSet(eventName)].map(async eventListener => eventListener(eventData)));
    }
  }

  public async emitSerial<N extends TEventName>(eventName: N, eventData: TEventMap[N]): Promise<void> {
    if (this.eventListenerSetMap.has(eventName)) {
      for (const eventListener of this.getEventListenerSet(eventName)) {
        await eventListener(eventData);
      }
    }
  }
}

export default EventEmitter;
