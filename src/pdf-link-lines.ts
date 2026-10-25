import { OPS } from "./pdf-engine";
import type { PDFPageProxy } from "./pdf-engine";

/** An axis-aligned box in PDF page space: [minX, minY, maxX, maxY]. */
export type PdfBox = [number, number, number, number];

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
// Underlines are thin horizontal rules: at most this tall, and several times wider than tall.
const MAX_UNDERLINE_HEIGHT = 3;
const MIN_UNDERLINE_WIDTH = 4;
// Underline pieces this close vertically belong to the same line of text.
const SAME_LINE_TOLERANCE = 2;

/**
 * Splits a link that wraps across lines into one box per line, so its hit area and hover tint follow the
 * link's words instead of covering whole lines around it. Uses the link's own QuadPoints when the PDF has
 * them. Many PDFs only store the bounding rectangle, so otherwise the boxes come from the underlines drawn
 * beneath the link text. Returns null when neither gives more than one line; the caller then uses the rect.
 */
export function linkLineBoxes(rect: PdfBox, quadPoints: ArrayLike<number> | undefined, underlines: PdfBox[]): PdfBox[] | null {
  const fromQuads = quadPoints ? boxesFromQuadPoints(quadPoints) : [];
  if (fromQuads.length > 1) return fromQuads;
  return boxesFromUnderlines(rect, underlines);
}

/** PDF.js normalizes each quad to [minX, maxY, maxX, maxY, minX, minY, maxX, minY]. */
function boxesFromQuadPoints(quadPoints: ArrayLike<number>): PdfBox[] {
  const values = Array.from(quadPoints);
  const boxes: PdfBox[] = [];
  for (let i = 0; i + 8 <= values.length; i += 8) {
    const quad = values.slice(i, i + 8);
    const xs = quad.filter((_, index) => index % 2 === 0);
    const ys = quad.filter((_, index) => index % 2 === 1);
    boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  return boxes;
}

/**
 * Groups the underlines inside the link's rect by line. The rect stacks the link's line boxes, so it is
 * split into equal bands, one per underlined line, and each band spans that line's underline horizontally.
 */
function boxesFromUnderlines(rect: PdfBox, underlines: PdfBox[]): PdfBox[] | null {
  const [left, bottom, right, top] = rect;
  const inside = underlines.filter(([x1, y1, x2, y2]) => {
    const centerY = (y1 + y2) / 2;
    return x1 >= left - 1 && x2 <= right + 1 && centerY >= bottom - 1 && centerY <= top + 1;
  });
  // Top line first, matching reading order.
  inside.sort((a, b) => b[1] - a[1]);
  const lines: { y: number; left: number; right: number }[] = [];
  for (const [x1, y1, x2] of inside) {
    const line = lines.find(candidate => Math.abs(candidate.y - y1) <= SAME_LINE_TOLERANCE);
    if (line) {
      line.left = Math.min(line.left, x1);
      line.right = Math.max(line.right, x2);
    } else {
      lines.push({ y: y1, left: x1, right: x2 });
    }
  }
  if (lines.length < 2) return null;
  const bandHeight = (top - bottom) / lines.length;
  return lines.map((line, index): PdfBox => [line.left, top - (index + 1) * bandHeight, line.right, top - index * bandHeight]);
}

/**
 * Finds the thin horizontal rules a page draws, in page space. Reads the page's drawing operations, following
 * the transforms that place them, because the underlines are drawn shapes rather than part of the text.
 */
export async function findPageUnderlines(page: PDFPageProxy): Promise<PdfBox[]> {
  const operatorList = await page.getOperatorList();
  const underlines: PdfBox[] = [];
  const savedTransforms: Matrix[] = [];
  let transform: Matrix = IDENTITY;
  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const args = operatorList.argsArray[i] as unknown[] | null;
    switch (operatorList.fnArray[i]) {
      case OPS.save:
        savedTransforms.push(transform);
        break;
      case OPS.restore:
        transform = savedTransforms.pop() ?? IDENTITY;
        break;
      case OPS.transform:
        transform = multiply(transform, args as Matrix);
        break;
      case OPS.paintFormXObjectBegin: {
        savedTransforms.push(transform);
        const formMatrix = args?.[0] as Matrix | null;
        if (formMatrix) transform = multiply(transform, formMatrix);
        break;
      }
      case OPS.paintFormXObjectEnd:
        transform = savedTransforms.pop() ?? IDENTITY;
        break;
      case OPS.constructPath: {
        const [paintOperation, , localBounds] = args as [number, unknown, ArrayLike<number> | null];
        if (!localBounds || paintOperation === OPS.endPath) break;
        const box = transformBox(transform, localBounds);
        const width = box[2] - box[0];
        const height = box[3] - box[1];
        if (height <= MAX_UNDERLINE_HEIGHT && width >= MIN_UNDERLINE_WIDTH && width >= height * 3) underlines.push(box);
        break;
      }
    }
  }
  return underlines;
}

/** Applies `inner` first, then `outer`, like a PDF `cm` operator concatenated onto the current transform. */
function multiply(outer: Matrix, inner: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function transformBox(matrix: Matrix, bounds: ArrayLike<number>): PdfBox {
  const [a, b, c, d, e, f] = matrix;
  const [minX = 0, minY = 0, maxX = 0, maxY = 0] = Array.from(bounds);
  const corners: [number, number][] = [[minX, minY], [minX, maxY], [maxX, minY], [maxX, maxY]];
  const xs = corners.map(([x, y]) => a * x + c * y + e);
  const ys = corners.map(([x, y]) => b * x + d * y + f);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
