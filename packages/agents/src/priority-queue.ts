/**
 * A binary min-heap with deterministic tie-breaking.
 *
 * Ties are broken by insertion order, which makes the queue behave like a FIFO among
 * equal priorities. That is not an implementation detail: a bare heap breaks ties by
 * whatever the sift operations happen to do, so two runs of A\* over the same problem
 * can return different — equally optimal — paths. Golden-file tests and replay
 * comparison both need the choice to be stable.
 */
export class PriorityQueue<T> {
  readonly #heap: { priority: number; sequence: number; value: T }[] = [];
  #sequence = 0;

  get size(): number {
    return this.#heap.length;
  }

  get isEmpty(): boolean {
    return this.#heap.length === 0;
  }

  push(value: T, priority: number): void {
    this.#heap.push({ priority, sequence: this.#sequence++, value });
    this.#siftUp(this.#heap.length - 1);
  }

  /** Removes and returns the lowest-priority item, or `undefined` when empty. */
  pop(): T | undefined {
    const top = this.#heap[0];
    if (top === undefined) return undefined;

    const last = this.#heap.pop();
    // `last` is only undefined when the heap was empty, which `top` already ruled out.
    if (last !== undefined && this.#heap.length > 0) {
      this.#heap[0] = last;
      this.#siftDown(0);
    }
    return top.value;
  }

  /** Returns the lowest-priority item without removing it. */
  peek(): T | undefined {
    return this.#heap[0]?.value;
  }

  /** Orders by priority, then by insertion sequence. Never returns 0 for distinct items. */
  #isHigherPriority(a: number, b: number): boolean {
    const left = this.#heap[a];
    const right = this.#heap[b];
    if (left === undefined || right === undefined) return false;
    if (left.priority !== right.priority) return left.priority < right.priority;
    return left.sequence < right.sequence;
  }

  #swap(a: number, b: number): void {
    const left = this.#heap[a];
    const right = this.#heap[b];
    if (left === undefined || right === undefined) return;
    this.#heap[a] = right;
    this.#heap[b] = left;
  }

  #siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.#isHigherPriority(index, parent)) break;
      this.#swap(index, parent);
      index = parent;
    }
  }

  #siftDown(start: number): void {
    let index = start;
    const length = this.#heap.length;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < length && this.#isHigherPriority(left, smallest)) smallest = left;
      if (right < length && this.#isHigherPriority(right, smallest)) smallest = right;
      if (smallest === index) break;
      this.#swap(index, smallest);
      index = smallest;
    }
  }
}
