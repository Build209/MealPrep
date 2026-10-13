// heic2any (web only, loaded on demand for HEIC photos) ships no types. Same as mobile/types/heic2any.d.ts.
declare module 'heic2any' {
  type Heic2AnyOptions = {
    blob: Blob;
    toType?: string;
    quality?: number;
  };

  function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>;

  export default heic2any;
}
