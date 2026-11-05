// A narrow bridge from the DOM to the camera, so frame-rate values never touch React state.
export const cameraControl = {
  zoomBy: (_factor: number) => {},
  fit: () => {},
  settle: () => {},
  moving: () => false,
  onViewport: null as null | ((rect: { x: number; y: number; w: number; h: number }) => void),
};
