export type Arrayish<T> = {[i: number]: T};

/**
 * A pointer to an array element.
 */
export default class Ptr<T> {
  private _arr: Arrayish<T>
  private _i: number;
  constructor(arr: Arrayish<T>, i: number) {
    this._arr = arr;
    this._i = i;
  }

  public reset(arr: Arrayish<T>, i: number): this {
    this._arr = arr;
    this._i = i;
    return this;
  }

  /**
   * Pointer arithmetic.
   */
  public add(n: number): this {
    this._i += n;
    return this;
  }

  public getIndex(): number {
    return this._i;
  }

  public getArray(): Arrayish<T> {
    return this._arr;
  }

  public addInto(ptr: Ptr<T>, n: number): Ptr<T> {
    ptr._i = this._i + n;
    ptr._arr = this._arr;
    return ptr;
  }

  public cloneInto(ptr: Ptr<T>): Ptr<T> {
    ptr._i = this._i;
    ptr._arr = this._arr;
    return ptr;
  }

  public clone(): Ptr<T> {
    return new Ptr(this._arr, this._i);
  }

  public get(): T {
    return this._arr[this._i];
  }

  public getOffset(i: number): T {
    return this._arr[this._i + i];
  }

  public setOffset(i: number, v: T): void {
    this._arr[this._i + i] = v;
  }

  public set(val: T): void {
    this._arr[this._i] = val;
  }
}
