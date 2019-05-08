import { clearTimeout, setTimeout } from 'timers';

type Maybe<T> = undefined | null | T;
type MaybeArray<T> = T | Array<T>;
type MaybePromise<T> = T | Promise<T>;

export type EventMap = {
  [eventName: string]: any;
};

export type EventName<TEventMap extends EventMap> = keyof TEventMap;

export type EventData<TEventMap extends EventMap, TEventName extends EventName<TEventMap>> = TEventMap[TEventName];

export type EventListener<TEventMap extends EventMap, TEventName extends EventName<TEventMap>> = (
  eventData: EventData<TEventMap, TEventName>,
) => MaybePromise<void>;

export type BoundOff = () => void;

export type EventConfigMap<TEventMap extends EventMap> = {
  [TEventName in EventName<TEventMap>]?: Maybe<MaybeArray<EventListener<TEventMap, TEventName>>>
};

export class EventEmitter<TEventMap extends EventMap = any> {
  protected eventListenerSetMap = new Map<EventName<TEventMap>, Set<EventListener<TEventMap, any>>>();

  /**
   * Unsubscribe either :
   * - one listener for a given event
   * - all listeners for a given event
   * - all listeners
   */
  public off<TEventName extends EventName<TEventMap>>(
    eventName?: TEventName,
    eventListener?: EventListener<TEventMap, TEventName>,
  ): void {
    if (eventName && eventListener) {
      const eventListenerSet = this.eventListenerSetMap.get(eventName);
      if (eventListenerSet) {
        eventListenerSet.delete(eventListener);
        if (eventListenerSet.size === 0) {
          this.eventListenerSetMap.delete(eventName);
        }
      }
    } else if (eventName) {
      this.eventListenerSetMap.delete(eventName);
    } else {
      this.eventListenerSetMap.clear();
    }
  }

  /**
   * Subscribe to an event.
   * Returns a method to unsubscribe later.
   */
  public on<TEventName extends EventName<TEventMap>>(
    eventName: TEventName,
    eventListener: EventListener<TEventMap, TEventName>,
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
  public onConfig(config: EventConfigMap<TEventMap>): BoundOff[] {
    const offs: BoundOff[] = [];

    for (const [eventName, eventConfig] of Object.entries(config)) {
      if (eventConfig != null) {
        const eventListeners = Array.isArray(eventConfig) ? eventConfig : [eventConfig];
        for (const eventListener of eventListeners) {
          offs.push(this.on(eventName, eventListener));
        }
      }
    }

    return offs;
  }

  /**
   * Subscribe to an event only once.
   * It will be unsubscribed after the first execution.
   */
  public once<TEventName extends EventName<TEventMap>>(
    eventName: TEventName,
    eventListener: EventListener<TEventMap, TEventName>,
  ): BoundOff {
    const eventListenerWrapper: EventListener<TEventMap, TEventName> = async eventData => {
      this.off(eventName, eventListenerWrapper);

      await eventListener(eventData);
    };

    return this.on(eventName, eventListenerWrapper);
  }

  public async wait<TEventName extends EventName<TEventMap>, TEventData extends EventData<TEventMap, TEventName>>(
    eventName: TEventName,
    timeout: number | null = null,
  ): Promise<TEventData> {
    return new Promise<TEventData>((resolve, reject) => {
      let off: BoundOff;

      const timeoutId =
        timeout != null && timeout > 0
          ? setTimeout(() => {
              off && off();

              reject(`Has waited for the "${eventName}" event more than ${timeout}ms`);
            }, timeout)
          : null;

      off = this.once(eventName, eventData => {
        timeoutId && clearTimeout(timeoutId);

        resolve(eventData);
      });
    });
  }

  public getEventNames(): Array<EventName<TEventMap>> {
    return [...this.eventListenerSetMap.keys()];
  }

  protected getEventListeners<TEventName extends EventName<TEventMap>>(
    eventName: TEventName,
  ): Array<(eventData: EventData<TEventMap, TEventName>) => MaybePromise<void>> {
    const eventListenerSet = this.eventListenerSetMap.get(eventName);

    return eventListenerSet ? [...eventListenerSet] : [];
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
