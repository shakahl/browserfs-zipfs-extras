export default class ByteBuff {
  private _buff: Uint8Array;
  private _i: number = 0;

  constructor(buff: Uint8Array) {
    this._buff = buff;
  }

  public readByte(): number {
    // Will be undefined if reading beyond array.
    const rv = this._buff[this._i++];
    return rv === undefined ? 0 : rv;
  }

  public eof(): boolean {
    return this._i === this._buff.byteLength;
  }

  public size(): number {
    return this._buff.byteLength;
  }
}