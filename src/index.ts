import { clearTimeout, setTimeout } from 'timers';

type MaybePromise<T> = Promise<T> | T;

export type EventMap = Record<any, any>;

export type EventListener<D = any> = (eventData: D) => MaybePromise<any>;

export type BoundOff = () => void;

export default class EventEmitter<
  TEventMap extends EventMap = any,
  TEventName extends keyof TEventMap = keyof TEventMap
> {
  protected eventListenerSetMap = new Map<TEventName, Set<EventListener>>();

  protected hasEventListenerSet<N extends TEventName>(eventName: N): boolean {
    return this.eventListenerSetMap.has(eventName);
  }

  protected getEventListenerSet<N extends TEventName, L extends EventListener<TEventMap[N]>>(eventName: N): Set<L> {
    if (!this.hasEventListenerSet(eventName)) {
      this.eventListenerSetMap.set(eventName, new Set<L>());
    }

    return this.eventListenerSetMap.get(eventName) as Set<L>;
  }

  public off<N extends TEventName, L extends EventListener<TEventMap[N]>>(eventName?: N, eventListener?: L): void {
    if (eventName) {
      if (this.hasEventListenerSet(eventName)) {
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

  public on<N extends TEventName, L extends EventListener<TEventMap[N]>>(eventName: N, eventListener: L): BoundOff {
    this.getEventListenerSet(eventName).add(eventListener);

    return this.off.bind(this, eventName, eventListener);
  }

  public once<N extends TEventName, L extends EventListener<TEventMap[N]>>(eventName: N, eventListener: L): BoundOff {
    const eventListenerWrapper: EventListener<TEventMap[N]> = async eventData => {
      this.off(eventName, eventListenerWrapper);

      await eventListener(eventData);
    };

    return this.on(eventName, eventListenerWrapper);
  }

  public async wait<N extends TEventName, D extends TEventMap[N], R extends D>(
    eventName: N,
    timeout?: number,
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      let off: BoundOff;

      const timeoutId = timeout
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

  public async emit<N extends TEventName, D extends TEventMap[N]>(eventName: N, eventData: D): Promise<void> {
    await Promise.all([
      ...(this.hasEventListenerSet(eventName)
        ? [...this.getEventListenerSet(eventName)].map(async eventListener => eventListener(eventData))
        : []),
    ]);
  }

  public eventNames(): Array<TEventName> {
    return [...this.eventListenerSetMap.keys()];
  }
}
