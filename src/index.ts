import { clearTimeout, setTimeout } from 'timers';

type MaybePromise<T> = Promise<T> | T;

export type EventMap = {
  [eventName: string]: any;
};

export type EventListener<D = any> = (eventData: D) => MaybePromise<void>;

export type AnyEventListener<TEventMap extends EventMap = any> = <N extends keyof TEventMap>(
  eventName: N,
  eventData: TEventMap[N],
) => MaybePromise<void>;

export type BoundOff = () => void;

export class EventEmitter<
  TEventMap extends EventMap = any,
  TEventName extends string & keyof TEventMap = string & keyof TEventMap
> {
  protected namedEventListenerSetMap = new Map<TEventName, Set<EventListener>>();
  protected anyEventListenerSet = new Set<AnyEventListener>();

  public off<N extends TEventName>(eventName: N, eventListener: EventListener<TEventMap[N]>): void;
  public off(eventName: TEventName): void;
  public off(anyEventListener: AnyEventListener<TEventMap>): void;
  public off(): void;

  /**
   * Unsubscribe either :
   * - one listener for a given "named" event
   * - all listeners for a given "named" event
   * - one "any" listener
   * - all listeners
   */
  public off<N extends TEventName, L extends EventListener<TEventMap[N]>>(
    ...args: [N, L] | [N] | [AnyEventListener<TEventMap>] | []
  ): void {
    if (typeof args[0] === 'string' && typeof args[1] === 'function') {
      const eventName = args[0];
      const eventListener = args[1];

      const eventListenerSet = this.namedEventListenerSetMap.get(eventName);
      if (eventListenerSet) {
        eventListenerSet.delete(eventListener);
        if (eventListenerSet.size === 0) {
          this.namedEventListenerSetMap.delete(eventName);
        }
      }
    } else if (typeof args[0] === 'string') {
      this.namedEventListenerSetMap.delete(args[0]);
    } else if (typeof args[0] === 'function') {
      this.anyEventListenerSet.delete(args[0]);
    } else {
      this.namedEventListenerSetMap.clear();
      this.anyEventListenerSet.clear();
    }
  }

  public on<N extends TEventName, L extends EventListener<TEventMap[N]>>(eventName: N, eventListener: L): BoundOff;
  public on(anyEventListener: AnyEventListener<TEventMap>): BoundOff;

  /**
   * Subscribe either to a "named" event or any event.
   * Returns a method to unsubscribe later.
   */
  public on<N extends TEventName, L extends EventListener<TEventMap[N]>>(
    ...args: [N, L] | [AnyEventListener<TEventMap>]
  ): BoundOff {
    if (args.length === 2) {
      const [eventName, eventListener] = args;

      let eventListenerSet = this.namedEventListenerSetMap.get(eventName);
      if (!eventListenerSet) {
        this.namedEventListenerSetMap.set(eventName, (eventListenerSet = new Set<L>()));
      }

      eventListenerSet.add(eventListener);

      return this.off.bind(this, eventName, eventListener);
    } else {
      const [anyEventListener] = args;

      this.anyEventListenerSet.add(anyEventListener);

      return this.off.bind(this, anyEventListener);
    }
  }

  public once<N extends TEventName, L extends EventListener<TEventMap[N]>>(eventName: N, eventListener: L): BoundOff;
  public once(anyEventListener: AnyEventListener<TEventMap>): BoundOff;

  /**
   * Subscribe to either a "named" event or any event only once.
   * It will be unsubscribed after the first execution.
   */
  public once<N extends TEventName, L extends EventListener<TEventMap[N]>>(
    ...args: [N, L] | [AnyEventListener<TEventMap>]
  ): BoundOff {
    if (args.length === 2) {
      const [eventName, eventListener] = args;

      const eventListenerWrapper: EventListener<TEventMap[N]> = async eventData => {
        this.off(eventName, eventListenerWrapper);

        await eventListener(eventData);
      };

      return this.on(eventName, eventListenerWrapper);
    } else {
      const [anyEventListener] = args;

      const anyEventListenerWrapper: AnyEventListener<TEventMap> = async (eventName, eventData) => {
        this.off(anyEventListenerWrapper);

        await anyEventListener(eventName, eventData);
      };

      return this.on(anyEventListenerWrapper);
    }
  }

  public async wait<N extends TEventName, D extends TEventMap[N]>(eventName: N, timeout: number): Promise<D>;
  public async wait<N extends TEventName, D extends TEventMap[N]>(eventName: N): Promise<D>;
  public async wait<N extends TEventName, D extends TEventMap[N]>(timeout: number): Promise<[N, D]>;
  public async wait<N extends TEventName, D extends TEventMap[N]>(): Promise<[N, D]>;

  public async wait<N extends TEventName, D extends TEventMap[N]>(
    ...args: [N, number] | [N] | [number] | []
  ): Promise<D | [N, D]> {
    return new Promise<D | [N, D]>((resolve, reject) => {
      let off: BoundOff;

      if (typeof args[0] === 'string') {
        const eventName = args[0];
        const timeout = typeof args[1] === 'number' && args[1] > 0 ? args[1] : null;

        const timeoutId = timeout
          ? setTimeout(() => {
              off && off();

              reject(`Has waited for the "${eventName}" event more than ${timeout}ms`);
            }, timeout)
          : null;

        off = this.once(eventName, eventData => {
          timeoutId && clearTimeout(timeoutId);

          resolve(eventData);
        });
      } else {
        const timeout = typeof args[0] === 'number' && args[0] > 0 ? args[0] : null;

        const timeoutId = timeout
          ? setTimeout(() => {
              off && off();

              reject(`Has waited for any event more than ${timeout}ms`);
            }, timeout)
          : null;

        off = this.once((eventName, eventData) => {
          timeoutId && clearTimeout(timeoutId);

          resolve(([eventName, eventData] as unknown) as [N, D]);
        });
      }
    });
  }

  public getEventNames(): Array<TEventName> {
    return [...this.namedEventListenerSetMap.keys()];
  }

  public isEvent<N extends TEventName>(
    eventNamePredicate: N,
    eventName: TEventName,
    eventData: TEventMap[TEventName],
  ): eventData is TEventMap[N] {
    return eventNamePredicate === eventName;
  }

  protected getEventListeners<N extends TEventName, D extends TEventMap[N]>(
    eventName: N,
  ): Array<(eventData: D) => MaybePromise<void>> {
    const eventListenerSet = this.namedEventListenerSetMap.get(eventName);

    return [
      // "Any" event listeners
      ...[...this.anyEventListenerSet].map(eventListener => async (eventData: D) =>
        eventListener(eventName, eventData),
      ),
      // "Named" event listeners
      ...(eventListenerSet ? [...eventListenerSet] : []),
    ];
  }

  public getEventListenerCount(eventName: TEventName): number {
    return this.getEventListeners(eventName).length;
  }

  /**
   * Trigger an event asynchronously with some data. Listeners are called in the order they were added, but execute concurrently.
   * Returns a promise for when all the event listeners are done. Done meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any of the listeners throw/reject, the returned promise will be rejected with the error, but the other listeners will not be affected.
   */
  public async emit<N extends TEventName>(eventName: N, eventData: TEventMap[N]): Promise<void> {
    await Promise.all(this.getEventListeners(eventName).map(async eventListener => eventListener(eventData)));
  }

  /**
   * Same as above, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other.
   * If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will not be called.
   */
  public async emitSerial<N extends TEventName>(eventName: N, eventData: TEventMap[N]): Promise<void> {
    for (const eventListener of this.getEventListeners(eventName)) {
      await eventListener(eventData);
    }
  }
}

export default EventEmitter;
