# PDF decoder fixtures

One-page PDFs whose only content is an image that PDF.js decodes with a bundled WebAssembly decoder. `scripts/e2e.mjs` opens each one in the Reader and checks the rendered pixels. A missing decoder makes these render blank or with uncorrected color, and PDF.js reports no error.

| File | Image encoding | Decoder | Expected render |
| --- | --- | --- | --- |
| `jpeg2000.pdf` | JPEG 2000 (`JPXDecode`), solid color | `openjpeg.wasm` | Red, about `[230, 30, 60]` |
| `ccitt.pdf` | CCITT Group 4 fax (`CCITTFaxDecode`) | `jbig2.wasm` | Left half black |
| `jbig2.pdf` | JBIG2 (`JBIG2Decode`) | `jbig2.wasm` | Dark marks on white |
| `icc-linear.pdf` | RGB `[128, 64, 32]` with a linear-gamma ICC profile | `qcms_bg.wasm` | About `[188, 137, 99]`; uncorrected color stays `[128, 64, 32]` |
