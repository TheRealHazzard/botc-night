// The town, laid out as it sits at the table — evenly spaced around a
// circle starting from the top (12 o'clock), going clockwise. Kept as a
// pure function separate from the JSX so the geometry itself can be unit
// tested without rendering anything.
export function seatPosition(index, total) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    left: 50 + 41 * Math.cos(angle),
    top: 50 + 41 * Math.sin(angle),
  };
}
