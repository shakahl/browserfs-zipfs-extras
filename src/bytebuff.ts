import {mask_bits} from './unzip';
export default class ByteBuff {
  private _buff: Uint8Array;
  private _i: number = 0;
  private _bitsLeft: number = 0;
  private _bitbuf: number = 0;
  private _zipeof: boolean = false;

  constructor(buff: Uint8Array) {
    this._buff = buff;
  }

  public readByte(): number {
    // Will be undefined if reading beyond array.
    const rv = this._buff[this._i++];
    return rv === undefined ? 0 : rv;
  }

  /**
   * readBits (used by unshrink)
   * Do not mix this with readByte!
   */
  public readBits(nbits: number): number {
    if (nbits > this._bitsLeft) {
      let temp: number;
      this._zipeof = true;
      while (this._bitsLeft <= 8 * 3 && !this.eof()) {
        this._zipeof = false;
        temp = this.readByte()
        this._bitbuf |= temp << this._bitsLeft;
        this._bitsLeft += 8;
      }
    }
    let zdest = this._bitbuf & mask_bits[nbits];
    this._bitbuf >>>= nbits;
    this._bitsLeft -= nbits;
    return zdest;
  }

  public zipeof(): boolean {
    return this._zipeof;
  }

  public eof(): boolean {
    return this._i === this._buff.byteLength;
  }

  public size(): number {
    return this._buff.byteLength;
  }
}