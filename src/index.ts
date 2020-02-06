import { clearTimeout, setTimeout } from 'timers';

type Maybe<T> = undefined | null | T;
type ValueOrArray<T> = T | Array<T>;
type ValueOrPromise<T> = T | Promise<T>;

export type EventMap = Record<keyof any, any>;

export type EventKind<TEventMap extends EventMap> = keyof TEventMap;

export type EventData<
  TEventMap extends EventMap,
  TEventKind extends EventKind<TEventMap> = EventKind<TEventMap>
> = TEventMap[TEventKind];

export type EventListener<
  TEventMap extends EventMap,
  TEventKind extends EventKind<TEventMap> = EventKind<TEventMap>
> = (eventData: EventData<TEventMap, TEventKind>) => ValueOrPromise<void>;

export type EventConfig<
  TEventMap extends EventMap,
  TEventKind extends EventKind<TEventMap> = EventKind<TEventMap>
> = Maybe<ValueOrArray<Maybe<EventListener<TEventMap, TEventKind>>>>;

export type EventConfigMap<TEventMap extends EventMap> = {
  [TEventKind in EventKind<TEventMap>]?: EventKind<TEventMap> extends number
    ? // Forbid usage of "numeric" key because javascript does not support it: they are transform into "string"
      never
    : EventConfig<TEventMap, TEventKind>;
};

export type BoundOff = () => void;

export class EventEmitter<TEventMap extends EventMap = any> {
  protected eventListenerSetMap = new Map<
    EventKind<TEventMap>,
    Set<EventListener<TEventMap, any>>
  >();

  public constructor(config?: EventConfigMap<TEventMap> | null) {
    this.onConfig(config);
  }

  /**
   * Unsubscribe either :
   * - one listener for a given event
   * - all listeners for a given event
   * - all listeners
   */
  public off<TEventKind extends EventKind<TEventMap>>(
    eventName?: TEventKind,
    eventListener?: EventListener<TEventMap, TEventKind>,
  ): void {
    if (typeof eventName !== 'undefined' && eventListener) {
      const eventListenerSet = this.eventListenerSetMap.get(eventName);
      if (
        eventListenerSet &&
        eventListenerSet.delete(eventListener) &&
        eventListenerSet.size === 0
      ) {
        this.eventListenerSetMap.delete(eventName);
      }
    } else if (typeof eventName !== 'undefined') {
      this.eventListenerSetMap.delete(eventName);
    } else {
      this.eventListenerSetMap.clear();
    }
  }

  /**
   * Subscribe to an event.
   * Returns a method to unsubscribe later.
   */
  public on<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
    eventListener: EventListener<TEventMap, TEventKind>,
  ): BoundOff {
    let eventListenerSet = this.eventListenerSetMap.get(eventName);
    if (!eventListenerSet) {
      this.eventListenerSetMap.set(eventName, (eventListenerSet = new Set()));
    }

    eventListenerSet.add(eventListener);

    return this.off.bind(this, eventName, eventListener as any);
  }

  /**
   * Subscribe to a bunch of events.
   * Returns an array of unsubscribe methods
   */
  public onConfig(config?: EventConfigMap<TEventMap> | null): BoundOff[] {
    const offs: BoundOff[] = [];

    if (config != null) {
      for (const eventName of [
        ...Object.getOwnPropertyNames(config),
        ...Object.getOwnPropertySymbols(config),
      ] as EventKind<TEventMap>[]) {
        const eventConfig = config[eventName];
        if (eventConfig != null) {
          const eventListeners = Array.isArray(eventConfig)
            ? eventConfig
            : [eventConfig];
          for (const eventListener of eventListeners) {
            if (eventListener != null) {
              offs.push(this.on(eventName, eventListener));
            }
          }
        }
      }
    }

    return offs;
  }

  /**
   * Subscribe to an event only once.
   * It will be unsubscribed after the first execution.
   */
  public once<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
    eventListener: EventListener<TEventMap, TEventKind>,
  ): BoundOff {
    const eventListenerWrapper: EventListener<
      TEventMap,
      TEventKind
    > = async eventData => {
      this.off(eventName, eventListenerWrapper);

      await eventListener(eventData);
    };

    return this.on(eventName, eventListenerWrapper);
  }

  public async wait<
    TEventKind extends EventKind<TEventMap>,
    TEventData extends EventData<TEventMap, TEventKind>
  >(eventName: TEventKind, timeout?: number | null): Promise<TEventData> {
    return new Promise<TEventData>((resolve, reject) => {
      let off: BoundOff;

      const timeoutId =
        timeout != null && timeout > 0
          ? setTimeout(() => {
              off && off();

              reject(
                `Has waited for the "${eventName}" event more than ${timeout}ms`,
              );
            }, timeout)
          : null;

      off = this.once(eventName, eventData => {
        timeoutId && clearTimeout(timeoutId);

        resolve(eventData);
      });
    });
  }

  public getEventNames(): Array<EventKind<TEventMap>> {
    return [...this.eventListenerSetMap.keys()];
  }

  protected getEventListeners<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
  ): Array<EventListener<TEventMap, TEventKind>> {
    const eventListenerSet = this.eventListenerSetMap.get(eventName);

    return eventListenerSet ? [...eventListenerSet] : [];
  }

  public getEventListenerCount(eventName: EventKind<TEventMap>): number {
    return this.eventListenerSetMap.get(eventName)?.size ?? 0;
  }

  /**
   * Trigger an event asynchronously with some data. Listeners are called in the order they were added, but execute concurrently.
   * Returns a promise for when all the event listeners are done. Done meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any of the listeners throw/reject, the returned promise will be rejected with the error, but the other listeners will not be affected.
   */
  public async emit<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
    eventData: TEventMap[TEventKind],
  ): Promise<void> {
    await Promise.all(
      this.getEventListeners(eventName).map(async eventListener =>
        eventListener(eventData),
      ),
    );
  }

  /**
   * Same as above, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other.
   * If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will not be called.
   */
  public async emitSerial<TEventKind extends EventKind<TEventMap>>(
    eventName: TEventKind,
    eventData: TEventMap[TEventKind],
  ): Promise<void> {
    for (const eventListener of this.getEventListeners(eventName)) {
      await eventListener(eventData);
    }
  }
}

export default EventEmitter;
