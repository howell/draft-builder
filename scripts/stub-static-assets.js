/**
 * Let plain Node/ts-node require the static image assets that Next normally
 * handles through its own loader.
 *
 * `src/platforms/common.ts` imports league logos, so any script that reaches the
 * platform code — fixture generation, the ESPN value ingest — transitively
 * requires a .webp. Without this hook Node tries to parse the binary as
 * JavaScript and dies with "Invalid or unexpected token".
 */
const STATIC_ASSET_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.avif'];

for (const extension of STATIC_ASSET_EXTENSIONS) {
  require.extensions[extension] = (module) => {
    // Shape mirrors next/image's StaticImageData; scripts only ever pass these
    // around, never render them.
    module.exports = { default: { src: '', height: 0, width: 0, blurDataURL: '' } };
  };
}
