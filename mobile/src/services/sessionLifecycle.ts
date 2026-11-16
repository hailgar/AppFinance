/** Keep old-account cleanup from outliving a new sign-in, including auth callbacks. */
export class SessionTransitionQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(change: () => Promise<T>): Promise<T> {
    const result = this.tail.then(change);
    // A failed logout still settles before the next transition; preserve its error
    // for its caller without leaving every future sign-in permanently blocked.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export const sessionTransitions = new SessionTransitionQueue();
