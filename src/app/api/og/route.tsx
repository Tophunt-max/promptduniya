import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const revalidate = 86400;

/**
 * Open Graph card generator.
 *
 * Built with next/og so social previews are on-brand without maintaining static
 * images per page. The title is length-clamped and rendered as text, so page
 * data cannot inject markup.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawTitle = url.searchParams.get('title') ?? 'promptduniya';
  const rawSubtitle = url.searchParams.get('subtitle') ?? 'Create Better. Imagine More.';
  const badge = url.searchParams.get('badge');

  const title = rawTitle.slice(0, 110);
  const subtitle = rawSubtitle.slice(0, 140);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background:
            'linear-gradient(135deg, #1c1157 0%, #3c25ae 42%, #5b3df5 72%, #f26a12 130%)',
          fontFamily: 'sans-serif',
          color: '#ffffff',
        }}
      >
        {/* Decorative aperture rings, echoing the logo */}
        <div
          style={{
            position: 'absolute',
            right: -160,
            bottom: -200,
            width: 620,
            height: 620,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.16)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: -60,
            bottom: -100,
            width: 420,
            height: 420,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.12)',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Logo mark drawn with shapes only — no glyph, so no font fetch. */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                background: '#ffffff',
                borderRadius: 5,
                transform: 'rotate(45deg)',
                display: 'flex',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.8 }}>promptduniya</div>
            <div style={{ fontSize: 16, opacity: 0.7 }}>promptduniya.in</div>
          </div>

          {badge && (
            <div
              style={{
                marginLeft: 'auto',
                padding: '10px 20px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.18)',
                fontSize: 18,
                fontWeight: 700,
                display: 'flex',
              }}
            >
              {badge.slice(0, 24)}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 960 }}>
          <div
            style={{
              fontSize: title.length > 70 ? 54 : 66,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -2,
            }}
          >
            {title}
          </div>
          <div style={{ marginTop: 22, fontSize: 26, opacity: 0.82, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 19, opacity: 0.72 }}>
          <span>AI image prompts</span>
          <span>·</span>
          <span>Prompt generator</span>
          <span>·</span>
          <span>Built for Indian creators</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
