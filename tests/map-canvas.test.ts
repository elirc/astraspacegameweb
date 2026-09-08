import { describe, expect, it, vi } from 'vitest';
import { prepareMapCanvasFrame } from '../apps/web/src/mapCanvas';

function surface(width = 300, height = 150) {
  const writes: string[] = [];
  const canvas = {
    get width() {
      return width;
    },
    set width(value: number) {
      writes.push('width');
      width = value;
    },
    get height() {
      return height;
    },
    set height(value: number) {
      writes.push('height');
      height = value;
    },
  };
  const context = { setTransform: vi.fn() };
  return { canvas, context, writes };
}

describe('Canvas map backing store', () => {
  it('allocates device pixels once and preserves the surface across repeated camera frames', () => {
    const { canvas, context, writes } = surface();
    for (let i = 0; i < 60; i++) prepareMapCanvasFrame(canvas, context, 390, 500, 2);
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 780, height: 1000 });
    expect(writes).toEqual(['width', 'height']);
    expect(context.setTransform).toHaveBeenCalledTimes(60);
    for (const call of context.setTransform.mock.calls) expect(call).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('resizes only the changed dimension when the viewport changes', () => {
    const { canvas, context, writes } = surface(780, 1000);
    prepareMapCanvasFrame(canvas, context, 600, 500, 2);
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 1200, height: 1000 });
    expect(writes).toEqual(['width']);
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('reallocates for a changed pixel density and replaces the previous scale', () => {
    const { canvas, context, writes } = surface(780, 1000);
    prepareMapCanvasFrame(canvas, context, 390, 500, 1);
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 390, height: 500 });
    expect(writes).toEqual(['width', 'height']);
    expect(context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
  });

  it('normalizes fractional device pixels so they do not trigger a resize every frame', () => {
    const { canvas, context, writes } = surface();
    prepareMapCanvasFrame(canvas, context, 391, 501, 1.25);
    prepareMapCanvasFrame(canvas, context, 391, 501, 1.25);
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 488, height: 626 });
    expect(writes).toEqual(['width', 'height']);
    expect(context.setTransform).toHaveBeenLastCalledWith(1.25, 0, 0, 1.25, 0, 0);
  });
});
