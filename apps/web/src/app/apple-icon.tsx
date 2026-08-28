import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Apple touch icon, generated at build time.
 *
 * Drawn entirely with CSS shapes — deliberately no text, because glyph rendering
 * in next/og would require downloading a font at build time.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #5B3DF5 0%, #7454F7 58%, #FF8A3D 100%)',
        }}
      >
        {/* Outer aperture ring */}
        <div
          style={{
            position: 'absolute',
            width: 128,
            height: 128,
            borderRadius: '50%',
            border: '6px solid rgba(255,255,255,0.55)',
            display: 'flex',
          }}
        />
        {/* Inner ring */}
        <div
          style={{
            position: 'absolute',
            width: 84,
            height: 84,
            borderRadius: '50%',
            border: '6px solid rgba(255,255,255,0.85)',
            display: 'flex',
          }}
        />
        {/* Central spark: two rotated squares forming a four-point star */}
        <div
          style={{
            position: 'absolute',
            width: 34,
            height: 34,
            background: '#ffffff',
            borderRadius: 8,
            transform: 'rotate(45deg)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 34,
            height: 34,
            background: '#ffffff',
            borderRadius: 8,
            display: 'flex',
          }}
        />
      </div>
    ),
    size,
  );
}
