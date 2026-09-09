// A deterministic badge so returning players are visually distinct without
// any photo — same name always lands on the same color and initial.
const AVATAR_COLORS = ['#6e2126', '#5c4c26', '#2c4258', '#3d2a4a', '#1f4a3d', '#4a3524', '#8e2226', '#3c5875'];

export function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
