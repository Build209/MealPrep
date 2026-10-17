/**
 * Bounded cache for hot-path string normalization. Two generations: new entries go to `current`;
 * when it is full it becomes `previous` and the one before is dropped whole. Lookups check both and
 * promote hits. Dropping a whole map is O(1), unlike deleting the oldest key from one big Map
 * (V8 then scans the deleted slots on every eviction, which was a visible cost at thousands of entries).
 */
export class LruCache<K, V> {
  private current = new Map<K, V>();
  private previous = new Map<K, V>();

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    const hit = this.current.get(key);
    if (hit !== undefined) return hit;
    const old = this.previous.get(key);
    if (old !== undefined) this.set(key, old);
    return old;
  }

  clear(): void {
    this.current.clear();
    this.previous.clear();
  }

  set(key: K, value: V): void {
    if (this.current.size >= this.maxSize / 2 && !this.current.has(key)) {
      this.previous = this.current;
      this.current = new Map();
    }
    this.current.set(key, value);
  }
}
