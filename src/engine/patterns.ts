import type { Box, PatternName, Theme } from '../types';
import { glow, hexA, leaf, marigold, pt, qpt, star } from './color';

export type PatternMode = 'bg' | 'over';
export type PatternFn = (c: CanvasRenderingContext2D, b: Box, u: number, t: Theme, r: () => number, m: PatternMode) => void;

/* Procedural occasion artwork. Every pattern is drawn relative to the card box so it scales to any print size. */
export const PAT: Record<PatternName, PatternFn> = {
  confetti(c, b, u, t, r, m) {
    const n = m === 'over' ? 50 : 80;
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(b, r, m === 'over' ? 0.16 : 0.26);
      const s = u * (0.7 + r() * 1.3);
      c.save();
      c.translate(x, y);
      c.rotate(r() * 6.28);
      c.fillStyle = t.pal[i % t.pal.length];
      c.strokeStyle = t.pal[(i + 1) % t.pal.length];
      if (i % 3 === 0) {
        c.beginPath();
        c.arc(0, 0, s * 0.55, 0, 7);
        c.fill();
      } else if (i % 3 === 1) c.fillRect(-s, -s * 0.3, s * 2, s * 0.6);
      else {
        c.beginPath();
        c.moveTo(-s * 0.9, 0);
        c.bezierCurveTo(-s * 0.3, -s, s * 0.3, s, s * 0.9, 0);
        c.lineWidth = s * 0.32;
        c.stroke();
      }
      c.restore();
    }
  },
  balloons(c, b, u, t, r, m) {
    const sp =
      m === 'over'
        ? [
            [0.07, 0.16],
            [0.17, 0.3],
            [0.92, 0.14],
            [0.83, 0.28],
          ]
        : [
            [0.07, 0.2],
            [0.17, 0.36],
            [0.91, 0.16],
            [0.82, 0.32],
            [0.95, 0.45],
          ];
    sp.forEach(([fx, fy], i) => {
      const R = u * (5 + r() * 2.5),
        x = b.x + b.w * fx,
        y = b.y + b.h * fy;
      c.strokeStyle = 'rgba(60,60,60,.5)';
      c.lineWidth = u * 0.25;
      c.beginPath();
      c.moveTo(x, y + R * 1.1);
      c.bezierCurveTo(x - R * 0.6, y + R * 2, x + R * 0.6, y + R * 3, x, y + R * 4.2);
      c.stroke();
      c.fillStyle = t.pal[i % t.pal.length];
      c.beginPath();
      c.ellipse(x, y, R * 0.85, R, 0, 0, 7);
      c.fill();
      c.beginPath();
      c.moveTo(x - R * 0.18, y + R * 1.13);
      c.lineTo(x + R * 0.18, y + R * 1.13);
      c.lineTo(x, y + R * 0.95);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.45)';
      c.beginPath();
      c.ellipse(x - R * 0.3, y - R * 0.38, R * 0.16, R * 0.3, -0.5, 0, 7);
      c.fill();
    });
  },
  diya(c, b, u, t, r, m) {
    const n = Math.max(3, Math.round(b.w / (u * 16))),
      s = u * 1.1;
    for (let i = 0; i < n; i++) {
      const cx = b.x + ((i + 0.5) * b.w) / n,
        cy = b.y + b.h - u * 5;
      glow(c, cx, cy - s * 3.5, s * 7, '#FFC857', 0.55);
      c.fillStyle = '#B4461B';
      c.beginPath();
      c.moveTo(cx - s * 4, cy - s);
      c.quadraticCurveTo(cx, cy + s * 4.2, cx + s * 4, cy - s);
      c.closePath();
      c.fill();
      c.fillStyle = '#E07B39';
      c.beginPath();
      c.ellipse(cx, cy - s, s * 4, s * 0.9, 0, 0, 7);
      c.fill();
      c.fillStyle = '#FFD166';
      c.beginPath();
      c.moveTo(cx, cy - s * 6.2);
      c.quadraticCurveTo(cx + s * 1.7, cy - s * 3, cx, cy - s * 1.6);
      c.quadraticCurveTo(cx - s * 1.7, cy - s * 3, cx, cy - s * 6.2);
      c.fill();
      c.fillStyle = '#FFF5CC';
      c.beginPath();
      c.ellipse(cx, cy - s * 2.8, s * 0.5, s * 1.05, 0, 0, 7);
      c.fill();
    }
  },
  sparkle(c, b, u, t, r, m) {
    for (let i = 0; i < 28; i++) {
      const [x, y] = pt(b, r, 0.3);
      c.fillStyle = hexA(t.pal[i % t.pal.length], 0.8);
      star(c, x, y, u * (0.5 + r() * 1.2), 4, 0.28);
    }
  },
  toran(c, b, u, t, r, m) {
    const n = Math.max(3, Math.round(b.w / (u * 34))),
      seg = b.w / n,
      y0 = b.y - u * 0.5,
      sag = u * (m === 'over' ? 6 : 7.5),
      fr = u * 1.7;
    c.fillStyle = '#7A3E12';
    c.fillRect(b.x - b.e, b.y - b.e, b.w + 2 * b.e, b.e + u * 0.6);
    for (let i = 0; i < n; i++) {
      const x0 = b.x + i * seg,
        x1 = x0 + seg,
        steps = Math.max(6, Math.round(seg / (fr * 1.8)));
      for (let k = 0; k <= steps; k++) {
        const [x, y] = qpt(x0, y0, x0 + seg / 2, y0 + sag * 2, x1, y0, k / steps);
        marigold(c, x, y, fr, k % 2 ? '#FFB000' : '#F26B0F');
      }
    }
    for (let i = 0; i <= n; i++) {
      const x = b.x + i * seg;
      for (let k = 1; k <= 3; k++) marigold(c, x, y0 + k * fr * 1.8, fr * 0.95, k % 2 ? '#F26B0F' : '#FFB000');
      leaf(c, x, y0 + fr * 6.4, fr * 3.6, Math.PI / 2, '#2D7A3A');
    }
  },
  splash(c, b, u, t, r, m) {
    const sp =
      m === 'over'
        ? [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ]
        : [
            [0.05, 0.1],
            [0.92, 0.12],
            [0.12, 0.92],
            [0.88, 0.88],
            [0.5, 0.02],
            [0.02, 0.55],
            [0.98, 0.55],
          ];
    sp.forEach(([fx, fy], i) => {
      const x = b.x + b.w * fx,
        y = b.y + b.h * fy,
        R = u * (m === 'over' ? 24 : 26) * (0.8 + r() * 0.5),
        col = t.pal[i % t.pal.length];
      glow(c, x, y, R, col, 0.85);
      for (let k = 0; k < 12; k++) {
        const a = r() * 6.28,
          d = R * (0.45 + r() * 0.75);
        c.fillStyle = hexA(col, 0.85);
        c.beginPath();
        c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, u * (0.4 + r() * 1.3), 0, 7);
        c.fill();
      }
    });
  },
  rakhi(c, b, u, t, r, m) {
    const y = b.y + b.h * 0.86;
    (
      [
        ['#C1121F', 0],
        ['#D4A017', u * 0.9],
      ] as [string, number][]
    ).forEach(([col, o]) => {
      c.strokeStyle = col;
      c.lineWidth = u * 0.6;
      c.beginPath();
      for (let x = b.x - b.e; x <= b.x + b.w + b.e; x += u) {
        c.lineTo(x, y + o + Math.sin(x / (u * 6)) * u * 0.8);
      }
      c.stroke();
    });
    const x = b.x + b.w * 0.18,
      R = u * 8;
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14;
      c.save();
      c.translate(x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62);
      c.rotate(a);
      c.fillStyle = i % 2 ? '#E9B949' : '#F4D35E';
      c.beginPath();
      c.ellipse(0, 0, R * 0.42, R * 0.2, 0, 0, 7);
      c.fill();
      c.restore();
    }
    c.fillStyle = '#C1121F';
    c.beginPath();
    c.arc(x, y, R * 0.5, 0, 7);
    c.fill();
    c.fillStyle = '#FFFFFF';
    for (let i = 0; i < 10; i++) {
      const a = i * 0.628;
      c.beginPath();
      c.arc(x + Math.cos(a) * R * 0.36, y + Math.sin(a) * R * 0.36, R * 0.065, 0, 7);
      c.fill();
    }
    c.fillStyle = '#FFE8A3';
    c.beginPath();
    c.arc(x, y, R * 0.18, 0, 7);
    c.fill();
  },
  crescent(c, b, u, t, r, m) {
    const x = b.x + b.w * 0.84,
      y = b.y + b.h * 0.24,
      R = u * 9;
    glow(c, x, y, R * 2.3, t.pal[0], 0.3);
    c.save();
    c.beginPath();
    c.arc(x, y, R, 0, 7);
    c.clip();
    c.beginPath();
    c.rect(x - R * 2, y - R * 2, R * 4, R * 4);
    c.arc(x + R * 0.42, y - R * 0.22, R * 0.86, 0, 7);
    c.fillStyle = t.pal[0];
    c.fill('evenodd');
    c.restore();
    for (let i = 0; i < 20; i++) {
      const [sx, sy] = pt(b, r, 0.28);
      if (sy > b.y + b.h * 0.62) continue;
      c.fillStyle = hexA(t.pal[1], 0.85);
      star(c, sx, sy, u * (0.5 + r() * 1.1), 5, 0.45);
    }
    (m === 'over' ? [0.07, 0.17] : [0.08, 0.18, 0.28]).forEach((f, i) => {
      const lx = b.x + b.w * f,
        len = b.h * (0.1 + ((i * 37) % 10) / 60),
        by = b.y + len;
      c.strokeStyle = hexA(t.pal[0], 0.8);
      c.lineWidth = u * 0.25;
      c.beginPath();
      c.moveTo(lx, b.y - b.e);
      c.lineTo(lx, by);
      c.stroke();
      glow(c, lx, by + u * 3, u * 6, '#FFD27A', 0.45);
      c.fillStyle = t.pal[0];
      c.fillRect(lx - u * 1.2, by - u * 0.6, u * 2.4, u * 0.9);
      c.beginPath();
      c.moveTo(lx - u * 2, by + u * 0.3);
      c.lineTo(lx + u * 2, by + u * 0.3);
      c.lineTo(lx + u * 2.6, by + u * 4.5);
      c.lineTo(lx, by + u * 6.4);
      c.lineTo(lx - u * 2.6, by + u * 4.5);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,246,214,.92)';
      c.beginPath();
      c.moveTo(lx - u * 1, by + u * 1.3);
      c.lineTo(lx + u * 1, by + u * 1.3);
      c.lineTo(lx + u * 1.4, by + u * 4.2);
      c.lineTo(lx, by + u * 5.2);
      c.lineTo(lx - u * 1.4, by + u * 4.2);
      c.closePath();
      c.fill();
    });
  },
  snow(c, b, u, t, r, m) {
    const n = m === 'over' ? 70 : 110;
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(b, r, m === 'over' ? 0.2 : 1);
      c.fillStyle = hexA('#FFFFFF', 0.35 + r() * 0.55);
      c.beginPath();
      c.arc(x, y, u * (0.25 + r() * 0.9), 0, 7);
      c.fill();
    }
  },
  stars(c, b, u, t, r, m) {
    for (let i = 0; i < 30; i++) {
      const [x, y] = pt(b, r, m === 'over' ? 0.16 : 0.3);
      c.fillStyle = hexA(t.pal[i % t.pal.length], 0.85);
      star(c, x, y, u * (0.5 + r() * 1.4), 5, 0.45);
    }
  },
  kites(c, b, u, t, r, m) {
    const sp =
      m === 'over'
        ? [
            [0.1, 0.18],
            [0.86, 0.16],
            [0.93, 0.42],
          ]
        : [
            [0.12, 0.2],
            [0.84, 0.16],
            [0.92, 0.46],
            [0.26, 0.4],
            [0.62, 0.1],
          ];
    sp.forEach(([fx, fy], i) => {
      const R = u * (5.5 + r() * 3),
        x = b.x + b.w * fx,
        y = b.y + b.h * fy,
        a = r() * 0.6 - 0.3;
      c.strokeStyle = 'rgba(0,0,0,.3)';
      c.lineWidth = u * 0.15;
      c.beginPath();
      c.moveTo(x, y + R);
      c.quadraticCurveTo(x - R * 2, y + R * 6, b.x - b.e, b.y + b.h + b.e);
      c.stroke();
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = t.pal[i % t.pal.length];
      c.beginPath();
      c.moveTo(0, -R);
      c.lineTo(-R * 0.8, 0);
      c.lineTo(0, R * 1.1);
      c.closePath();
      c.fill();
      c.fillStyle = t.pal[(i + 2) % t.pal.length];
      c.beginPath();
      c.moveTo(0, -R);
      c.lineTo(R * 0.8, 0);
      c.lineTo(0, R * 1.1);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,.3)';
      c.lineWidth = u * 0.2;
      c.beginPath();
      c.moveTo(0, -R);
      c.lineTo(0, R * 1.1);
      c.moveTo(-R * 0.8, 0);
      c.quadraticCurveTo(0, -R * 0.4, R * 0.8, 0);
      c.stroke();
      c.fillStyle = t.pal[(i + 1) % t.pal.length];
      c.beginPath();
      c.moveTo(0, R * 1.05);
      c.lineTo(-R * 0.25, R * 1.45);
      c.lineTo(R * 0.25, R * 1.45);
      c.closePath();
      c.fill();
      c.restore();
    });
  },
  rain(c, b, u, t, r, m) {
    const n = m === 'over' ? 90 : 140;
    c.lineWidth = u * 0.22;
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(b, r, 1),
        len = u * (2.5 + r() * 3);
      c.strokeStyle = hexA('#FFFFFF', 0.18 + r() * 0.3);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - len * 0.3, y + len);
      c.stroke();
    }
    if (m !== 'over')
      for (let i = 0; i < 6; i++) {
        const x = b.x + r() * b.w,
          y = b.y + b.h * (0.86 + r() * 0.1),
          rx = u * (2 + r() * 3);
        c.strokeStyle = hexA('#FFFFFF', 0.35);
        c.beginPath();
        c.ellipse(x, y, rx, rx * 0.3, 0, 0, 7);
        c.stroke();
      }
  },
  leaves(c, b, u, t, r, m) {
    const n = m === 'over' ? 16 : 24;
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(b, r, 0.24);
      leaf(c, x, y, u * (3 + r() * 3), r() * 6.28, t.pal[i % t.pal.length]);
    }
  },
  sunrays(c, b, u, t, r, m) {
    const cx = b.x + b.w * 0.9,
      cy = b.y + b.h * 0.12,
      Rm = Math.hypot(b.w, b.h);
    c.fillStyle = `rgba(255,255,255,${m === 'over' ? 0.08 : 0.15})`;
    for (let i = 0; i < 18; i += 2) {
      const a0 = (i * Math.PI * 2) / 18;
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, Rm, a0, a0 + (Math.PI * 2) / 18);
      c.closePath();
      c.fill();
    }
    glow(c, cx, cy, u * 26, '#FFF3B0', 0.75);
    c.fillStyle = t.pal[0];
    c.beginPath();
    c.arc(cx, cy, u * 10, 0, 7);
    c.fill();
  },
  flowers(c, b, u, t, r, m) {
    const n = m === 'over' ? 26 : 36;
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(b, r, m === 'over' ? 0.15 : 0.24),
        s = u * (1.2 + r() * 1.6),
        rot = r() * 6.28;
      c.fillStyle = t.pal[i % 2];
      for (let k = 0; k < 5; k++) {
        const a = rot + k * 1.2566;
        c.beginPath();
        c.ellipse(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.55, s * 0.33, a, 0, 7);
        c.fill();
      }
      c.fillStyle = '#C45A00';
      c.beginPath();
      c.arc(x, y, s * 0.3, 0, 7);
      c.fill();
    }
  },
  mandala(c, b, u, t, r, m) {
    [
      [0, 1],
      [1, 0],
    ].forEach(([fx, fy], ai) => {
      const x = b.x + b.w * fx,
        y = b.y + b.h * fy,
        R = u * (m === 'over' ? 24 : 34),
        st = R / 5;
      for (let k = 4; k >= 0; k--) {
        const rr = st * (k + 1),
          n = 8 + k * 4,
          col = t.pal[(k + ai) % t.pal.length];
        c.fillStyle = col;
        for (let i = 0; i < n; i++) {
          const a = (i * Math.PI * 2) / n + ((k % 2) * Math.PI) / n;
          c.save();
          c.translate(x + Math.cos(a) * (rr - st * 0.32), y + Math.sin(a) * (rr - st * 0.32));
          c.rotate(a);
          c.beginPath();
          c.ellipse(0, 0, st * 0.42, st * 0.2, 0, 0, 7);
          c.fill();
          c.restore();
        }
        c.fillStyle = t.pal[(k + ai + 1) % t.pal.length];
        c.beginPath();
        c.arc(x, y, rr - st * 0.72, 0, 7);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,.85)';
        const dn = n;
        for (let i = 0; i < dn; i++) {
          const a = (i * Math.PI * 2) / dn;
          c.beginPath();
          c.arc(x + Math.cos(a) * (rr - st * 0.72), y + Math.sin(a) * (rr - st * 0.72), st * 0.06, 0, 7);
          c.fill();
        }
      }
    });
  },
  kolam(c, b, u, t, r, m) {
    const sp = u * 4.2;
    [
      [b.x + u * 4, b.y + u * 4],
      [b.x + b.w - u * 4 - sp * 4, b.y + b.h - u * 4 - sp * 4],
    ].forEach(([ox, oy]) => {
      c.strokeStyle = t.pal[0];
      c.lineWidth = u * 0.35;
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++) {
          if (Math.abs(i - 2) + Math.abs(j - 2) > 2) continue;
          const x = ox + i * sp,
            y = oy + j * sp,
            h = sp * 0.5;
          c.beginPath();
          c.moveTo(x, y - h);
          c.quadraticCurveTo(x + h * 0.15, y - h * 0.15, x + h, y);
          c.quadraticCurveTo(x + h * 0.15, y + h * 0.15, x, y + h);
          c.quadraticCurveTo(x - h * 0.15, y + h * 0.15, x - h, y);
          c.quadraticCurveTo(x - h * 0.15, y - h * 0.15, x, y - h);
          c.stroke();
          c.fillStyle = t.deep;
          c.beginPath();
          c.arc(x, y, u * 0.45, 0, 7);
          c.fill();
        }
      c.beginPath();
      c.arc(ox + 2 * sp, oy + 2 * sp, sp * 2.9, 0, 7);
      c.stroke();
    });
  },
  peacock(c, b, u, t, r, m) {
    const ox = b.x + b.w + b.e,
      oy = b.y + b.h + b.e,
      n = 6;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 1.02 + (i / (n - 1)) * Math.PI * 0.46,
        L = u * (32 + r() * 8) * (m === 'over' ? 0.8 : 1),
        ex = ox + Math.cos(a) * L,
        ey = oy + Math.sin(a) * L;
      c.strokeStyle = hexA('#2A9D8F', 0.55);
      c.lineWidth = u * 0.18;
      for (let k = 4; k < 18; k++) {
        const f = k / 20,
          px = ox + Math.cos(a) * L * f,
          py = oy + Math.sin(a) * L * f,
          bl = u * (1.2 + f * 2.4);
        [1, -1].forEach((sg) => {
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(px + Math.cos(a + sg * 0.7) * bl, py + Math.sin(a + sg * 0.7) * bl);
          c.stroke();
        });
      }
      c.strokeStyle = '#C9B458';
      c.lineWidth = u * 0.3;
      c.beginPath();
      c.moveTo(ox, oy);
      c.lineTo(ex, ey);
      c.stroke();
      c.save();
      c.translate(ex, ey);
      c.rotate(a);
      (
        [
          ['#2A9D8F', 4.4, 3.1],
          ['#E9C46A', 3.3, 2.4],
          ['#1D4ED8', 2.4, 1.8],
          ['#0B1D51', 1.3, 1.05],
        ] as [string, number, number][]
      ).forEach(([col, rx, ry]) => {
        c.fillStyle = col;
        c.beginPath();
        c.ellipse(0, 0, u * rx, u * ry, 0, 0, 7);
        c.fill();
      });
      c.restore();
    }
  },
  tricolor(c, b, u, t, r, m) {
    const h = u * (m === 'over' ? 4.5 : 7);
    c.fillStyle = '#FF9933';
    c.beginPath();
    c.moveTo(b.x - b.e, b.y - b.e);
    c.lineTo(b.x + b.w + b.e, b.y - b.e);
    for (let x = b.x + b.w + b.e; x >= b.x - b.e; x -= u) c.lineTo(x, b.y + h + Math.sin((x / b.w) * Math.PI * 2) * u * 1.2);
    c.closePath();
    c.fill();
    c.fillStyle = '#138808';
    c.beginPath();
    c.moveTo(b.x - b.e, b.y + b.h + b.e);
    c.lineTo(b.x + b.w + b.e, b.y + b.h + b.e);
    for (let x = b.x + b.w + b.e; x >= b.x - b.e; x -= u)
      c.lineTo(x, b.y + b.h - h + Math.sin((x / b.w) * Math.PI * 2) * u * 1.2);
    c.closePath();
    c.fill();
    if (m !== 'over') {
      const x = b.x + b.w * 0.84,
        y = b.y + b.h * 0.5,
        R = u * 18;
      c.strokeStyle = hexA('#000080', 0.12);
      c.lineWidth = u * 0.9;
      c.beginPath();
      c.arc(x, y, R, 0, 7);
      c.stroke();
      c.lineWidth = u * 0.35;
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI) / 12;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
        c.stroke();
      }
      c.fillStyle = hexA('#000080', 0.12);
      c.beginPath();
      c.arc(x, y, R * 0.16, 0, 7);
      c.fill();
    }
  },
  wheat(c, b, u, t, r, m) {
    const n = Math.round(b.w / (u * 3.6)),
      base = b.y + b.h + b.e;
    for (let i = 0; i < n; i++) {
      const x = b.x + ((i + 0.5) * b.w) / n + (r() - 0.5) * u,
        H = u * (14 + r() * 12) + b.e,
        lean = (r() - 0.5) * u * 4,
        tx = x + lean,
        ty = base - H;
      c.strokeStyle = '#8A5A00';
      c.lineWidth = u * 0.35;
      c.beginPath();
      c.moveTo(x, base);
      c.quadraticCurveTo(x, base - H * 0.5, tx, ty);
      c.stroke();
      for (let k = 0; k < 7; k++) {
        const f = 0.64 + k * 0.055,
          [gx, gy] = qpt(x, base, x, base - H * 0.5, tx, ty, Math.min(f, 1));
        c.save();
        c.translate(gx, gy);
        c.rotate(k % 2 ? 0.5 : -0.5);
        c.fillStyle = k % 2 ? '#C8961E' : '#B07D1A';
        c.beginPath();
        c.ellipse(0, 0, u * 0.55, u * 1.15, 0, 0, 7);
        c.fill();
        c.restore();
      }
    }
  },
  sparks(c, b, u, t, r, m) {
    glow(c, b.x + b.w * 0.5, b.y + b.h + b.e, b.w * 0.45, '#FF7A00', m === 'over' ? 0.4 : 0.55);
    for (let i = 0; i < 70; i++) {
      const x = b.x + b.w * (0.5 + (r() - 0.5) * (0.3 + r() * 0.9)),
        f = Math.pow(r(), 0.7) * (m === 'over' ? 0.5 : 0.9),
        y = b.y + b.h * (1 - f);
      c.fillStyle = hexA(t.pal[i % 3], 0.95 - f * 0.7);
      c.beginPath();
      c.arc(x, y, u * (0.2 + r() * 0.6), 0, 7);
      c.fill();
    }
  },
  bunting(c, b, u, t, r, m) {
    const W = b.w + 2 * b.e,
      sw = W / 2;
    for (let s = 0; s < 2; s++) {
      const x0 = b.x - b.e + s * sw,
        x1 = x0 + sw,
        y0 = b.y + u * 1.5,
        sag = u * 6;
      c.strokeStyle = hexA(t.deep, 0.6);
      c.lineWidth = u * 0.25;
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(x0 + sw / 2, y0 + sag * 2, x1, y0);
      c.stroke();
      const n = 9;
      for (let k = 0; k < n; k++) {
        const t0 = (k + 0.2) / n,
          t1 = (k + 0.8) / n,
          [ax, ay] = qpt(x0, y0, x0 + sw / 2, y0 + sag * 2, x1, y0, t0),
          [bx, by] = qpt(x0, y0, x0 + sw / 2, y0 + sag * 2, x1, y0, t1),
          mx = (ax + bx) / 2,
          my = (ay + by) / 2,
          ang = Math.atan2(by - ay, bx - ax);
        c.fillStyle = t.pal[(k + s) % t.pal.length];
        c.beginPath();
        c.moveTo(ax, ay);
        c.lineTo(bx, by);
        c.lineTo(mx - Math.sin(ang) * u * 4.5 * -1, my + Math.cos(ang) * u * 4.5);
        c.closePath();
        c.fill();
      }
    }
  },
};
