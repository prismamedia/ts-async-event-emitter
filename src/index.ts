import { clearTimeout, setTimeout } from 'timers';

type MaybePromise<T> = Promise<T> | T;

export type EventMap = {
  [eventName: string]: any;
};

export type EventName<TEventMap extends EventMap> = keyof TEventMap;

export type EventData<TEventMap extends EventMap, TEventName extends EventName<TEventMap>> = TEventMap[TEventName];

export type EventListener<TEventMap extends EventMap, TEventName extends EventName<TEventMap>> = (
  eventData: EventData<TEventMap, TEventName>,
) => MaybePromise<void>;

export type AnyEventListener<TEventMap extends EventMap> = <TEventName extends EventName<TEventMap>>(
  eventName: TEventName,
  eventData: EventData<TEventMap, TEventName>,
) => MaybePromise<void>;

export type BoundOff = () => void;

export class EventEmitter<TEventMap extends EventMap = any> {
  protected namedEventListenerSetMap = new Map<EventName<TEventMap>, Set<EventListener<TEventMap, any>>>();
  protected anyEventListenerSet = new Set<AnyEventListener<TEventMap>>();

  public off<TEventName extends EventName<TEventMap>>(
    eventName: TEventName,
    eventListener: EventListener<TEventMap, TEventName>,
  ): void;
  public off(eventName: EventName<TEventMap>): void;
  public off(anyEventListener: AnyEventListener<TEventMap>): void;
  public off(): void;

  /**
   * Unsubscribe either :
   * - one listener for a given "named" event
   * - all listeners for a given "named" event
   * - one "any" listener
   * - all listeners
   */
  public off<TEventName extends EventName<TEventMap>, TEventListener extends EventListener<TEventMap, TEventName>>(
    ...args: [TEventName, TEventListener] | [TEventName] | [AnyEventListener<TEventMap>] | []
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

  public on<TEventName extends EventName<TEventMap>, TEventListener extends EventListener<TEventMap, TEventName>>(
    eventName: TEventName,
    eventListener: TEventListener,
  ): BoundOff;
  public on(anyEventListener: AnyEventListener<TEventMap>): BoundOff;

  /**
   * Subscribe either to a "named" event or any event.
   * Returns a method to unsubscribe later.
   */
  public on<TEventName extends EventName<TEventMap>, TEventListener extends EventListener<TEventMap, TEventName>>(
    ...args: [TEventName, TEventListener] | [AnyEventListener<TEventMap>]
  ): BoundOff {
    if (args.length === 2) {
      const [eventName, eventListener] = args;

      let eventListenerSet = this.namedEventListenerSetMap.get(eventName);
      if (!eventListenerSet) {
        this.namedEventListenerSetMap.set(eventName, (eventListenerSet = new Set<TEventListener>()));
      }

      eventListenerSet.add(eventListener);

      return this.off.bind(this, eventName, eventListener);
    } else {
      const [anyEventListener] = args;

      this.anyEventListenerSet.add(anyEventListener);

      return this.off.bind(this, anyEventListener);
    }
  }

  public once<TEventName extends EventName<TEventMap>, TEventListener extends EventListener<TEventMap, TEventName>>(
    eventName: TEventName,
    eventListener: TEventListener,
  ): BoundOff;
  public once(anyEventListener: AnyEventListener<TEventMap>): BoundOff;

  /**
   * Subscribe to either a "named" event or any event only once.
   * It will be unsubscribed after the first execution.
   */
  public once<TEventName extends EventName<TEventMap>, TEventListener extends EventListener<TEventMap, TEventName>>(
    ...args: [TEventName, TEventListener] | [AnyEventListener<TEventMap>]
  ): BoundOff {
    if (args.length === 2) {
      const [eventName, eventListener] = args;

      const eventListenerWrapper: EventListener<TEventMap, TEventName> = async eventData => {
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

  public async wait<TEventName extends EventName<TEventMap>, TEventData extends EventData<TEventMap, TEventName>>(
    eventName: TEventName,
    timeout: number,
  ): Promise<TEventData>;
  public async wait<TEventName extends EventName<TEventMap>, TEventData extends EventData<TEventMap, TEventName>>(
    eventName: TEventName,
  ): Promise<TEventData>;
  public async wait<TEventName extends EventName<TEventMap>, TEventData extends EventData<TEventMap, TEventName>>(
    timeout: number,
  ): Promise<[TEventName, TEventData]>;
  public async wait<
    TEventName extends EventName<TEventMap>,
    TEventData extends EventData<TEventMap, TEventName>
  >(): Promise<[TEventName, TEventData]>;

  public async wait<TEventName extends EventName<TEventMap>, TEventData extends EventData<TEventMap, TEventName>>(
    ...args: [TEventName, number] | [TEventName] | [number] | []
  ): Promise<TEventData | [TEventName, TEventData]> {
    return new Promise<TEventData | [TEventName, TEventData]>((resolve, reject) => {
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

          resolve(([eventName, eventData] as unknown) as [TEventName, TEventData]);
        });
      }
    });
  }

  public getEventNames(): Array<EventName<TEventMap>> {
    return [...this.namedEventListenerSetMap.keys()];
  }

  public isEvent<TEventName extends EventName<TEventMap>>(
    eventNamePredicate: TEventName,
    eventName: EventName<TEventMap>,
    eventData: TEventMap[EventName<TEventMap>],
  ): eventData is TEventMap[TEventName] {
    return eventNamePredicate === eventName;
  }

  protected getEventListeners<TEventName extends EventName<TEventMap>, D extends EventData<TEventMap, TEventName>>(
    eventName: TEventName,
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

  public getEventListenerCount(eventName: EventName<TEventMap>): number {
    return this.getEventListeners(eventName).length;
  }

  /**
   * Trigger an event asynchronously with some data. Listeners are called in the order they were added, but execute concurrently.
   * Returns a promise for when all the event listeners are done. Done meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any of the listeners throw/reject, the returned promise will be rejected with the error, but the other listeners will not be affected.
   */
  public async emit<TEventName extends EventName<TEventMap>>(
    eventName: TEventName,
    eventData: TEventMap[TEventName],
  ): Promise<void> {
    await Promise.all(this.getEventListeners(eventName).map(async eventListener => eventListener(eventData)));
  }

  /**
   * Same as above, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other.
   * If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will not be called.
   */
  public async emitSerial<TEventName extends EventName<TEventMap>>(
    eventName: TEventName,
    eventData: TEventMap[TEventName],
  ): Promise<void> {
    for (const eventListener of this.getEventListeners(eventName)) {
      await eventListener(eventData);
    }
  }
}

export default EventEmitter;
