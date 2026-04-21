// OpenMoji — flat hand-drawn style emoji icons (color variant)
// https://openmoji.org — license: CC BY-SA 4.0

import u1F680 from 'openmoji/color/svg/1F680.svg?url'  // 🚀 rocket
import u26A1  from 'openmoji/color/svg/26A1.svg?url'   // ⚡ lightning
import u1F31F from 'openmoji/color/svg/1F31F.svg?url'  // 🌟 star
import u1F3AE from 'openmoji/color/svg/1F3AE.svg?url'  // 🎮 game controller
import u1F3AF from 'openmoji/color/svg/1F3AF.svg?url'  // 🎯 target
import u1F3C6 from 'openmoji/color/svg/1F3C6.svg?url'  // 🏆 trophy
import u1F40D from 'openmoji/color/svg/1F40D.svg?url'  // 🐍 snake
import u1F4BB from 'openmoji/color/svg/1F4BB.svg?url'  // 💻 laptop
import u1F916 from 'openmoji/color/svg/1F916.svg?url'  // 🤖 robot
import u1F389 from 'openmoji/color/svg/1F389.svg?url'  // 🎉 party
import u1F4DA from 'openmoji/color/svg/1F4DA.svg?url'  // 📚 books
import u1F4DD from 'openmoji/color/svg/1F4DD.svg?url'  // 📝 memo/exam paper

export const OPENMOJI = {
  '1F680': u1F680,
  '26A1':  u26A1,
  '1F31F': u1F31F,
  '1F3AE': u1F3AE,
  '1F3AF': u1F3AF,
  '1F3C6': u1F3C6,
  '1F40D': u1F40D,
  '1F4BB': u1F4BB,
  '1F916': u1F916,
  '1F389': u1F389,
  '1F4DA': u1F4DA,
  '1F4DD': u1F4DD,
};

export default function OpenMoji({ hex, size = 40, className = '' }) {
  const src = OPENMOJI[hex];
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', imageRendering: 'auto' }}
      draggable={false}
    />
  );
}
