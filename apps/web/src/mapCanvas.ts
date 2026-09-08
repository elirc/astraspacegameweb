export function prepareMapCanvasFrame(
  canvas: Pick<HTMLCanvasElement, 'width' | 'height'>,
  context: Pick<CanvasRenderingContext2D, 'setTransform'>,
  width: number,
  height: number,
  resolution: number,
) {
  // Assigning either dimension clears the backing store and all context state,
  // even when the value is unchanged. Only allocate when the pixel size changes.
  const pixelWidth = Math.floor(width * resolution),
    pixelHeight = Math.floor(height * resolution);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  // A reused context keeps its transform. Replace it so density scaling never
  // accumulates between camera frames or after a viewport resize.
  context.setTransform(resolution, 0, 0, resolution, 0, 0);
}
