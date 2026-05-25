declare module "pngjs" {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    constructor(options?: { width?: number; height?: number; [k: string]: unknown });
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG, options?: unknown): Buffer;
    };
  }
}
